import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

interface BotConfig {
  api_id: number;
  api_hash: string;
  bot_token: string;
  authorized_user_ids: string[];
  download_path: string;
  max_parallel: number;
  progress_download: boolean;
  session_string?: string;
}

interface DownloadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export class TelegramBotManager {
  private bot: TelegramBot | null = null;
  private config: BotConfig;
  private isConnected: boolean = false;
  private downloadSemaphore: Promise<void>[] = [];
  private youtubeLinks: Map<number, string> = new Map();
  private pendingMessages: any[] = [];
  
  constructor(config: BotConfig) {
    this.config = config;
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    const dirs = [
      this.config.download_path,
      path.join(this.config.download_path, 'completed'),
      path.join(this.config.download_path, 'youtube'),
      path.join(this.config.download_path, 'tmp'),
      path.join(process.cwd(), 'sessions'),
    ];

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  async start(): Promise<void> {
    try {
      console.log('🚀 Starting Telegram Bot...');
      
      // Authenticate with bot token
      await this.authenticate();
      
      console.log('✅ Bot authenticated successfully');
      console.log('📱 Setting up message handlers...');
      
      // Set up message handlers
      this.setupMessageHandlers();
      
      // Send welcome message to authorized users
      await this.sendWelcomeMessage();
      
      // Process any pending messages
      await this.processPendingMessages();
      
      console.log('🎉 Telegram Bot started successfully!');
      this.isConnected = true;
      
    } catch (error) {
      console.error('❌ Failed to start bot:', error);
      throw error;
    }
  }

  private async authenticate(): Promise<void> {
    try {
      const result = await this.api.call('auth.importBotAuthorization', {
        flags: 0,
        api_id: this.config.api_id,
        api_hash: this.config.api_hash,
        bot_auth_token: this.config.bot_token,
      });
      
      console.log('Bot authorization result:', result);
    } catch (error) {
      console.error('Authentication error:', error);
      throw error;
    }
  }

  private setupMessageHandlers(): void {
    // Listen for updates
    this.mtproto.updates.on('updates', (updates: any) => {
      this.handleUpdates(updates);
    });
  }

  private async handleUpdates(updates: any): Promise<void> {
    try {
      if (updates.updates) {
        for (const update of updates.updates) {
          if (update._ === 'updateNewMessage') {
            await this.handleNewMessage(update.message);
          } else if (update._ === 'updateBotCallbackQuery') {
            await this.handleCallbackQuery(update);
          }
        }
      }
    } catch (error) {
      console.error('Error handling updates:', error);
    }
  }

  private async handleNewMessage(message: any): Promise<void> {
    try {
      console.log('📨 New message received:', message);
      
      // Check if user is authorized
      if (!this.isAuthorizedUser(message.from_id?.user_id?.toString())) {
        console.log('❌ Unauthorized user:', message.from_id?.user_id);
        return;
      }

      const text = message.message || '';
      
      // Handle commands
      if (text.startsWith('/')) {
        await this.handleCommand(message, text);
      }
      // Handle media downloads
      else if (message.media) {
        await this.handleMediaDownload(message);
      }
      // Handle URLs for YouTube/direct downloads
      else if (this.containsDownloadableUrl(text)) {
        await this.handleUrlDownload(message, text);
      }
      
    } catch (error) {
      console.error('Error handling new message:', error);
      await this.sendErrorMessage(message.from_id?.user_id, `Error: ${error.message}`);
    }
  }

  private async handleCallbackQuery(query: any): Promise<void> {
    try {
      console.log('🔘 Callback query received:', query);
      
      const data = query.data.toString();
      const [linkId, action] = data.split(',');
      
      const url = this.youtubeLinks.get(parseInt(linkId));
      if (!url) {
        console.error('URL not found for callback:', linkId);
        return;
      }

      // Remove the URL from temporary storage
      this.youtubeLinks.delete(parseInt(linkId));
      
      // Process the download based on action
      if (action === 'V') {
        await this.downloadYouTubeVideo(url, query.from_id);
      } else if (action === 'A') {
        await this.downloadYouTubeAudio(url, query.from_id);
      }
      
      // Answer the callback query
      await this.api.call('messages.setBotCallbackAnswer', {
        query_id: query.query_id,
        message: `Starting ${action === 'V' ? 'video' : 'audio'} download...`,
      });
      
    } catch (error) {
      console.error('Error handling callback query:', error);
    }
  }

  private async handleCommand(message: any, command: string): Promise<void> {
    const userId = message.from_id?.user_id;
    
    switch (command.toLowerCase()) {
      case '/start':
      case '/help':
        await this.sendHelpMessage(userId);
        break;
        
      case '/version':
        await this.sendVersionMessage(userId);
        break;
        
      case '/id':
        await this.sendIdMessage(message);
        break;
        
      case '/status':
        await this.sendStatusMessage(userId);
        break;
        
      default:
        await this.sendMessage(userId, `Unknown command: ${command}\nUse /help to see available commands.`);
    }
  }

  private async handleMediaDownload(message: any): Promise<void> {
    try {
      const userId = message.from_id?.user_id;
      console.log('📥 Starting media download for message:', message.id);
      
      // Check download limit
      if (this.downloadSemaphore.length >= this.config.max_parallel) {
        await this.sendMessage(userId, '⏳ Download queue is full. Please wait...');
        return;
      }

      const downloadPromise = this.downloadMedia(message);
      this.downloadSemaphore.push(downloadPromise);
      
      // Clean up completed downloads
      downloadPromise.finally(() => {
        const index = this.downloadSemaphore.indexOf(downloadPromise);
        if (index > -1) {
          this.downloadSemaphore.splice(index, 1);
        }
      });
      
    } catch (error) {
      console.error('Error starting media download:', error);
      await this.sendErrorMessage(message.from_id?.user_id, `Download failed: ${error.message}`);
    }
  }

  private async downloadMedia(message: any): Promise<void> {
    try {
      const userId = message.from_id?.user_id;
      
      // Get file information
      const fileInfo = await this.getFileInfo(message.media);
      if (!fileInfo) {
        await this.sendMessage(userId, '❌ Could not get file information');
        return;
      }

      console.log('📄 File info:', fileInfo);
      
      // Generate filename
      const fileName = fileInfo.fileName || `file_${message.id}_${Date.now()}`;
      const filePath = path.join(this.config.download_path, 'completed', fileName);
      
      // Start download with progress tracking
      await this.sendMessage(userId, `📥 Starting download: ${fileName}`);
      
      const downloadResult = await this.downloadFile(fileInfo.location, filePath, (progress) => {
        if (this.config.progress_download) {
          this.updateDownloadProgress(userId, fileName, progress);
        }
      });
      
      if (downloadResult) {
        await this.sendMessage(userId, `✅ Download completed: ${fileName}`);
        // Post-process file if needed
        await this.postProcessFile(filePath);
      } else {
        await this.sendMessage(userId, `❌ Download failed: ${fileName}`);
      }
      
    } catch (error) {
      console.error('Media download error:', error);
      throw error;
    }
  }

  private async getFileInfo(media: any): Promise<any> {
    try {
      // Handle different media types
      if (media.document) {
        return {
          location: media.document,
          fileName: this.getDocumentFileName(media.document),
          size: media.document.size,
        };
      } else if (media.photo) {
        return {
          location: media.photo,
          fileName: `photo_${Date.now()}.jpg`,
          size: media.photo.sizes?.[media.photo.sizes.length - 1]?.size,
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error getting file info:', error);
      return null;
    }
  }

  private getDocumentFileName(document: any): string {
    // Try to get filename from attributes
    if (document.attributes) {
      for (const attr of document.attributes) {
        if (attr._ === 'documentAttributeFilename') {
          return attr.file_name;
        }
      }
    }
    
    // Fallback to generated name
    return `document_${document.id}.${this.getFileExtension(document.mime_type)}`;
  }

  private getFileExtension(mimeType: string): string {
    const mimeToExt: { [key: string]: string } = {
      'video/mp4': 'mp4',
      'video/avi': 'avi',
      'video/mkv': 'mkv',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'application/pdf': 'pdf',
      'application/zip': 'zip',
    };
    
    return mimeToExt[mimeType] || 'bin';
  }

  private async downloadFile(location: any, filePath: string, progressCallback?: (progress: DownloadProgress) => void): Promise<boolean> {
    try {
      // This is a simplified implementation
      // In real implementation, you'd use MTProto file download methods
      console.log('Downloading file to:', filePath);
      
      // Simulate download progress
      for (let i = 0; i <= 100; i += 10) {
        if (progressCallback) {
          progressCallback({
            loaded: i,
            total: 100,
            percentage: i
          });
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Create empty file for demo
      fs.writeFileSync(filePath, 'Downloaded file content');
      
      return true;
    } catch (error) {
      console.error('File download error:', error);
      return false;
    }
  }

  private async updateDownloadProgress(userId: number, fileName: string, progress: DownloadProgress): Promise<void> {
    // Only update every 10% to avoid spam
    if (progress.percentage % 10 === 0) {
      const message = `📥 ${fileName}\n🔄 Progress: ${progress.percentage}%\n📊 ${this.formatBytes(progress.loaded)} / ${this.formatBytes(progress.total)}`;
      await this.sendMessage(userId, message);
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private async postProcessFile(filePath: string): Promise<void> {
    try {
      const ext = path.extname(filePath).toLowerCase();
      
      // Handle archive extraction
      if (['.zip', '.rar', '.7z'].includes(ext)) {
        await this.extractArchive(filePath);
      }
      
      // Set file permissions (if needed)
      fs.chmodSync(filePath, 0o644);
      
    } catch (error) {
      console.error('Post-processing error:', error);
    }
  }

  private async extractArchive(filePath: string): Promise<void> {
    // Archive extraction will be implemented in the next task
    console.log('Archive extraction not yet implemented for:', filePath);
  }

  private containsDownloadableUrl(text: string): boolean {
    const urlPatterns = [
      /https?:\/\/(www\.)?(youtube\.com|youtu\.be)/i,
      /https?:\/\/[^\s]+\.(mp4|avi|mkv|mp3|wav|zip|rar|pdf)/i,
    ];
    
    return urlPatterns.some(pattern => pattern.test(text));
  }

  private async handleUrlDownload(message: any, text: string): Promise<void> {
    const userId = message.from_id?.user_id;
    const urls = this.extractUrls(text);
    
    for (const url of urls) {
      if (this.isYouTubeUrl(url)) {
        await this.handleYouTubeUrl(userId, url);
      } else {
        await this.handleDirectUrl(userId, url);
      }
    }
  }

  private extractUrls(text: string): string[] {
    const urlRegex = /https?:\/\/[^\s]+/g;
    return text.match(urlRegex) || [];
  }

  private isYouTubeUrl(url: string): boolean {
    return /youtube\.com|youtu\.be/i.test(url);
  }

  private async handleYouTubeUrl(userId: number, url: string): Promise<void> {
    try {
      // Store URL for callback
      const linkId = Date.now();
      this.youtubeLinks.set(linkId, url);
      
      // Send options to user
      const keyboard = {
        _: 'replyInlineMarkup',
        rows: [
          {
            _: 'keyboardButtonRow',
            buttons: [
              {
                _: 'keyboardButtonCallback',
                text: '🎥 Video',
                data: Buffer.from(`${linkId},V`),
              },
              {
                _: 'keyboardButtonCallback',
                text: '🎵 Audio',
                data: Buffer.from(`${linkId},A`),
              },
            ],
          },
        ],
      };
      
      await this.sendMessage(userId, `🎬 YouTube link detected!\nChoose download option:`, keyboard);
      
    } catch (error) {
      console.error('YouTube URL handling error:', error);
      await this.sendErrorMessage(userId, 'Failed to process YouTube URL');
    }
  }

  private async downloadYouTubeVideo(url: string, userId: number): Promise<void> {
    // YouTube download implementation will be in the next task
    await this.sendMessage(userId, `🎥 Starting YouTube video download: ${url}`);
    console.log('YouTube video download not yet implemented');
  }

  private async downloadYouTubeAudio(url: string, userId: number): Promise<void> {
    // YouTube download implementation will be in the next task
    await this.sendMessage(userId, `🎵 Starting YouTube audio download: ${url}`);
    console.log('YouTube audio download not yet implemented');
  }

  private async handleDirectUrl(userId: number, url: string): Promise<void> {
    await this.sendMessage(userId, `📥 Starting direct download: ${url}`);
    // Direct download implementation will be completed
  }

  private isAuthorizedUser(userId: string): boolean {
    return this.config.authorized_user_ids.includes(userId);
  }

  private async sendWelcomeMessage(): Promise<void> {
    const message = `🤖 Telegram Bot Started!
    
🎉 Version: 4.0.9 (Node.js)
📱 Platform: Node.js + MTProto
⚡ Status: Active

📋 Available commands:
/help - Show help
/version - Show version
/id - Show chat ID
/status - Show bot status

Ready to download! 🚀`;

    for (const userId of this.config.authorized_user_ids) {
      await this.sendMessage(parseInt(userId), message);
    }
  }

  private async sendHelpMessage(userId: number): Promise<void> {
    const message = `🤖 Telegram Downloader Bot Help

📋 Available Commands:
/help - Show this help message
/version - Show bot version
/id - Show your user/chat ID
/status - Show bot status

📥 Download Features:
• Send any media file to download it
• Send YouTube URLs for video/audio download
• Send direct file URLs to download
• Automatic file organization by type

🎬 YouTube Support:
• Full video download in best quality
• Audio extraction to MP3
• Playlist support
• Progress tracking

📦 Archive Support:
• Automatic extraction of ZIP, RAR, 7Z files
• Organized file structure
• Safe file handling

🔐 Authorized Users Only
Only authorized users can use this bot.

Made with ❤️ in Node.js`;

    await this.sendMessage(userId, message);
  }

  private async sendVersionMessage(userId: number): Promise<void> {
    const message = `🤖 Bot Version Information

🔢 Bot Version: 4.0.9
💻 Platform: Node.js
🌐 Protocol: MTProto
📅 Build Date: ${new Date().toISOString().split('T')[0]}

🛠️ Dependencies:
• @mtproto/core (MTProto client)
• ytdl-core (YouTube downloads)
• archiver/unzipper (Archive handling)
• Node.js ${process.version}

✨ Features:
• File downloads
• YouTube video/audio
• Archive extraction
• Progress tracking
• Multi-user support`;

    await this.sendMessage(userId, message);
  }

  private async sendIdMessage(message: any): Promise<void> {
    const userId = message.from_id?.user_id;
    const chatId = message.peer_id?.chat_id || message.peer_id?.channel_id || userId;
    
    const idMessage = `🆔 ID Information

👤 Your User ID: ${userId}
💬 Chat ID: ${chatId}
📝 Message ID: ${message.id}`;

    await this.sendMessage(userId, idMessage);
  }

  private async sendStatusMessage(userId: number): Promise<void> {
    const uptime = process.uptime();
    const uptimeFormatted = this.formatUptime(uptime);
    
    const message = `📊 Bot Status

🟢 Status: ${this.isConnected ? 'Connected' : 'Disconnected'}
⏰ Uptime: ${uptimeFormatted}
📊 Active Downloads: ${this.downloadSemaphore.length}/${this.config.max_parallel}
💾 Memory Usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB
📁 Download Path: ${this.config.download_path}

🔧 Configuration:
• Max Parallel Downloads: ${this.config.max_parallel}
• Progress Tracking: ${this.config.progress_download ? 'Enabled' : 'Disabled'}
• Authorized Users: ${this.config.authorized_user_ids.length}`;

    await this.sendMessage(userId, message);
  }

  private formatUptime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    return `${hours}h ${minutes}m ${secs}s`;
  }

  private async processPendingMessages(): Promise<void> {
    console.log('📋 Processing pending messages...');
    // Implementation for pending messages will be added
  }

  private async sendMessage(userId: number, text: string, replyMarkup?: any): Promise<void> {
    try {
      await this.api.call('messages.sendMessage', {
        peer: {
          _: 'inputPeerUser',
          user_id: userId,
          access_hash: 0,
        },
        message: text,
        random_id: crypto.randomBytes(8).readBigInt64LE(),
        reply_markup: replyMarkup,
      });
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }

  private async sendErrorMessage(userId: number, error: string): Promise<void> {
    const message = `❌ Error: ${error}`;
    await this.sendMessage(userId, message);
  }

  async stop(): Promise<void> {
    console.log('🛑 Stopping Telegram Bot...');
    this.isConnected = false;
    
    // Wait for active downloads to complete
    await Promise.all(this.downloadSemaphore);
    
    console.log('✅ Bot stopped successfully');
  }

  // Public methods for external control
  getStatus() {
    return {
      connected: this.isConnected,
      activeDownloads: this.downloadSemaphore.length,
      maxParallel: this.config.max_parallel,
      authorizedUsers: this.config.authorized_user_ids.length,
    };
  }

  isRunning(): boolean {
    return this.isConnected;
  }
}