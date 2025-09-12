import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import ytdl from 'ytdl-core';
import { DatabaseStorage } from './DatabaseStorage';
import { LanguageManager } from './LanguageTemplates';
import { logger } from './logger';

interface BotConfig {
  bot_token: string;
  authorized_user_ids: string[];
  download_path: string;
  max_parallel: number;
  progress_download: boolean;
  language: string;
}

interface DownloadStatus {
  messageId: number;
  userId: string;
  progress: number;
  status: 'pending' | 'downloading' | 'completed' | 'failed';
  fileName: string;
}

export class SimpleTelegramBot {
  private bot: TelegramBot | null = null;
  private config: BotConfig;
  private botRunning: boolean = false;
  private activeDownloads: Map<number, DownloadStatus> = new Map();
  private storage: DatabaseStorage;
  private language: LanguageManager;
  private youtubeLinks: Map<number, string> = new Map();

  constructor(config: BotConfig) {
    this.config = config;
    this.storage = new DatabaseStorage();
    this.language = new LanguageManager(config.language);
    this.ensureDirectories();
    logger.info('SimpleTelegramBot initialized');
  }

  private ensureDirectories(): void {
    const dirs = [
      this.config.download_path,
      path.join(this.config.download_path, 'completed'),
      path.join(this.config.download_path, 'youtube'),
      path.join(this.config.download_path, 'youtube', 'videos'),
      path.join(this.config.download_path, 'youtube', 'audio'),
      path.join(this.config.download_path, 'temp'),
      path.join(this.config.download_path, 'torrents'),
      path.join(this.config.download_path, 'documents'),
      path.join(this.config.download_path, 'images'),
      path.join(this.config.download_path, 'videos'),
      path.join(this.config.download_path, 'audio'),
      path.join(this.config.download_path, 'archives'),
    ];

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.debug(`Created directory: ${dir}`);
      }
    });
  }

  async start(): Promise<void> {
    try {
      if (this.botRunning) {
        throw new Error('Bot is already running');
      }

      logger.info('🚀 Starting Simple Telegram Bot...');

      // Create bot instance with polling
      this.bot = new TelegramBot(this.config.bot_token, { 
        polling: {
          interval: 1000,
          autoStart: true,
          params: {
            timeout: 10,
          }
        }
      });

      // Setup message handlers
      this.setupHandlers();

      this.botRunning = true;
      logger.info('✅ Simple Telegram Bot started successfully');

      // Send welcome message to authorized users
      await this.sendWelcomeMessage();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`❌ Failed to start Simple Telegram Bot: ${errorMessage}`);
      throw error;
    }
  }

  private setupHandlers(): void {
    if (!this.bot) return;

    // Handle text messages
    this.bot.on('message', async (msg) => {
      try {
        logger.debug(`Received message from user ${msg.from?.id}: ${msg.text || 'media'}`);
        
        if (!this.isAuthorizedUser(msg.from?.id?.toString())) {
          logger.warn(`Unauthorized user attempted access: ${msg.from?.id}`);
          await this.bot!.sendMessage(msg.chat.id, this.language.template('UNAUTHORIZED_USER'));
          return;
        }

        const text = msg.text || '';

        // Handle commands
        if (text.startsWith('/')) {
          logger.info(`Processing command: ${text}`);
          await this.handleCommand(msg, text);
        }
        // Handle URLs
        else if (this.containsUrl(text)) {
          logger.info(`Processing URL: ${text}`);
          await this.handleUrlMessage(msg, text);
        }
        // Handle documents/media
        else if (msg.document || msg.photo || msg.video || msg.audio) {
          logger.info(`Processing media message`);
          await this.handleMediaMessage(msg);
        }
        // Echo message - fixed to handle undefined
        else if (text && text.trim()) {
          logger.debug(`Echoing message: ${text}`);
          await this.bot!.sendMessage(msg.chat.id, `Echo: ${text}\n\nSend me files, YouTube URLs, or use /help for commands.`);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logger.error(`Message handler error: ${errorMessage}`);
        await this.bot!.sendMessage(msg.chat.id, `❌ Error: ${errorMessage}`);
      }
    });

    // Handle callback queries (inline buttons)
    this.bot.on('callback_query', async (query) => {
      try {
        const data = query.data;
        if (!data) return;

        logger.info(`Processing callback query: ${data}`);

        const [linkId, action] = data.split(',');
        const url = this.youtubeLinks.get(parseInt(linkId));

        if (!url) {
          await this.bot!.answerCallbackQuery(query.id, { text: 'URL not found' });
          return;
        }

        await this.bot!.answerCallbackQuery(query.id, { 
          text: `Starting ${action === 'V' ? 'video' : 'audio'} download...` 
        });

        if (action === 'V') {
          await this.downloadYouTubeVideo(url, query.from.id, query.message?.chat.id);
        } else if (action === 'A') {
          await this.downloadYouTubeAudio(url, query.from.id, query.message?.chat.id);
        }

        this.youtubeLinks.delete(parseInt(linkId));

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Callback query error: ${errorMessage}`);
      }
    });

    // Handle errors
    this.bot.on('error', (error) => {
      logger.error(`Bot error: ${error.message}`);
    });

    // Handle polling errors
    this.bot.on('polling_error', (error) => {
      logger.error(`Polling error: ${error.message}`);
    });
  }

  private async handleCommand(msg: any, command: string): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id?.toString();

    switch (command.toLowerCase()) {
      case '/start':
      case '/help':
        await this.sendHelpMessage(chatId);
        break;

      case '/version':
        await this.bot!.sendMessage(chatId, this.language.formatTemplate('BOT_VERSION', '4.0.9 (Node.js)'));
        break;

      case '/telethon':
        await this.bot!.sendMessage(chatId, `📚 Library Versions:\n🤖 Bot: 4.0.9 (Node.js)\n📦 Node.js: ${process.version}\n📱 Telegram Bot API: node-telegram-bot-api\n🎬 YouTube: ytdl-core`);
        break;

      case '/id':
        await this.bot!.sendMessage(chatId, `🆔 Your User ID: ${userId || 'Unknown'}\n💬 Chat ID: ${chatId}`);
        break;

      case '/status':
        await this.sendStatusMessage(chatId);
        break;

      case '/rename':
        await this.handleRenameCommand(msg);
        break;

      default:
        await this.bot!.sendMessage(chatId, this.language.formatTemplate('COMMAND_NOT_FOUND', command));
    }
  }

  private async handleUrlMessage(msg: any, text: string): Promise<void> {
    const urls = this.extractUrls(text);
    
    for (const url of urls) {
      if (this.isYouTubeUrl(url)) {
        await this.handleYouTubeUrl(msg, url);
      } else {
        await this.handleDirectDownload(msg, url);
      }
    }
  }

  private async handleYouTubeUrl(msg: any, url: string): Promise<void> {
    try {
      const linkId = Date.now();
      this.youtubeLinks.set(linkId, url);

      const keyboard = {
        inline_keyboard: [[
          { text: '🎥 Video', callback_data: `${linkId},V` },
          { text: '🎵 Audio', callback_data: `${linkId},A` }
        ]]
      };

      await this.bot!.sendMessage(msg.chat.id, this.language.template('YOUTUBE_OPTIONS'), {
        reply_markup: keyboard
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`YouTube URL error: ${errorMessage}`);
      await this.bot!.sendMessage(msg.chat.id, `❌ Failed to process YouTube URL: ${errorMessage}`);
    }
  }

  private async downloadYouTubeVideo(url: string, userId: number, chatId?: number): Promise<void> {
    try {
      if (!chatId) return;

      logger.info(`Starting YouTube video download: ${url}`);
      await this.bot!.sendMessage(chatId, '🎥 Starting YouTube video download...');

      const info = await ytdl.getInfo(url);
      const title = this.sanitizeFilename(info.videoDetails.title);
      const uploader = this.sanitizeFilename(info.videoDetails.author.name);
      
      // Create uploader directory for organization  
      const uploaderDir = path.join(this.config.download_path, 'youtube', 'videos', uploader);
      if (!fs.existsSync(uploaderDir)) {
        fs.mkdirSync(uploaderDir, { recursive: true });
      }
      
      const outputPath = path.join(uploaderDir, `${title}.mp4`);

      const stream = ytdl(url, { 
        quality: 'highest',
        requestOptions: {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        }
      });
      const writeStream = fs.createWriteStream(outputPath);

      stream.pipe(writeStream);

      writeStream.on('finish', async () => {
        logger.info(`Video download completed: ${title}`);
        await this.bot!.sendMessage(chatId, `✅ Video download completed: ${title}\n📁 Location: ${outputPath}`);
      });

      writeStream.on('error', async (error) => {
        logger.error(`Video download failed: ${error.message}`);
        await this.bot!.sendMessage(chatId, `❌ Video download failed: ${error.message}`);
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`YouTube video download error: ${errorMessage}`);
      if (chatId) {
        await this.bot!.sendMessage(chatId, `❌ Video download failed: ${errorMessage}`);
      }
    }
  }

  private async downloadYouTubeAudio(url: string, userId: number, chatId?: number): Promise<void> {
    try {
      if (!chatId) return;

      logger.info(`Starting YouTube audio download: ${url}`);
      await this.bot!.sendMessage(chatId, '🎵 Starting YouTube audio download...');

      const info = await ytdl.getInfo(url);
      const title = this.sanitizeFilename(info.videoDetails.title);
      const uploader = this.sanitizeFilename(info.videoDetails.author.name);
      
      // Create uploader directory for organization  
      const uploaderDir = path.join(this.config.download_path, 'youtube', 'audio', uploader);
      if (!fs.existsSync(uploaderDir)) {
        fs.mkdirSync(uploaderDir, { recursive: true });
      }
      
      const outputPath = path.join(uploaderDir, `${title}.mp3`);

      const stream = ytdl(url, { 
        quality: 'highestaudio', 
        filter: 'audioonly',
        requestOptions: {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        }
      });
      const writeStream = fs.createWriteStream(outputPath);

      stream.pipe(writeStream);

      writeStream.on('finish', async () => {
        logger.info(`Audio download completed: ${title}`);
        await this.bot!.sendMessage(chatId, `✅ Audio download completed: ${title}\n📁 Location: ${outputPath}`);
      });

      writeStream.on('error', async (error) => {
        logger.error(`Audio download failed: ${error.message}`);
        await this.bot!.sendMessage(chatId, `❌ Audio download failed: ${error.message}`);
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`YouTube audio download error: ${errorMessage}`);
      if (chatId) {
        await this.bot!.sendMessage(chatId, `❌ Audio download failed: ${errorMessage}`);
      }
    }
  }

  private async handleDirectDownload(msg: any, url: string): Promise<void> {
    try {
      logger.info(`Starting direct download: ${url}`);
      await this.bot!.sendMessage(msg.chat.id, `📥 Starting direct download: ${url}`);

      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      const filename = this.extractFilenameFromUrl(url);
      const downloadPath = this.getDownloadPath(filename);
      
      if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath, { recursive: true });
      }
      
      const outputPath = path.join(downloadPath, filename);
      const writeStream = fs.createWriteStream(outputPath);

      response.data.pipe(writeStream);

      writeStream.on('finish', async () => {
        logger.info(`Download completed: ${filename}`);
        await this.bot!.sendMessage(msg.chat.id, `✅ Download completed: ${filename}\n📁 Location: ${outputPath}`);
      });

      writeStream.on('error', async (error) => {
        logger.error(`Download failed: ${error.message}`);
        await this.bot!.sendMessage(msg.chat.id, `❌ Download failed: ${error.message}`);
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Direct download error: ${errorMessage}`);
      await this.bot!.sendMessage(msg.chat.id, `❌ Download failed: ${errorMessage}`);
    }
  }

  private async handleMediaMessage(msg: any): Promise<void> {
    try {
      let fileId: string | undefined;
      let fileName: string = '';

      if (msg.document) {
        fileId = msg.document.file_id;
        fileName = msg.document.file_name || `document_${Date.now()}`;
        
        // Check if it's a torrent file
        if (fileName.toLowerCase().endsWith('.torrent') && fileId) {
          await this.handleTorrentFile(msg, fileId, fileName);
          return;
        }
      } else if (msg.photo) {
        fileId = msg.photo[msg.photo.length - 1].file_id;
        fileName = `photo_${Date.now()}.jpg`;
      } else if (msg.video) {
        fileId = msg.video.file_id;
        fileName = `video_${Date.now()}.mp4`;
      } else if (msg.audio) {
        fileId = msg.audio.file_id;
        fileName = msg.audio.title || `audio_${Date.now()}.mp3`;
      }

      if (!fileId || !fileName) {
        await this.bot!.sendMessage(msg.chat.id, '❌ Could not process this media type');
        return;
      }

      logger.info(`Processing media file: ${fileName}`);
      await this.bot!.sendMessage(msg.chat.id, `📥 Downloading: ${fileName}`);

      await this.downloadTelegramFile(fileId, fileName, msg.chat.id);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Media download error: ${errorMessage}`);
      await this.bot!.sendMessage(msg.chat.id, `❌ Media download failed: ${errorMessage}`);
    }
  }

  private async downloadTelegramFile(fileId: string, fileName: string, chatId: number, customDir?: string): Promise<void> {
    try {
      const fileInfo = await this.bot!.getFile(fileId);
      const fileUrl = `https://api.telegram.org/file/bot${this.config.bot_token}/${fileInfo.file_path}`;

      const response = await axios({
        method: 'GET',
        url: fileUrl,
        responseType: 'stream',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      const downloadPath = customDir || this.getDownloadPath(fileName);
      
      if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath, { recursive: true });
      }
      
      const outputPath = path.join(downloadPath, fileName);
      const writeStream = fs.createWriteStream(outputPath);

      response.data.pipe(writeStream);

      writeStream.on('finish', async () => {
        logger.info(`Telegram file download completed: ${fileName}`);
        await this.bot!.sendMessage(chatId, `✅ Media download completed: ${fileName}\n📁 Location: ${outputPath}`);
      });

      writeStream.on('error', async (error) => {
        logger.error(`Telegram file download failed: ${error.message}`);
        await this.bot!.sendMessage(chatId, `❌ Media download failed: ${error.message}`);
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Telegram file download error: ${errorMessage}`);
      await this.bot!.sendMessage(chatId, `❌ Download failed: ${errorMessage}`);
    }
  }

  private async handleRenameCommand(msg: any): Promise<void> {
    try {
      const chatId = msg.chat.id;
      
      if (msg.reply_to_message && msg.reply_to_message.document) {
        // Extract new filename from command text
        const commandText = msg.text;
        const newFileName = commandText.split(' ').slice(1).join(' ');
        
        if (!newFileName) {
          await this.bot!.sendMessage(chatId, '❌ Please provide a new filename. Usage: /rename <new_filename>');
          return;
        }
        
        logger.info(`Renaming file to: ${newFileName}`);
        await this.bot!.sendMessage(chatId, `🔄 Renaming file to: ${newFileName}`);
        
        // Download the file with new name
        const fileId = msg.reply_to_message.document.file_id;
        await this.downloadTelegramFile(fileId, newFileName, chatId);
        
      } else {
        await this.bot!.sendMessage(chatId, '❌ Please reply to a document with /rename <new_filename>');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Rename command error: ${errorMessage}`);
      await this.bot!.sendMessage(msg.chat.id, `❌ Rename failed: ${errorMessage}`);
    }
  }

  private async handleTorrentFile(msg: any, fileId: string, fileName: string): Promise<void> {
    try {
      const chatId = msg.chat.id;
      
      logger.info(`Processing torrent file: ${fileName}`);
      await this.bot!.sendMessage(chatId, `🌐 Torrent file detected: ${fileName}`);
      
      // Create torrent directory
      const torrentDir = path.join(this.config.download_path, 'torrents');
      if (!fs.existsSync(torrentDir)) {
        fs.mkdirSync(torrentDir, { recursive: true });
      }
      
      // Download torrent file
      const torrentPath = path.join(torrentDir, fileName);
      await this.downloadTelegramFile(fileId, fileName, chatId, torrentDir);
      
      await this.bot!.sendMessage(chatId, `✅ Torrent file saved: ${fileName}\n📁 Location: ${torrentPath}\n\n💡 You can now use this file with your torrent client.`);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Torrent file error: ${errorMessage}`);
      await this.bot!.sendMessage(msg.chat.id, `❌ Torrent handling failed: ${errorMessage}`);
    }
  }

  private getDownloadPath(fileName: string): string {
    const extension = path.extname(fileName).toLowerCase();
    
    // File organization by extension (matching Python bot behavior)
    const extensionMapping: { [key: string]: string } = {
      '.pdf': 'documents/pdf',
      '.doc': 'documents/doc',
      '.docx': 'documents/doc',
      '.txt': 'documents/txt',
      '.mp4': 'videos',
      '.avi': 'videos',
      '.mkv': 'videos',
      '.mov': 'videos',
      '.mp3': 'audio',
      '.wav': 'audio',
      '.flac': 'audio',
      '.m4a': 'audio',
      '.jpg': 'images',
      '.jpeg': 'images',
      '.png': 'images',
      '.gif': 'images',
      '.zip': 'archives',
      '.rar': 'archives',
      '.7z': 'archives',
      '.tar': 'archives',
      '.gz': 'archives',
      '.torrent': 'torrents'
    };
    
    const subDir = extensionMapping[extension] || 'misc';
    return path.join(this.config.download_path, subDir);
  }

  private async sendWelcomeMessage(): Promise<void> {
    const message = this.language.template('WELCOME') + 
                   this.language.formatTemplate('BOT_VERSION', '4.0.9 (Node.js)') +
                   '\n✅ Bot is ready for downloads!';

    for (const userId of this.config.authorized_user_ids) {
      try {
        await this.bot!.sendMessage(parseInt(userId), message);
        logger.info(`Welcome message sent to user: ${userId}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Failed to send welcome to ${userId}: ${errorMessage}`);
      }
    }
  }

  private async sendHelpMessage(chatId: number): Promise<void> {
    const helpMessage = this.language.template('HELP_MESSAGE');
    await this.bot!.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
  }

  private async sendStatusMessage(chatId: number): Promise<void> {
    const uptime = process.uptime();
    const uptimeFormatted = this.formatUptime(uptime);
    
    const message = `📊 Bot Status

🟢 Status: ${this.botRunning ? 'Running' : 'Stopped'}
⏰ Uptime: ${uptimeFormatted}
📊 Active Downloads: ${this.activeDownloads.size}/${this.config.max_parallel}
📁 Download Path: ${this.config.download_path}
👥 Authorized Users: ${this.config.authorized_user_ids.length}
🌐 Language: ${this.config.language}

💡 Ready for downloads!`;

    await this.bot!.sendMessage(chatId, message);
  }

  private containsUrl(text: string): boolean {
    const urlRegex = /https?:\/\/[^\s]+/;
    return urlRegex.test(text);
  }

  private extractUrls(text: string): string[] {
    const urlRegex = /https?:\/\/[^\s]+/g;
    return text.match(urlRegex) || [];
  }

  private isYouTubeUrl(url: string): boolean {
    return /youtube\.com|youtu\.be/i.test(url);
  }

  private extractFilenameFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      let filename = path.basename(pathname);
      
      if (!filename || filename === '/' || !filename.includes('.')) {
        filename = `download_${Date.now()}.bin`;
      }
      
      return this.sanitizeFilename(filename);
    } catch (error) {
      return `download_${Date.now()}.bin`;
    }
  }

  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '_')
      .trim()
      .substring(0, 200);
  }

  private formatUptime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    return `${hours}h ${minutes}m ${secs}s`;
  }

  private isAuthorizedUser(userId?: string): boolean {
    if (!userId) return false;
    return this.config.authorized_user_ids.includes(userId);
  }

  async stop(): Promise<void> {
    try {
      if (this.bot) {
        await this.bot.stopPolling();
        this.bot = null;
      }
      this.botRunning = false;
      logger.info('✅ Simple Telegram Bot stopped');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error stopping bot: ${errorMessage}`);
    }
  }

  getStatus() {
    return {
      running: this.botRunning,
      activeDownloads: this.activeDownloads.size,
      maxParallel: this.config.max_parallel,
      authorizedUsers: this.config.authorized_user_ids.length,
      downloadPath: this.config.download_path,
      language: this.config.language,
    };
  }

  isRunning(): boolean {
    return this.botRunning;
  }

  getActiveDownloads() {
    return Array.from(this.activeDownloads.values());
  }

  async downloadYouTube(url: string, format: 'video' | 'audio' = 'video'): Promise<string> {
    const info = await ytdl.getInfo(url);
    const title = this.sanitizeFilename(info.videoDetails.title);
    const ext = format === 'video' ? 'mp4' : 'mp3';
    const outputPath = path.join(this.config.download_path, 'youtube', `${title}.${ext}`);

    const stream = format === 'video' 
      ? ytdl(url, { quality: 'highest' })
      : ytdl(url, { quality: 'highestaudio', filter: 'audioonly' });

    const writeStream = fs.createWriteStream(outputPath);
    stream.pipe(writeStream);

    return new Promise((resolve, reject) => {
      writeStream.on('finish', () => resolve(outputPath));
      writeStream.on('error', reject);
    });
  }

  async downloadDirect(url: string, filename?: string): Promise<string> {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
      timeout: 30000,
    });

    const fileName = filename || this.extractFilenameFromUrl(url);
    const outputPath = path.join(this.config.download_path, 'completed', fileName);
    const writeStream = fs.createWriteStream(outputPath);

    response.data.pipe(writeStream);

    return new Promise((resolve, reject) => {
      writeStream.on('finish', () => resolve(outputPath));
      writeStream.on('error', reject);
    });
  }
}