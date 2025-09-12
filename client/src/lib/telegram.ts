
// Telegram API integration using gramjs

import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { Api } from 'telegram/tl';
import type { TelegramSession, Chat, Message } from '@shared/schema';

// Type declarations for Telegram entities
interface TelegramUser {
  id: any;
  firstName?: string;
  lastName?: string;
  username?: string;
}

interface TelegramChannel {
  id: any;
  title: string;
  username?: string;
  participantsCount?: number;
  broadcast?: boolean;
  accessHash?: any;
}

interface TelegramChat {
  id: any;
  title: string;
  participantsCount?: number;
}

type TelegramEntity = TelegramUser | TelegramChannel | TelegramChat;

export class TelegramManager {
  private client: TelegramClient | null = null;
  private session: TelegramSession | null = null;

  constructor() {
    // Initialize with empty session
  }

  async initialize(apiId: number, apiHash: string, sessionString?: string) {
    try {
      const stringSession = new StringSession(sessionString || '');
      this.client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
        useWSS: true, // Use WebSocket Secure for browser
        timeout: 30000,
      });

      return this.client;
    } catch (error) {
      console.error('Failed to initialize Telegram client:', error);
      throw new Error(`Initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async authenticate(phoneNumber: string, apiId: number, apiHash: string) {
    try {
      if (!this.client) {
        await this.initialize(apiId, apiHash);
      }

      if (!this.client) {
        throw new Error('Failed to initialize Telegram client');
      }

      await this.client.start({
        phoneNumber: async () => phoneNumber,
        password: async () => {
          return new Promise((resolve, reject) => {
            // Send event to request password
            window.dispatchEvent(new CustomEvent('telegram:password-required'));
            
            // Listen for password response
            const handlePasswordResponse = (event: CustomEvent) => {
              window.removeEventListener('telegram:password-response', handlePasswordResponse as EventListener);
              resolve(event.detail.password);
            };
            
            window.addEventListener('telegram:password-response', handlePasswordResponse as EventListener);
            
            // Timeout after 60 seconds
            setTimeout(() => {
              window.removeEventListener('telegram:password-response', handlePasswordResponse as EventListener);
              reject(new Error('Password input timeout'));
            }, 60000);
          });
        },
        phoneCode: async () => {
          return new Promise((resolve, reject) => {
            // Send event to request code
            window.dispatchEvent(new CustomEvent('telegram:code-required'));
            
            // Listen for code response  
            const handleCodeResponse = (event: CustomEvent) => {
              window.removeEventListener('telegram:code-response', handleCodeResponse as EventListener);
              resolve(event.detail.code);
            };
            
            window.addEventListener('telegram:code-response', handleCodeResponse as EventListener);
            
            // Timeout after 60 seconds
            setTimeout(() => {
              window.removeEventListener('telegram:code-response', handleCodeResponse as EventListener);
              reject(new Error('Code input timeout'));
            }, 60000);
          });
        },
        onError: (err) => {
          console.error('Telegram authentication error:', err);
          throw err;
        },
      });

      // Save session
      const sessionString = String(this.client.session.save());
      const me = await this.client.getMe() as TelegramUser;
      
      this.session = {
        sessionString,
        apiId,
        apiHash,
        phoneNumber,
        userId: me.id?.toString(),
        firstName: me.firstName || '',
        lastName: me.lastName || '',
      };

      return this.session;
    } catch (error) {
      console.error('Authentication failed:', error);
      throw new Error(`Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async loadSession(session: TelegramSession) {
    try {
      this.session = session;
      await this.initialize(session.apiId, session.apiHash, session.sessionString);
      
      if (!this.client) {
        throw new Error('Failed to initialize client');
      }

      await this.client.connect();
      const isAuthorized = await this.client.checkAuthorization();
      
      if (!isAuthorized) {
        throw new Error('Session is no longer valid');
      }
      
      return isAuthorized;
    } catch (error) {
      console.error('Failed to load session:', error);
      throw new Error(`Session loading failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getChats(): Promise<Chat[]> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    try {
      const result = await this.client.getDialogs({
        limit: 100,
      });

      return result.map((dialog): Chat => {
        const entity = dialog.entity as TelegramEntity;
        let type: 'channel' | 'group' | 'private' = 'private';
        let participantCount: number | undefined;
        let username: string | undefined;
        let accessHash: string | undefined;

        if (entity && 'broadcast' in entity) {
          // It's a Channel
          type = entity.broadcast ? 'channel' : 'group';
          participantCount = entity.participantsCount;
          username = entity.username;
          accessHash = entity.accessHash?.toString();
        } else if (entity && 'participantsCount' in entity && !('firstName' in entity)) {
          // It's a Chat (group)
          type = 'group';
          participantCount = entity.participantsCount;
        } else if (entity && 'firstName' in entity) {
          // It's a User (private chat)
          type = 'private';
          username = entity.username;
        }

        return {
          id: entity?.id?.toString() || '0',
          title: dialog.title || 'Unknown',
          type,
          participantCount,
          username,
          accessHash,
        };
      });
    } catch (error) {
      console.error('Failed to get chats:', error);
      throw new Error(`Failed to fetch chats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getMessages(chatId: string, options: {
    limit?: number;
    offsetId?: number;
    minId?: number;
    maxId?: number;
    fromDate?: Date;
    toDate?: Date;
  } = {}): Promise<Message[]> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    try {
      const entity = await this.client.getEntity(parseInt(chatId));
      
      const messages = await this.client.getMessages(entity, {
        limit: options.limit || 100,
        offsetId: options.offsetId,
        minId: options.minId,
        maxId: options.maxId,
        offsetDate: options.fromDate ? Math.floor(options.fromDate.getTime() / 1000) : undefined,
      });

      return messages
        .filter(msg => {
          if (options.toDate && msg.date > Math.floor(options.toDate.getTime() / 1000)) {
            return false;
          }
          return true;
        })
        .map((msg): Message => {
          const hasMedia = !!(msg.media);
          let mediaType: string | undefined;
          let mediaSize: number | undefined;
          let mediaFileName: string | undefined;

          if (msg.media) {
            if (msg.media.className === 'MessageMediaDocument') {
              const doc = msg.media.document;
              if (doc && doc.className === 'Document') {
                mediaSize = Number(doc.size);
                mediaFileName = doc.attributes?.find(attr => 
                  attr.className === 'DocumentAttributeFilename'
                )?.fileName;
                
                if (doc.mimeType?.startsWith('video/')) {
                  mediaType = 'video';
                } else if (doc.mimeType?.startsWith('image/')) {
                  mediaType = 'image';
                } else {
                  mediaType = 'document';
                }
              }
            } else if (msg.media.className === 'MessageMediaPhoto') {
              mediaType = 'photo';
            }
          }

          return {
            id: msg.id,
            chatId,
            text: msg.message || '',
            date: new Date(msg.date * 1000).toISOString(),
            senderId: msg.senderId?.toString(),
            senderName: (msg.sender as any)?.firstName || (msg.sender as any)?.title || 'Unknown',
            hasMedia,
            mediaType,
            mediaSize,
            mediaFileName,
          };
        });
    } catch (error) {
      console.error('Failed to get messages:', error);
      throw new Error(`Failed to fetch messages: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getMessageById(chatId: string, messageId: number): Promise<Message | null> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    try {
      const entity = await this.client.getEntity(parseInt(chatId));
      const messages = await this.client.getMessages(entity, {
        ids: [messageId],
      });

      if (messages.length === 0) {
        return null;
      }

      const msg = messages[0];
      return {
        id: msg.id,
        chatId,
        text: msg.message || '',
        date: new Date(msg.date * 1000).toISOString(),
        senderId: msg.senderId?.toString(),
        senderName: (msg.sender as any)?.firstName || (msg.sender as any)?.title || 'Unknown',
        hasMedia: !!(msg.media),
        mediaType: msg.media?.className,
        mediaSize: undefined,
        mediaFileName: undefined,
      };
    } catch (error) {
      console.error('Failed to get message by ID:', error);
      return null;
    }
  }

  async countMessages(chatId: string, fromDate?: Date, toDate?: Date): Promise<number> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    try {
      const entity = await this.client.getEntity(parseInt(chatId));
      
      // Get a sample of messages to estimate total
      const messages = await this.client.getMessages(entity, {
        limit: 1000,
        offsetDate: fromDate ? Math.floor(fromDate.getTime() / 1000) : undefined,
      });

      // Filter by date range if specified
      let count = 0;
      for (const msg of messages) {
        const msgDate = new Date(msg.date * 1000);
        if (fromDate && msgDate < fromDate) continue;
        if (toDate && msgDate > toDate) continue;
        count++;
      }

      return count;
    } catch (error) {
      console.error('Failed to count messages:', error);
      throw new Error(`Failed to count messages: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async downloadFile(messageId: number, chatId: string, onProgress?: (progress: number, speed: number) => void): Promise<Uint8Array> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    try {
      const entity = await this.client.getEntity(parseInt(chatId));
      const messages = await this.client.getMessages(entity, {
        ids: [messageId],
      });

      if (messages.length === 0 || !messages[0].media) {
        throw new Error('Message not found or has no media');
      }

      const message = messages[0];
      
      return new Promise((resolve, reject) => {
        let lastProgress = 0;
        let lastTime = Date.now();

        this.client!.downloadMedia(message, {
          progressCallback: (received: any, total: any) => {
            try {
              const receivedNum = Number(received);
              const totalNum = Number(total);
              const progress = (receivedNum / totalNum) * 100;
              const now = Date.now();
              const timeDiff = (now - lastTime) / 1000; // seconds
              const bytesDiff = receivedNum - lastProgress;
              const speed = bytesDiff / timeDiff; // bytes per second
              
              lastProgress = receivedNum;
              lastTime = now;
              
              if (onProgress) {
                onProgress(progress, speed);
              }
            } catch (err) {
              console.warn('Progress callback error:', err);
            }
          }
        }).then((result) => {
          if (result instanceof Uint8Array) {
            resolve(result);
          } else {
            reject(new Error('Unexpected download result type'));
          }
        }).catch(reject);
      });
    } catch (error) {
      console.error('Failed to download file:', error);
      throw new Error(`Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  getSession(): TelegramSession | null {
    return this.session;
  }

  isConnected(): boolean {
    return this.client !== null;
  }

  async disconnect() {
    try {
      if (this.client) {
        await this.client.disconnect();
        this.client = null;
      }
      this.session = null;
    } catch (error) {
      console.error('Failed to disconnect:', error);
    }
  }
}

export const telegramManager = new TelegramManager();
