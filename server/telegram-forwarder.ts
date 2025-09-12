import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { Api } from 'telegram/tl';
import { FloodWaitError } from 'telegram/errors';
import { logger } from './telegram-bot/logger';
import type { ForwardConfig, ForwardJob } from '@shared/schema';

// Map to store active forwarding jobs
const activeJobs = new Map<string, ForwardJobManager>();

class ForwardJobManager {
  private client: TelegramClient | null = null;
  private isRunning = false;
  private shouldStop = false;
  private logs: string[] = [];
  
  constructor(
    public readonly id: string,
    public readonly config: ForwardConfig,
    private readonly sessionString: string,
    private readonly apiId: number,
    private readonly apiHash: string,
    private readonly onUpdate: (job: Partial<ForwardJob>) => void
  ) {}

  private addLog(message: string) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    this.logs.push(logMessage);
    logger.info(`[Forwarder ${this.id}] ${message}`);
    
    // Keep only last 1000 log entries
    if (this.logs.length > 1000) {
      this.logs = this.logs.slice(-1000);
    }

    this.onUpdate({ logs: [...this.logs] });
  }

  private intify(value: string | number): number | string {
    if (typeof value === 'string') {
      const parsed = parseInt(value);
      return isNaN(parsed) ? value : parsed;
    }
    return value;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Job is already running');
    }

    this.isRunning = true;
    this.shouldStop = false;
    this.addLog('Starting forwarding job...');

    try {
      // Initialize Telegram client
      const session = new StringSession(this.sessionString);
      this.client = new TelegramClient(session, this.apiId, this.apiHash, {
        connectionRetries: 5,
        retryDelay: 2000,
      });

      await this.client.connect();
      this.addLog('Connected to Telegram');

      this.onUpdate({
        status: 'running',
        updatedAt: new Date().toISOString(),
      });

      // Use chat IDs directly like Python script (no getEntity calls)
      const fromChatId = this.intify(this.config.fromChatId);
      const toChatId = this.intify(this.config.toChatId);
      
      this.addLog(`From chat ID: ${fromChatId}`);
      this.addLog(`To chat ID: ${toChatId}`);
      this.addLog(`Starting from offset: ${this.config.offsetFrom}, ending at: ${this.config.offsetTo || 'latest'}`);

      let messagesProcessed = 0;
      let lastId = 0;

      this.addLog(`Starting message iteration from offset ${this.config.offsetFrom}...`);
      
      try {
        this.addLog(`Starting iteration from chat ${fromChatId}`);
        
        // Skip entity check, go directly to getting messages like Python script
        this.addLog(`Attempting to get messages directly (Python approach)...`);
        
        this.addLog(`Getting messages from chat ${fromChatId}...`);
        
        let messages;
        try {
          // Add timeout to prevent hanging
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('getMessages timeout after 15 seconds')), 15000)
          );
          
          const getMessagesPromise = this.client.getMessages(fromChatId, {
            offsetId: this.config.offsetFrom,
            reverse: true,
            limit: 10
          });
          
          messages = await Promise.race([getMessagesPromise, timeoutPromise]) as any;
          this.addLog(`✅ Found ${messages.length} messages to process`);
          
          if (messages.length === 0) {
            this.addLog(`⚠️ No messages found. Chat might be empty or offset too high.`);
            return;
          }
        } catch (msgError: any) {
          this.addLog(`❌ Error getting messages: ${msgError.message}`);
          // Try alternative approach - use iter_messages like Python
          this.addLog(`Trying iter_messages approach...`);
          const iterator = this.client.iterMessages(fromChatId, {
            reverse: true,
            offsetId: this.config.offsetFrom,
            limit: 5
          });
          
          messages = [];
          for await (const msg of iterator) {
            messages.push(msg);
            if (messages.length >= 5) break; // Just get first 5
          }
          this.addLog(`Found ${messages.length} messages via iterator`);
        }
        
        for (const message of messages) {
          if (this.shouldStop) {
            this.addLog('Stopping due to user request');
            break;
          }

          // Python: if isinstance(message, MessageService): continue
          if (message.className?.includes('MessageService')) {
            continue;
          }

          try {
            // Python: await client.send_message(intify(to_chat), message)
            await this.client.sendMessage(toChatId, {
              message: message.message || '',
              file: message.media || undefined
            });
            
            lastId = message.id;
            messagesProcessed++;
            
            this.addLog(`forwarding message with id = ${lastId}`);

            this.onUpdate({
              currentOffset: message.id,
              progress: Math.round((messagesProcessed / messages.length) * 100),
              updatedAt: new Date().toISOString(),
            });

            // Small delay
            await new Promise(resolve => setTimeout(resolve, 100));

          } catch (error) {
            if (error instanceof FloodWaitError) {
              const waitTime = error.seconds;
              this.addLog(`Rate limited, waiting ${waitTime} seconds...`);
              await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
              
              // Retry  
              await this.client!.sendMessage(toChatId, {
                message: message.message || '',
                file: message.media || undefined
              });
              lastId = message.id;
              messagesProcessed++;
              this.addLog(`Forwarded message ${message.id} after wait`);
            } else {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              this.addLog(`Error forwarding message ${message.id}: ${errorMessage}`);
            }
          }
        }
        
      } catch (iterError) {
        const errorMessage = iterError instanceof Error ? iterError.message : 'Unknown error';
        this.addLog(`Error getting messages: ${errorMessage}`);
      }

      if (this.shouldStop) {
        this.addLog('Forwarding stopped by user');
        this.onUpdate({
          status: 'paused',
          updatedAt: new Date().toISOString(),
        });
      } else {
        this.addLog(`Forwarding completed. Processed ${messagesProcessed} messages.`);
        this.onUpdate({
          status: 'completed',
          progress: 100,
          updatedAt: new Date().toISOString(),
        });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.addLog(`Job failed: ${errorMessage}`);
      this.onUpdate({
        status: 'error',
        error: errorMessage,
        updatedAt: new Date().toISOString(),
      });
    } finally {
      this.isRunning = false;
      if (this.client) {
        await this.client.disconnect();
        this.client = null;
      }
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      throw new Error('Job is not running');
    }

    this.shouldStop = true;
    this.addLog('Stopping forwarding job...');
  }

  getStatus(): Pick<ForwardJob, 'status' | 'logs'> {
    return {
      status: this.isRunning ? 'running' : 'idle',
      logs: [...this.logs],
    };
  }

  getLogs(): string[] {
    return [...this.logs];
  }
}

