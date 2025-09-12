import { SimpleTelegramBot } from './SimpleTelegramBot';
import { YouTubeDownloader } from './YouTubeDownloader';
import { FileExtractor } from './FileExtractor';
import { DownloadManager } from './DownloadManager';
import { LanguageManager } from './LanguageTemplates';
import ytdl from 'ytdl-core';
import path from 'path';

interface BotManagerConfig {
  api_id: number;
  api_hash: string;
  bot_token: string;
  authorized_user_ids: string[];
  download_path: string;
  max_parallel: number;
  progress_download: boolean;
  language: string;
  features: {
    enableUnzip: boolean;
    enableUnrar: boolean;
    enable7z: boolean;
    enableYoutube: boolean;
  };
}

export class BotManager {
  private bot: SimpleTelegramBot | null = null;
  private youtubeDownloader: YouTubeDownloader;
  private fileExtractor: FileExtractor;
  private downloadManager: DownloadManager;
  private languageManager: LanguageManager;
  private config: BotManagerConfig;
  private isRunning: boolean = false;

  constructor(config: BotManagerConfig) {
    this.config = config;
    
    // Initialize managers
    this.languageManager = new LanguageManager(config.language);
    this.youtubeDownloader = new YouTubeDownloader(path.join(config.download_path, 'youtube'));
    this.fileExtractor = new FileExtractor(config.features);
    this.downloadManager = new DownloadManager();
  }

  async start(): Promise<void> {
    try {
      if (this.isRunning) {
        throw new Error('Bot is already running');
      }

      console.log('🚀 Starting Telegram Bot Manager...');
      
      // Create bot instance
      this.bot = new SimpleTelegramBot({
        bot_token: this.config.bot_token,
        authorized_user_ids: this.config.authorized_user_ids,
        download_path: this.config.download_path,
        max_parallel: this.config.max_parallel,
        progress_download: this.config.progress_download,
        language: this.config.language,
      });

      // Start the bot
      await this.bot.start();
      
      this.isRunning = true;
      console.log('✅ Bot Manager started successfully');

    } catch (error) {
      console.error('❌ Failed to start Bot Manager:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      if (!this.isRunning || !this.bot) {
        console.log('Bot is not running');
        return;
      }

      console.log('🛑 Stopping Bot Manager...');
      
      await this.bot.stop();
      this.bot = null;
      this.isRunning = false;
      
      console.log('✅ Bot Manager stopped successfully');

    } catch (error) {
      console.error('❌ Error stopping Bot Manager:', error);
      throw error;
    }
  }

  async restart(): Promise<void> {
    console.log('🔄 Restarting Bot Manager...');
    
    if (this.isRunning) {
      await this.stop();
    }
    
    await this.start();
  }

  getStatus() {
    return {
      running: this.isRunning,
      config: {
        api_id: this.config.api_id,
        authorized_users: this.config.authorized_user_ids.length,
        download_path: this.config.download_path,
        max_parallel: this.config.max_parallel,
        language: this.config.language,
        features: this.config.features,
      },
      bot: this.bot?.getStatus() || null,
      activeDownloads: this.downloadManager.getActiveDownloads(),
    };
  }

  updateConfig(newConfig: Partial<BotManagerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Update language if changed
    if (newConfig.language) {
      this.languageManager.setLanguage(newConfig.language);
    }
    
    // Update file extractor features if changed
    if (newConfig.features) {
      this.fileExtractor.updateConfig(newConfig.features);
    }
  }

  getConfig(): BotManagerConfig {
    return { ...this.config };
  }

  // Proxy methods for external access
  async downloadYouTubeVideo(url: string, outputPath?: string): Promise<string> {
    if (!this.config.features.enableYoutube) {
      throw new Error('YouTube downloads are disabled');
    }
    
    if (this.bot) {
      return this.bot.downloadYouTube(url, 'video');
    }
    
    return this.youtubeDownloader.downloadVideo(url, {
      outputPath: outputPath || path.join(this.config.download_path, 'youtube', 'video')
    });
  }

  async downloadYouTubeAudio(url: string, outputPath?: string): Promise<string> {
    if (!this.config.features.enableYoutube) {
      throw new Error('YouTube downloads are disabled');
    }
    
    if (this.bot) {
      return this.bot.downloadYouTube(url, 'audio');
    }
    
    return this.youtubeDownloader.downloadAudio(url, {
      outputPath: outputPath || path.join(this.config.download_path, 'youtube', 'audio')
    });
  }

  async extractFile(filePath: string, outputDir?: string) {
    return this.fileExtractor.extractFile(filePath, outputDir);
  }

  async downloadDirectUrl(url: string, filename?: string) {
    if (this.bot) {
      return { success: true, filePath: await this.bot.downloadDirect(url, filename) };
    }
    
    const outputPath = this.downloadManager.getDownloadPath('default', filename);
    
    return this.downloadManager.downloadDirectUrl(url, {
      outputPath,
      filename,
      maxRetries: 3,
      timeout: 300000, // 5 minutes
    });
  }

  getLanguageManager(): LanguageManager {
    return this.languageManager;
  }

  getActiveDownloads() {
    if (this.bot) {
      return this.bot.getActiveDownloads();
    }
    return this.downloadManager.getActiveDownloads();
  }

  cancelDownload(downloadId: string): boolean {
    return this.downloadManager.cancelDownload(downloadId);
  }

  async isValidYouTubeUrl(url: string): Promise<boolean> {
    try {
      return ytdl.validateURL(url);
    } catch {
      return false;
    }
  }

  async getYouTubeInfo(url: string) {
    try {
      return await ytdl.getInfo(url);
    } catch (error) {
      throw new Error(`Failed to get YouTube info: ${error.message}`);
    }
  }

  getLogs(): string[] {
    // Return recent logs - this could be enhanced with a proper logging system
    return [];
  }

  // Health check
  isHealthy(): boolean {
    return this.isRunning && this.bot?.isRunning() === true;
  }
}

// Singleton instance for the application
let botManagerInstance: BotManager | null = null;

export function createBotManager(config: BotManagerConfig): BotManager {
  if (botManagerInstance) {
    throw new Error('Bot Manager already exists. Use getBotManager() to get the existing instance.');
  }
  
  botManagerInstance = new BotManager(config);
  return botManagerInstance;
}

export function getBotManager(): BotManager | null {
  return botManagerInstance;
}

export function destroyBotManager(): void {
  if (botManagerInstance) {
    botManagerInstance.stop().catch(console.error);
    botManagerInstance = null;
  }
}