export class TelegramForwarder {
  static async startForwarding(
    config: ForwardConfig,
    sessionString: string,
    apiId: number,
    apiHash: string,
    onUpdate: (jobId: string, update: Partial<ForwardJob>) => void
  ): Promise<string> {
    const jobId = `${config.name}_${Date.now()}`;
    
    if (activeJobs.has(jobId)) {
      throw new Error('Job with this ID is already running');
    }

    const jobManager = new ForwardJobManager(
      jobId,
      config,
      sessionString,
      apiId,
      apiHash,
      (update) => onUpdate(jobId, update)
    );

    activeJobs.set(jobId, jobManager);

    // Start the job in background
    jobManager.start().finally(() => {
      // Clean up completed/failed jobs after 1 hour
      setTimeout(() => {
        activeJobs.delete(jobId);
      }, 60 * 60 * 1000);
    });

    return jobId;
  }

  static async stopForwarding(jobId: string): Promise<void> {
    const jobManager = activeJobs.get(jobId);
    if (!jobManager) {
      throw new Error('Job not found');
    }

    await jobManager.stop();
  }

  static getJobStatus(jobId: string): Pick<ForwardJob, 'status' | 'logs'> | null {
    const jobManager = activeJobs.get(jobId);
    return jobManager ? jobManager.getStatus() : null;
  }

  static getJobLogs(jobId: string): string[] {
    const jobManager = activeJobs.get(jobId);
    return jobManager ? jobManager.getLogs() : [];
  }

  static getAllJobs(): string[] {
    return Array.from(activeJobs.keys());
  }

  static stopAllJobs(): Promise<void[]> {
    const stopPromises = Array.from(activeJobs.values()).map(manager => 
      manager.stop().catch(error => {
        logger.error(`Failed to stop job ${manager.id}: ${error}`);
      })
    );
    
    return Promise.all(stopPromises);
  }
}