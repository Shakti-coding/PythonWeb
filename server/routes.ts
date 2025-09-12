import type { Express } from "express";

// Extend Express session interface for GitHub OAuth
declare module 'express-session' {
  interface SessionData {
    githubAccessToken?: string;
    githubOAuthState?: string;
  }
}
import { createServer, type Server } from "http";
import { storage } from "./storage";
import TelegramBot from 'node-telegram-bot-api';
import { logger } from './telegram-bot/logger';
import { LanguageManager } from './telegram-bot/LanguageTemplates';
import axios from 'axios';
import ytdl from 'ytdl-core';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { createBotManager, getBotManager, destroyBotManager } from './telegram-bot/BotManager';
import type { BotManager } from './telegram-bot/BotManager';
import { configReader } from '../shared/config-reader';
import { MTProtoClient } from './telegram-bot/MTProtoClient';
import { TelegramForwarder } from './telegram-forwarder';
import { forwardConfigSchema, type ForwardJob } from '@shared/schema';
import { z } from 'zod';

let bot: TelegramBot | null = null;
let mtprotoClient: MTProtoClient | null = null;
let botStatus = { running: false, token: '', lastActivity: null as string | null };
let languageManager = new LanguageManager('en_EN');
let youtubeLinks: Map<number, string> = new Map();

// Helper functions for download
const containsUrl = (text: string): boolean => {
  const urlRegex = /https?:\/\/[^\s]+/;
  return urlRegex.test(text);
};

const extractUrls = (text: string): string[] => {
  const urlRegex = /https?:\/\/[^\s]+/g;
  return text.match(urlRegex) || [];
};

const isYouTubeUrl = (url: string): boolean => {
  return /youtube\.com|youtu\.be/i.test(url);
};

const sanitizeFilename = (filename: string): string => {
  return filename
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .trim()
    .substring(0, 200);
};

const ensureDownloadDirs = (): void => {
  const dirs = [
    './downloads',
    './downloads/completed',
    './downloads/youtube',
    './downloads/youtube/videos',
    './downloads/youtube/audio',
    './downloads/temp',
    './downloads/torrents',
    './downloads/documents',
    './downloads/images',
    './downloads/videos',
    './downloads/audio',
    './downloads/archives',
  ];

  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.debug(`Created directory: ${dir}`);
    }
  });
};

// Node.js Telegram Bot Management
let nodeBotManager: BotManager | null = null;

// Python Telethon Bot Management
let pythonBot: ChildProcess | null = null;
let pythonBotStatus = { 
  running: false, 
  apiId: '', 
  apiHash: '', 
  botToken: '',
  authorizedUserId: '',
  lastActivity: null as string | null,
  logs: [] as string[]
};

// Python Copier Management
let pythonCopier: ChildProcess | null = null;
let pythonCopierStatus = { 
  running: false, 
  currentPair: undefined as string | undefined,
  lastActivity: null as string | null,
  processedMessages: 0,
  totalPairs: 0,
  isPaused: false,
  sessionValid: false,
  currentUserInfo: undefined as { id: number; username: string; firstName: string; } | undefined,
  logs: [] as string[]
};

export async function registerRoutes(app: Express): Promise<Server> {
  // put application routes here
  // prefix all routes with /api

  // use storage to perform CRUD operations on the storage interface
  // e.g. storage.insertUser(user) or storage.getUserByUsername(username)

  // Telegram Bot Management API
  app.post('/api/bot/start', async (req, res) => {
    try {
      const { token } = req.body;
      
      if (!token) {
        return res.status(400).json({ error: 'Bot token is required' });
      }

      if (bot) {
        await bot.stopPolling();
        bot = null;
      }

      if (mtprotoClient) {
        await mtprotoClient.disconnect();
        mtprotoClient = null;
      }

      bot = new TelegramBot(token, { polling: true });
      botStatus = { running: true, token: token.slice(0, 10) + '...', lastActivity: new Date().toISOString() as string | null };
      
      // Ensure download directories exist
      ensureDownloadDirs();

      // Initialize MTProto client for large file downloads
      try {
        const apiId = process.env.TG_API_ID || process.env.API_ID;
        const apiHash = process.env.TG_API_HASH || process.env.API_HASH;
        
        if (apiId && apiHash) {
          logger.info('🔌 Initializing MTProto client for large file support...');
          mtprotoClient = new MTProtoClient({
            api_id: parseInt(apiId),
            api_hash: apiHash,
          });
          
          await mtprotoClient.connect();
          logger.info('✅ MTProto client initialized - large files up to 2GB supported');
        } else {
          logger.warn('⚠️ TG_API_ID/TG_API_HASH not found - large file downloads disabled');
        }
      } catch (mtprotoError) {
        const errorMessage = mtprotoError instanceof Error ? mtprotoError.message : 'Unknown error';
        logger.warn(`⚠️ MTProto initialization failed: ${errorMessage} - large files will be limited to 20MB`);
        mtprotoClient = null;
      }

      // Bot message handlers
      bot.on('message', async (msg) => {
        try {
          botStatus.lastActivity = new Date().toISOString();
          logger.info(`Received message from user ${msg.from?.id}: ${msg.text || 'media'}`);
          
          if (msg.text === '/start' || msg.text === '/help') {
            const helpMessage = languageManager.template('HELP_MESSAGE');
            await bot!.sendMessage(msg.chat.id, helpMessage, { parse_mode: 'Markdown' });
            logger.info(`Sent comprehensive help message to user ${msg.from?.id}`);
          } else if (msg.text === '/version') {
            await bot!.sendMessage(msg.chat.id, `🔢 Bot Version: 4.0.9 (Node.js)\n📦 Node.js: ${process.version}\n📱 Telegram Bot API: node-telegram-bot-api\n🎬 YouTube: ytdl-core`);
            logger.info(`Sent version info to user ${msg.from?.id}`);
          } else if (msg.text === '/id') {
            await bot!.sendMessage(msg.chat.id, `🆔 Your User ID: ${msg.from?.id || 'Unknown'}\n💬 Chat ID: ${msg.chat.id}`);
            logger.info(`Sent ID info to user ${msg.from?.id}`);
          } else if (msg.text === '/status') {
            const uptime = process.uptime();
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const secs = Math.floor(uptime % 60);
            const uptimeFormatted = `${hours}h ${minutes}m ${secs}s`;
            
            await bot!.sendMessage(msg.chat.id, 
              `📊 Bot Status\n\n` +
              `🟢 Status: Running\n` +
              `⏰ Uptime: ${uptimeFormatted}\n` +
              `🕐 Last Activity: ${botStatus.lastActivity}\n` +
              `📱 Chat ID: ${msg.chat.id}\n` +
              `👤 User ID: ${msg.from?.id || 'Unknown'}\n\n` +
              `💡 Ready for downloads!`
            );
            logger.info(`Sent status info to user ${msg.from?.id}`);
          } else if (msg.document || msg.photo || msg.video || msg.audio) {
            logger.info(`Processing media message from user ${msg.from?.id}`);
            await handleMediaMessage(msg);
          } else if (msg.text && containsUrl(msg.text)) {
            logger.info(`Processing URL message from user ${msg.from?.id}: ${msg.text}`);
            await handleUrlMessage(msg, msg.text);
          } else if (msg.text && msg.text.trim()) {
            await bot!.sendMessage(msg.chat.id, 
              `Echo: ${msg.text}\n\n` +
              `Send me files, YouTube URLs, or use /help for the complete guide!`
            );
            logger.debug(`Echoed message from user ${msg.from?.id}: ${msg.text}`);
          } else {
            logger.warn(`Received undefined or empty message from user ${msg.from?.id}`);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error(`Bot message handler error: ${errorMessage}`);
        }
      });

      // Add callback query handler for YouTube downloads
      bot.on('callback_query', async (query) => {
        try {
          const data = query.data;
          if (!data) return;

          logger.info(`Processing callback query: ${data} from user ${query.from.id}`);

          const [linkId, action] = data.split(',');
          const url = youtubeLinks.get(parseInt(linkId));

          if (!url) {
            await bot!.answerCallbackQuery(query.id, { text: 'URL not found or expired' });
            logger.warn(`URL not found for linkId: ${linkId}`);
            return;
          }

          await bot!.answerCallbackQuery(query.id, { 
            text: `Starting ${action === 'V' ? 'video' : 'audio'} download...` 
          });

          if (action === 'V') {
            logger.info(`Starting video download for URL: ${url}`);
            await downloadYouTubeVideo(url, query.from.id, query.message?.chat.id);
          } else if (action === 'A') {
            logger.info(`Starting audio download for URL: ${url}`);
            await downloadYouTubeAudio(url, query.from.id, query.message?.chat.id);
          }

          youtubeLinks.delete(parseInt(linkId));

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error(`Callback query error: ${errorMessage}`);
          
          // Try to answer the callback query even if there's an error
          try {
            await bot!.answerCallbackQuery(query.id, { text: 'Error processing request' });
          } catch (answerError) {
            logger.error(`Failed to answer callback query: ${answerError}`);
          }
        }
      });

      bot.on('error', (error) => {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Bot error: ${errorMessage}`);
        botStatus.running = false;
      });

      logger.info(`🚀 Simple Telegram Bot started successfully with token: ${token.slice(0, 10)}...`);
      res.json({ success: true, status: botStatus });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to start bot: ${errorMessage}`);
      res.status(500).json({ error: 'Failed to start bot' });
    }
  });

  app.post('/api/bot/stop', async (req, res) => {
    try {
      if (bot) {
        await bot.stopPolling();
        bot = null;
        logger.info('✅ Simple Telegram Bot stopped successfully');
      }
      
      if (mtprotoClient) {
        await mtprotoClient.disconnect();
        mtprotoClient = null;
        logger.info('✅ MTProto client disconnected');
      }
      
      botStatus = { running: false, token: '', lastActivity: null };
      res.json({ success: true, status: botStatus });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to stop bot: ${errorMessage}`);
      res.status(500).json({ error: 'Failed to stop bot' });
    }
  });

  app.get('/api/bot/status', (req, res) => {
    res.json({ status: botStatus });
  });

  // Download handler functions
  async function handleUrlMessage(msg: any, text: string): Promise<void> {
    const urls = extractUrls(text);
    
    for (const url of urls) {
      if (isYouTubeUrl(url)) {
        await handleYouTubeUrl(msg, url);
      } else {
        await handleDirectDownload(msg, url);
      }
    }
  }

  async function handleYouTubeUrl(msg: any, url: string): Promise<void> {
    try {
      const linkId = Date.now();
      youtubeLinks.set(linkId, url);

      const keyboard = {
        inline_keyboard: [[
          { text: '🎥 Video', callback_data: `${linkId},V` },
          { text: '🎵 Audio', callback_data: `${linkId},A` }
        ]]
      };

      await bot!.sendMessage(msg.chat.id, '🎬 YouTube link detected!\n\nChoose your preferred download option:', {
        reply_markup: keyboard
      });
      logger.info(`Sent YouTube options to user ${msg.from?.id}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`YouTube URL error: ${errorMessage}`);
      await bot!.sendMessage(msg.chat.id, `❌ Failed to process YouTube URL: ${errorMessage}`);
    }
  }

  async function downloadYouTubeVideo(url: string, userId: number, chatId?: number): Promise<void> {
    try {
      if (!chatId) return;

      logger.info(`Starting YouTube video download with yt-dlp: ${url}`);
      await bot!.sendMessage(chatId, '🎥 Starting YouTube video download with yt-dlp...');

      // Use yt-dlp with full path for better reliability
      const { spawn } = require('child_process');
      const ytdlpPath = '/home/runner/workspace/.pythonlibs/bin/yt-dlp';
      
      logger.info(`Using yt-dlp at: ${ytdlpPath}`);
      
      // Create directory structure
      const baseDir = './downloads/youtube/videos';
      if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
      }
      
      const outputTemplate = path.join(baseDir, '%(uploader)s', '%(title)s.%(ext)s');
      logger.info(`Output template: ${outputTemplate}`);
      
      // Download with yt-dlp directly
      const downloadProcess = spawn(ytdlpPath, [
        '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--merge-output-format', 'mp4',
        '-o', outputTemplate,
        '--no-playlist',
        '--retries', '10',
        '--socket-timeout', '60',
        '--print', 'after_move:filepath',
        url
      ], {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      let outputPath = '';
      
      downloadProcess.stdout.on('data', (data: Buffer) => {
        const output = data.toString();
        logger.info(`yt-dlp stdout: ${output}`);
        if (output.includes('.mp4')) {
          outputPath = output.trim();
        }
      });
      
      downloadProcess.stderr.on('data', (data: Buffer) => {
        const error = data.toString();
        logger.info(`yt-dlp stderr: ${error}`);
      });
      
      downloadProcess.on('close', async (code: number) => {
        logger.info(`yt-dlp process finished with code: ${code}`);
        if (code === 0) {
          const fileName = outputPath ? path.basename(outputPath) : 'video';
          logger.info(`✅ Video download completed: ${fileName}`);
          await bot!.sendMessage(chatId, `✅ Video download completed!\n📁 File: ${fileName}\n🎬 Downloaded with yt-dlp (no size limits)`);
        } else {
          logger.error(`❌ yt-dlp failed with code: ${code}`);
          await bot!.sendMessage(chatId, `❌ Video download failed. Please try again or check the URL.`);
        }
      });
      
      downloadProcess.on('error', async (error: Error) => {
        logger.error(`❌ yt-dlp process error: ${error.message}`);
        await bot!.sendMessage(chatId, `❌ Download process failed: ${error.message}`);
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`YouTube video download error: ${errorMessage}`);
      if (chatId) {
        await bot!.sendMessage(chatId, `❌ Video download failed: ${errorMessage}`);
      }
    }
  }

  async function downloadYouTubeAudio(url: string, userId: number, chatId?: number): Promise<void> {
    try {
      if (!chatId) return;

      logger.info(`Starting YouTube audio download with yt-dlp: ${url}`);
      await bot!.sendMessage(chatId, '🎵 Starting YouTube audio download with yt-dlp...');

      // Use yt-dlp with full path for better reliability
      const { spawn } = require('child_process');
      const ytdlpPath = '/home/runner/workspace/.pythonlibs/bin/yt-dlp';
      
      logger.info(`Using yt-dlp at: ${ytdlpPath}`);
      
      // Create directory structure
      const baseDir = './downloads/youtube/audio';
      if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
      }
      
      const outputTemplate = path.join(baseDir, '%(uploader)s', '%(title)s.%(ext)s');
      logger.info(`Output template: ${outputTemplate}`);
      
      // Download with yt-dlp directly
      const downloadProcess = spawn(ytdlpPath, [
        '-f', 'bestaudio/best',
        '-x', '--audio-format', 'mp3',
        '--audio-quality', '320K',
        '-o', outputTemplate,
        '--no-playlist',
        '--retries', '10',
        '--socket-timeout', '60',
        '--print', 'after_move:filepath',
        url
      ], {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      let outputPath = '';
      
      downloadProcess.stdout.on('data', (data: Buffer) => {
        const output = data.toString();
        logger.info(`yt-dlp stdout: ${output}`);
        if (output.includes('.mp3')) {
          outputPath = output.trim();
        }
      });
      
      downloadProcess.stderr.on('data', (data: Buffer) => {
        const error = data.toString();
        logger.info(`yt-dlp stderr: ${error}`);
      });
      
      downloadProcess.on('close', async (code: number) => {
        logger.info(`yt-dlp process finished with code: ${code}`);
        if (code === 0) {
          const fileName = outputPath ? path.basename(outputPath) : 'audio';
          logger.info(`✅ Audio download completed: ${fileName}`);
          await bot!.sendMessage(chatId, `✅ Audio download completed!\n📁 File: ${fileName}\n🎵 Downloaded with yt-dlp (no size limits)`);
        } else {
          logger.error(`❌ yt-dlp failed with code: ${code}`);
          await bot!.sendMessage(chatId, `❌ Audio download failed. Please try again or check the URL.`);
        }
      });
      
      downloadProcess.on('error', async (error: Error) => {
        logger.error(`❌ yt-dlp process error: ${error.message}`);
        await bot!.sendMessage(chatId, `❌ Download process failed: ${error.message}`);
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`YouTube audio download error: ${errorMessage}`);
      if (chatId) {
        await bot!.sendMessage(chatId, `❌ Audio download failed: ${errorMessage}`);
      }
    }
  }

  async function handleDirectDownload(msg: any, url: string): Promise<void> {
    try {
      logger.info(`Starting direct download: ${url}`);
      await bot!.sendMessage(msg.chat.id, `📥 Starting direct download: ${url}`);

      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      const filename = extractFilenameFromUrl(url);
      const outputPath = path.join('./downloads/completed', filename);
      const writeStream = fs.createWriteStream(outputPath);

      response.data.pipe(writeStream);

      writeStream.on('finish', async () => {
        logger.info(`Download completed: ${filename}`);
        await bot!.sendMessage(msg.chat.id, `✅ Download completed: ${filename}\n📁 Location: ${outputPath}`);
      });

      writeStream.on('error', async (error) => {
        logger.error(`Download failed: ${error.message}`);
        await bot!.sendMessage(msg.chat.id, `❌ Download failed: ${error.message}`);
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Direct download error: ${errorMessage}`);
      await bot!.sendMessage(msg.chat.id, `❌ Download failed: ${errorMessage}`);
    }
  }

  async function handleMediaMessage(msg: any): Promise<void> {
    try {
      let fileId: string | undefined;
      let fileName: string = '';

      if (msg.document) {
        fileId = msg.document.file_id;
        fileName = msg.document.file_name || `document_${Date.now()}`;
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
        await bot!.sendMessage(msg.chat.id, '❌ Could not process this media type');
        return;
      }

      logger.info(`Processing media file: ${fileName}`);
      await bot!.sendMessage(msg.chat.id, `📥 Downloading: ${fileName}`);

      await downloadTelegramFile(fileId, fileName, msg.chat.id);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Media download error: ${errorMessage}`);
      await bot!.sendMessage(msg.chat.id, `❌ Media download failed: ${errorMessage}`);
    }
  }

  async function downloadTelegramFile(fileId: string, fileName: string, chatId: number): Promise<void> {
    try {
      const fileInfo = await bot!.getFile(fileId);
      const fileSize = fileInfo.file_size || 0;
      
      logger.info(`File size: ${fileSize} bytes (${Math.round(fileSize / 1024 / 1024)} MB)`);
      
      // Check if file exceeds Bot API limit (20MB) - use MTProto for large files
      if (fileSize > 20 * 1024 * 1024) {
        logger.info(`File too large for Bot API, using MTProto: ${Math.round(fileSize / 1024 / 1024)} MB`);
        
        if (!mtprotoClient || !mtprotoClient.isConnected()) {
          await bot!.sendMessage(chatId, 
            `⚠️ MTProto client not connected\n` +
            `🔄 Cannot download files over 20MB\n` +
            `✨ Restart the bot to enable large file downloads`
          );
          return;
        }
        
        try {
          await bot!.sendMessage(chatId, 
            `🚀 Large file detected (${Math.round(fileSize / 1024 / 1024)} MB)\n` +
            `🔍 Downloading via MTProto API (up to 2GB supported)\n` +
            `⏳ This may take a while...`
          );
          
          // Use MTProto for large files
          const outputPath = await mtprotoClient.downloadFile(
            { file_id: fileId },
            fileName,
            (progress) => {
              if (progress % 25 === 0) { // Report every 25%
                logger.info(`Download progress: ${progress}%`);
              }
            }
          );
          
          await bot!.sendMessage(chatId, 
            `✅ Large file downloaded: ${fileName}\n` +
            `📁 Saved to downloads folder\n` +
            `💾 Size: ${Math.round(fileSize / 1024 / 1024)} MB\n` +
            `✨ Via MTProto API (unlimited size support)`
          );
          
        } catch (mtprotoError) {
          const errorMessage = mtprotoError instanceof Error ? mtprotoError.message : 'Unknown error';
          logger.error(`MTProto download failed: ${errorMessage}`);
          await bot!.sendMessage(chatId, 
            `❌ MTProto download failed: ${errorMessage}\n` +
            `🔄 File too large for this method\n` +
            `✨ Try using the Python bot for this file`
          );
        }
        return;
      }
      
      // Use Bot API for small files (under 20MB)
      const fullToken = (bot as any)?.token || '';
      const fileUrl = `https://api.telegram.org/file/bot${fullToken}/${fileInfo.file_path}`;

      const response = await axios({
        method: 'GET',
        url: fileUrl,
        responseType: 'stream',
        timeout: 300000, // 5 minutes timeout
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      const outputPath = path.join('./downloads/completed', fileName);
      const writeStream = fs.createWriteStream(outputPath);

      response.data.pipe(writeStream);

      writeStream.on('finish', async () => {
        logger.info(`Telegram file download completed: ${fileName}`);
        await bot!.sendMessage(chatId, 
          `✅ File downloaded: ${fileName}\n` +
          `📁 Saved to downloads folder\n` +
          `💾 Size: ${Math.round(fileSize / 1024 / 1024)} MB\n` +
          `🤖 Via Bot API (small file)`
        );
      });

      writeStream.on('error', async (error) => {
        logger.error(`Telegram file download failed: ${error.message}`);
        await bot!.sendMessage(chatId, `❌ Media download failed: ${error.message}`);
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Telegram file download error: ${errorMessage}`);
      
      if (errorMessage.includes('file is too big')) {
        await bot!.sendMessage(chatId, 
          `❌ File too large\n` +
          `🔄 Try restarting the bot to enable MTProto support\n` +
          `✨ MTProto supports up to 2GB files`
        );
      } else {
        await bot!.sendMessage(chatId, `❌ Download failed: ${errorMessage}`);
      }
    }
  }

  function extractFilenameFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      let filename = path.basename(pathname);
      
      if (!filename || filename === '/' || !filename.includes('.')) {
        filename = `download_${Date.now()}.bin`;
      }
      
      return sanitizeFilename(filename);
    } catch (error) {
      return `download_${Date.now()}.bin`;
    }
  }

  // Add API endpoints for download management
  app.get('/api/downloads', async (req, res) => {
    try {
      const downloadsDir = './downloads';
      const result = await getDownloadHistory(downloadsDir);
      res.json(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to get downloads: ${errorMessage}`);
      res.status(500).json({ error: 'Failed to get downloads' });
    }
  });

  app.get('/api/downloads/file/:folder/:filename', async (req, res) => {
    try {
      const { folder, filename } = req.params;
      // Handle URL-encoded folder paths (like youtube%2Faudio)
      const decodedFolder = decodeURIComponent(folder);
      const decodedFilename = decodeURIComponent(filename);
      const filePath = path.join('./downloads', decodedFolder, decodedFilename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
      }

      // Security check - make sure the path is within downloads directory
      const realPath = path.resolve(filePath);
      const downloadsPath = path.resolve('./downloads');
      
      if (!realPath.startsWith(downloadsPath)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const stats = fs.statSync(filePath);
      const ext = path.extname(decodedFilename).toLowerCase();
      
      // Set appropriate content type
      let contentType = 'application/octet-stream';
      if (ext === '.mp4') contentType = 'video/mp4';
      else if (ext === '.mp3') contentType = 'audio/mpeg';
      else if (ext === '.pdf') contentType = 'application/pdf';
      else if (['.jpg', '.jpeg'].includes(ext)) contentType = 'image/jpeg';
      else if (ext === '.png') contentType = 'image/png';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', stats.size);
      res.setHeader('Content-Disposition', `inline; filename="${decodedFilename}"`);
      res.setHeader('Accept-Ranges', 'bytes');
      
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
      
      logger.info(`Served file: ${decodedFilename} (${stats.size} bytes)`);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to serve file: ${errorMessage}`);
      res.status(500).json({ error: 'Failed to serve file' });
    }
  });

  app.delete('/api/downloads/file/:folder/:filename', async (req, res) => {
    try {
      const { folder, filename } = req.params;
      const decodedFolder = decodeURIComponent(folder);
      const decodedFilename = decodeURIComponent(filename);
      const filePath = path.join('./downloads', decodedFolder, decodedFilename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
      }

      // Security check
      const realPath = path.resolve(filePath);
      const downloadsPath = path.resolve('./downloads');
      
      if (!realPath.startsWith(downloadsPath)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      fs.unlinkSync(filePath);
      logger.info(`Deleted file: ${decodedFilename}`);
      res.json({ success: true, message: 'File deleted successfully' });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to delete file: ${errorMessage}`);
      res.status(500).json({ error: 'Failed to delete file' });
    }
  });

  async function getDownloadHistory(downloadsDir: string): Promise<any> {
    const history: any[] = [];
    
    if (!fs.existsSync(downloadsDir)) {
      return { downloads: [], totalFiles: 0, totalSize: 0 };
    }

    // First, try to read from Python bot's download tracking files
    const pythonDownloads = await getPythonBotDownloads();
    history.push(...pythonDownloads);

    const folders = ['completed', 'youtube/videos', 'youtube/audio', 'documents', 'images', 'videos', 'audio', 'archives'];
    let totalSize = 0;
    let totalFiles = 0;

    for (const folder of folders) {
      const folderPath = path.join(downloadsDir, folder);
      if (fs.existsSync(folderPath)) {
        const files = fs.readdirSync(folderPath, { withFileTypes: true });
        
        for (const file of files) {
          if (file.isFile()) {
            const filePath = path.join(folderPath, file.name);
            const stats = fs.statSync(filePath);
            const ext = path.extname(file.name).toLowerCase();
            
            let type = 'document';
            if (['.mp4', '.avi', '.mkv', '.mov'].includes(ext)) type = 'video';
            else if (['.mp3', '.wav', '.flac', '.m4a'].includes(ext)) type = 'audio';
            else if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) type = 'image';
            else if (ext === '.pdf') type = 'pdf';

            history.push({
              id: `${folder}_${file.name}_${stats.mtime.getTime()}`,
              fileName: file.name,
              folder: folder,
              type: type,
              size: stats.size,
              downloadedAt: stats.mtime.toISOString(),
              status: 'completed',
              url: `/api/downloads/file/${encodeURIComponent(folder)}/${encodeURIComponent(file.name)}`,
              fullPath: filePath
            });
            
            totalSize += stats.size;
            totalFiles++;
          }
        }
        
        // Also check subdirectories in youtube folders
        if (folder.includes('youtube')) {
          const subDirs = fs.readdirSync(folderPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory());
          
          for (const subDir of subDirs) {
            const subDirPath = path.join(folderPath, subDir.name);
            const subFiles = fs.readdirSync(subDirPath, { withFileTypes: true });
            
            for (const subFile of subFiles) {
              if (subFile.isFile()) {
                const subFilePath = path.join(subDirPath, subFile.name);
                const stats = fs.statSync(subFilePath);
                const ext = path.extname(subFile.name).toLowerCase();
                
                let type = folder.includes('videos') ? 'video' : 'audio';

                history.push({
                  id: `${folder}_${subDir.name}_${subFile.name}_${stats.mtime.getTime()}`,
                  fileName: subFile.name,
                  folder: `${folder}/${subDir.name}`,
                  type: type,
                  size: stats.size,
                  downloadedAt: stats.mtime.toISOString(),
                  status: 'completed',
                  url: `/api/downloads/file/${encodeURIComponent(folder)}%2F${encodeURIComponent(subDir.name)}/${encodeURIComponent(subFile.name)}`,
                  fullPath: subFilePath,
                  uploader: subDir.name
                });
                
                totalSize += stats.size;
                totalFiles++;
              }
            }
          }
        }
      }
    }

    // Sort by download date (newest first)
    history.sort((a, b) => new Date(b.downloadedAt).getTime() - new Date(a.downloadedAt).getTime());

    return {
      downloads: history,
      totalFiles,
      totalSize,
      lastUpdated: new Date().toISOString()
    };
  }

  // Function to read Python bot download tracking
  async function getPythonBotDownloads(): Promise<any[]> {
    const downloads: any[] = [];
    
    try {
      const configReader = require('../shared/config-reader').configReader;
      const pathsConfig = configReader.getPathsConfig();
      const downloadFilesPath = path.resolve(process.cwd(), pathsConfig.download_files.replace('./', ''));
      
      if (fs.existsSync(downloadFilesPath)) {
        const data = JSON.parse(fs.readFileSync(downloadFilesPath, 'utf-8'));
        
        for (const item of data) {
          // Check if the actual file still exists
          const fileName = item.new_filename || item.original_filename;
          if (fileName && fs.existsSync(path.join('./downloads', fileName))) {
            const stats = fs.statSync(path.join('./downloads', fileName));
            
            downloads.push({
              id: `python_${item.message_id}`,
              fileName,
              folder: 'completed',
              type: path.extname(fileName).toLowerCase().includes('.mp4') ? 'video' : 'document',
              size: stats.size,
              downloadedAt: item.download_date,
              status: 'completed',
              url: `/api/downloads/file/completed/${encodeURIComponent(fileName)}`,
              fullPath: path.join('./downloads', fileName),
              source: 'python_bot',
              messageId: item.message_id,
              userId: item.user_id
            });
          }
        }
      }
    } catch (error) {
      logger.debug('Could not read Python bot downloads:', error);
    }
    
    return downloads;
  }

  app.post('/api/bot/send-message', async (req, res) => {
    try {
      const { chatId, message } = req.body;
      
      if (!bot || !botStatus.running) {
        return res.status(400).json({ error: 'Bot is not running' });
      }

      await bot.sendMessage(chatId, message);
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to send message:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  // Python Telethon Bot Management API
  app.post('/api/python-bot/start', async (req, res) => {
    try {
      // Load configuration from file instead of hardcoded values
      const telegramConfig = configReader.getTelegramConfig();
      const downloadsConfig = configReader.getDownloadsConfig();
      const featuresConfig = configReader.getFeaturesConfig();
      const systemConfig = configReader.getSystemConfig();
      const pathsConfig = configReader.getPathsConfig();
      
      const { botToken, authorizedUserId } = req.body;
      
      // Use config file values as defaults, allow override from request
      const finalBotToken = botToken || telegramConfig.bot_token;
      const finalAuthorizedUserId = authorizedUserId || telegramConfig.authorized_user_ids.join(',');

      if (pythonBot) {
        pythonBot.kill();
        pythonBot = null;
      }

      const botPath = path.join(process.cwd(), 'bot_source', 'main.py');
      const configDir = path.join(process.cwd(), 'tmp', 'config');
      const downloadDir = path.resolve(process.cwd(), downloadsConfig.base_path.replace('./', ''));
      
      // Create directories if they don't exist
      fs.mkdirSync(configDir, { recursive: true });
      fs.mkdirSync(downloadDir, { recursive: true });
      
      // Use configuration file values instead of hardcoded values
      const env = {
        ...process.env,
        TG_API_ID: telegramConfig.api_id,
        TG_API_HASH: telegramConfig.api_hash,
        TG_BOT_TOKEN: finalBotToken,
        TG_AUTHORIZED_USER_ID: finalAuthorizedUserId,
        TG_DOWNLOAD_PATH: downloadDir,
        TG_MAX_PARALLEL: featuresConfig.max_parallel.toString(),
        TG_PROGRESS_DOWNLOAD: featuresConfig.progress_download.toString(),
        APP_LANGUAGE: systemConfig.language,
        PATH_CONFIG: path.resolve(process.cwd(), pathsConfig.config.replace('./', '')),
        PATH_PENDING_MESSAGES: path.resolve(process.cwd(), pathsConfig.pending_messages.replace('./', '')),
        PATH_DOWNLOAD_FILES: path.resolve(process.cwd(), pathsConfig.download_files.replace('./', ''))
      };

      pythonBot = spawn('python3', [botPath], { env });
      pythonBotStatus = {
        running: true,
        apiId: telegramConfig.api_id.slice(0, 3) + '***', // Hidden for security  
        apiHash: telegramConfig.api_hash.slice(0, 8) + '***', // Hidden for security
        botToken: finalBotToken.slice(0, 10) + '...',
        authorizedUserId: finalAuthorizedUserId,
        lastActivity: new Date().toISOString(),
        logs: []
      };

      pythonBot.stdout?.on('data', (data) => {
        const log = data.toString();
        pythonBotStatus.logs.push(`[STDOUT] ${new Date().toISOString()}: ${log}`);
        if (pythonBotStatus.logs.length > 100) {
          pythonBotStatus.logs = pythonBotStatus.logs.slice(-50);
        }
        console.log('Python Bot STDOUT:', log);
      });

      pythonBot.stderr?.on('data', (data) => {
        const log = data.toString();
        pythonBotStatus.logs.push(`[STDERR] ${new Date().toISOString()}: ${log}`);
        if (pythonBotStatus.logs.length > 100) {
          pythonBotStatus.logs = pythonBotStatus.logs.slice(-50);
        }
        console.error('Python Bot STDERR:', log);
      });

      pythonBot.on('close', (code) => {
        console.log(`Python bot process exited with code ${code}`);
        pythonBotStatus.running = false;
        pythonBot = null;
      });

      res.json({ success: true, status: pythonBotStatus });
    } catch (error) {
      console.error('Failed to start Python bot:', error);
      res.status(500).json({ error: 'Failed to start Python bot' });
    }
  });

  app.post('/api/python-bot/stop', async (req, res) => {
    try {
      if (pythonBot) {
        pythonBot.kill();
        pythonBot = null;
      }
      pythonBotStatus = { 
        running: false, 
        apiId: '', 
        apiHash: '', 
        botToken: '',
        authorizedUserId: '',
        lastActivity: null,
        logs: []
      };
      res.json({ success: true, status: pythonBotStatus });
    } catch (error) {
      console.error('Failed to stop Python bot:', error);
      res.status(500).json({ error: 'Failed to stop Python bot' });
    }
  });

  app.get('/api/python-bot/status', (req, res) => {
    res.json({ status: pythonBotStatus });
  });

  app.get('/api/python-bot/logs', (req, res) => {
    res.json({ logs: pythonBotStatus.logs });
  });

  // Python Copier Management API
  app.post('/api/python-copier/start', async (req, res) => {
    try {
      const telegramConfig = configReader.getTelegramConfig();
      const { pairs, sessionString, configContent } = req.body;
      
      if (!pairs || !Array.isArray(pairs) || pairs.length === 0) {
        return res.status(400).json({ error: 'Forward pairs are required' });
      }

      if (!sessionString) {
        return res.status(400).json({ error: 'Session string is required. Please ensure you are logged in to Telegram.' });
      }

      if (pythonCopier) {
        pythonCopier.kill();
        pythonCopier = null;
      }

      const forwarderPath = path.join(process.cwd(), 'bot_source', 'python-copier', 'forwarder.py');
      const configDir = path.join(process.cwd(), 'tmp', 'config');
      const configPath = path.join(configDir, 'copier_config.ini');
      
      // Create directories if they don't exist
      fs.mkdirSync(configDir, { recursive: true });
      
      // Use provided config content (properly formatted) or generate fallback
      let finalConfigContent = configContent;
      if (!finalConfigContent) {
        finalConfigContent = '; Telegram Chat Direct Copier Configuration\n';
        finalConfigContent += '; Generated by Telegram Manager\n\n';
        
        pairs.forEach((pair: any) => {
          finalConfigContent += `[${pair.name}]\n`;
          finalConfigContent += `from = ${pair.fromChat}\n`;
          finalConfigContent += `to = ${pair.toChat}\n`;
          finalConfigContent += `offset = ${pair.offset || 0}\n\n`;
        });
      }
      
      // Write config file
      fs.writeFileSync(configPath, finalConfigContent);

      const env = {
        ...process.env,
        TG_API_ID: telegramConfig.api_id,
        TG_API_HASH: telegramConfig.api_hash,
        CONFIG_PATH: configPath,
        CONFIG_DIR: configDir,
        STRING_SESSION: sessionString
      };

      // Initialize last forwarding log
      const configName = pairs.map(p => p.name).join(', ') || 'Unknown Config';
      lastForwardingLog = {
        configName: configName,
        startTime: new Date().toISOString(),
        endTime: null,
        logs: [`[START] ${new Date().toISOString()}: Started forwarding with config: ${configName}`],
        status: 'running'
      };

      pythonCopier = spawn('python3', [forwarderPath], { env, cwd: path.dirname(forwarderPath) });
      pythonCopierStatus = {
        running: true,
        currentPair: pairs[0]?.name,
        lastActivity: new Date().toISOString(),
        processedMessages: 0,
        totalPairs: pairs.length,
        isPaused: false,
        sessionValid: true,
        currentUserInfo: undefined,
        logs: []
      };

      pythonCopier.stdout?.on('data', (data) => {
        const log = data.toString();
        const timestampedLog = `[STDOUT] ${new Date().toISOString()}: ${log}`;
        
        // Add to current session logs (limited)
        pythonCopierStatus.logs.push(timestampedLog);
        if (pythonCopierStatus.logs.length > 100) {
          pythonCopierStatus.logs = pythonCopierStatus.logs.slice(-50);
        }
        
        // Add to complete last forwarding log (unlimited)
        if (lastForwardingLog) {
          lastForwardingLog.logs.push(timestampedLog);
        }
        
        console.log('Python Copier STDOUT:', log);
        
        // Parse logs to extract progress info
        if (log.includes('Forwarded message')) {
          pythonCopierStatus.processedMessages++;
        }
        if (log.includes('Processing forward pair:')) {
          const match = log.match(/Processing forward pair: (.+)/);
          if (match) {
            pythonCopierStatus.currentPair = match[1];
          }
        }
      });

      pythonCopier.stderr?.on('data', (data) => {
        const log = data.toString();
        const timestampedLog = `[STDERR] ${new Date().toISOString()}: ${log}`;
        
        // Add to current session logs (limited)
        pythonCopierStatus.logs.push(timestampedLog);
        if (pythonCopierStatus.logs.length > 100) {
          pythonCopierStatus.logs = pythonCopierStatus.logs.slice(-50);
        }
        
        // Add to complete last forwarding log (unlimited)
        if (lastForwardingLog) {
          lastForwardingLog.logs.push(timestampedLog);
        }
        
        console.error('Python Copier STDERR:', log);
      });

      pythonCopier.on('close', (code) => {
        console.log(`Python copier process exited with code ${code}`);
        pythonCopierStatus.running = false;
        pythonCopier = null;
        
        // Finalize last forwarding log
        if (lastForwardingLog) {
          lastForwardingLog.endTime = new Date().toISOString();
          lastForwardingLog.status = code === 0 ? 'completed' : 'failed';
          lastForwardingLog.logs.push(`[END] ${new Date().toISOString()}: Process ended with code ${code}`);
        }
      });

      res.json({ success: true, status: pythonCopierStatus });
    } catch (error) {
      console.error('Failed to start Python copier:', error);
      res.status(500).json({ error: 'Failed to start Python copier' });
    }
  });

  app.post('/api/python-copier/stop', async (req, res) => {
    try {
      if (pythonCopier) {
        pythonCopier.kill();
        pythonCopier = null;
      }
      pythonCopierStatus = { 
        running: false, 
        currentPair: undefined,
        lastActivity: null,
        processedMessages: 0,
        totalPairs: 0,
        isPaused: false,
        sessionValid: false,
        currentUserInfo: undefined,
        logs: []
      };
      res.json({ success: true, status: pythonCopierStatus });
    } catch (error) {
      console.error('Failed to stop Python copier:', error);
      res.status(500).json({ error: 'Failed to stop Python copier' });
    }
  });

  app.get('/api/python-copier/status', (req, res) => {
    res.json({ status: pythonCopierStatus });
  });

  app.get('/api/python-copier/logs', (req, res) => {
    res.json({ logs: pythonCopierStatus.logs });
  });

  // Clear logs endpoint
  app.post('/api/python-copier/clear-logs', (req, res) => {
    try {
      pythonCopierStatus.logs = [];
      res.json({ success: true, message: 'Logs cleared successfully' });
    } catch (error) {
      console.error('Failed to clear logs:', error);
      res.status(500).json({ error: 'Failed to clear logs' });
    }
  });

  // Update offset endpoint - for real-time offset updates during forwarding
  app.post('/api/python-copier/update-offset', (req, res) => {
    try {
      const { pairName, newOffset } = req.body;
      
      if (!pairName || newOffset === undefined) {
        return res.status(400).json({ error: 'Pair name and new offset are required' });
      }

      const configDir = path.join(process.cwd(), 'tmp', 'config');
      const configPath = path.join(configDir, 'copier_config.ini');
      
      if (!fs.existsSync(configPath)) {
        return res.status(404).json({ error: 'Config file not found' });
      }

      // Read current config
      let configContent = fs.readFileSync(configPath, 'utf8');
      
      // Update the specific pair's offset
      const lines = configContent.split('\n');
      let inTargetSection = false;
      let updatedLines: string[] = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        
        if (trimmed === `[${pairName}]`) {
          inTargetSection = true;
          updatedLines.push(line);
        } else if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          inTargetSection = false;
          updatedLines.push(line);
        } else if (inTargetSection && trimmed.startsWith('offset =')) {
          updatedLines.push(`offset = ${newOffset}`);
        } else {
          updatedLines.push(line);
        }
      }
      
      // Write updated config back
      const updatedConfigContent = updatedLines.join('\n');
      fs.writeFileSync(configPath, updatedConfigContent);
      
      res.json({ success: true, message: 'Offset updated successfully' });
    } catch (error) {
      console.error('Failed to update offset:', error);
      res.status(500).json({ error: 'Failed to update offset' });
    }
  });

  // Store for last forwarding session log
  let lastForwardingLog: {
    configName: string;
    startTime: string;
    endTime: string | null;
    logs: string[];
    status: 'running' | 'completed' | 'failed';
  } | null = null;

  // Get last forwarding log endpoint
  app.get('/api/python-copier/last-log', (req, res) => {
    try {
      if (!lastForwardingLog) {
        return res.json({ hasLog: false, message: 'No previous forwarding log available' });
      }
      
      res.json({ 
        hasLog: true,
        log: lastForwardingLog
      });
    } catch (error) {
      console.error('Failed to retrieve last log:', error);
      res.status(500).json({ error: 'Failed to retrieve last log' });
    }
  });

  app.get('/api/python-copier/config', (req, res) => {
    try {
      const configDir = path.join(process.cwd(), 'tmp', 'config');
      const configPath = path.join(configDir, 'copier_config.ini');
      
      let configContent = '';
      let pairs: any[] = [];
      
      if (fs.existsSync(configPath)) {
        configContent = fs.readFileSync(configPath, 'utf8');
        
        // Parse the config file to extract pairs
        const lines = configContent.split('\n');
        let currentPair: any = null;
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            if (currentPair) {
              pairs.push(currentPair);
            }
            currentPair = {
              id: Date.now().toString() + Math.random(),
              name: trimmed.slice(1, -1),
              fromChat: '',
              toChat: '',
              fromOffset: 0,
              toOffset: 0,
              currentOffset: 0,
              status: 'pending',
              isActive: true
            };
          } else if (currentPair && trimmed.includes('=')) {
            const [key, value] = trimmed.split('=').map(s => s.trim());
            if (key === 'from') currentPair.fromChat = value;
            if (key === 'to') currentPair.toChat = value;
            if (key === 'offset') {
              const offsetValue = parseInt(value) || 0;
              currentPair.fromOffset = offsetValue;
              currentPair.currentOffset = offsetValue;
            }
          }
        }
        
        if (currentPair) {
          pairs.push(currentPair);
        }
      }
      
      res.json({ configContent, pairs });
    } catch (error) {
      console.error('Failed to load config:', error);
      res.status(500).json({ error: 'Failed to load config' });
    }
  });

  app.post('/api/python-copier/config', (req, res) => {
    try {
      const { pairs, configContent } = req.body;
      const configDir = path.join(process.cwd(), 'tmp', 'config');
      const configPath = path.join(configDir, 'copier_config.ini');
      
      // Create directory if it doesn't exist
      fs.mkdirSync(configDir, { recursive: true });
      
      // Use provided config content or generate from pairs
      const content = configContent || generateConfigContent(pairs);
      
      // Write config file
      fs.writeFileSync(configPath, content);
      
      res.json({ success: true, message: 'Configuration saved successfully' });
    } catch (error) {
      console.error('Failed to save config:', error);
      res.status(500).json({ error: 'Failed to save config' });
    }
  });

  // Save custom config content endpoint
  app.post('/api/python-copier/config/custom', (req, res) => {
    try {
      const { configContent } = req.body;
      
      if (!configContent || typeof configContent !== 'string') {
        return res.status(400).json({ error: 'Config content is required' });
      }
      
      const configDir = path.join(process.cwd(), 'tmp', 'config');
      const configPath = path.join(configDir, 'copier_config.ini');
      
      // Create directory if it doesn't exist
      fs.mkdirSync(configDir, { recursive: true });
      
      // Write the custom config content directly
      fs.writeFileSync(configPath, configContent);
      
      res.json({ success: true, message: 'Custom configuration saved successfully' });
    } catch (error) {
      console.error('Failed to save custom config:', error);
      res.status(500).json({ error: 'Failed to save custom config' });
    }
  });

  // Helper function to generate config content
  function generateConfigContent(pairs: any[]): string {
    let content = '; Telegram Chat Direct Copier Configuration\n';
    content += '; Generated by Telegram Manager\n\n';
    
    pairs.forEach((pair: any) => {
      content += `[${pair.name}]\n`;
      content += `from = ${pair.fromChat}\n`;
      content += `to = ${pair.toChat}\n`;
      // Use currentOffset first, then fromOffset, then fallback to 0
      const offset = pair.currentOffset !== undefined ? pair.currentOffset : 
                     pair.fromOffset !== undefined ? pair.fromOffset : 
                     pair.offset !== undefined ? pair.offset : 0;
      content += `offset = ${offset}\n\n`;
    });
    
    return content;
  }

  // Enhanced Python Copier API endpoints
  app.post('/api/python-copier/test-session', async (req, res) => {
    try {
      const { sessionString } = req.body;
      
      if (!sessionString) {
        return res.status(400).json({ error: 'Session string is required' });
      }

      const telegramConfig = configReader.getTelegramConfig();
      const testScriptPath = path.join(process.cwd(), 'bot_source', 'python-copier', 'test_session.py');
      
      // Create a simple test script to verify session
      const testScript = `
import asyncio
import json
import sys
from telethon import TelegramClient
from telethon.sessions import StringSession

async def test_session():
    try:
        session = StringSession("${sessionString}")
        async with TelegramClient(session, ${telegramConfig.api_id}, "${telegramConfig.api_hash}") as client:
            me = await client.get_me()
            return {
                "success": True,
                "userInfo": {
                    "id": me.id,
                    "username": me.username or "No username",
                    "firstName": me.first_name or ""
                }
            }
    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    result = asyncio.run(test_session())
    print(json.dumps(result))
`;

      // Write test script temporarily
      fs.writeFileSync(testScriptPath, testScript);

      const testProcess = spawn('python3', [testScriptPath], { 
        cwd: path.dirname(testScriptPath),
        timeout: 30000
      });

      let output = '';
      testProcess.stdout?.on('data', (data) => {
        output += data.toString();
      });

      testProcess.stderr?.on('data', (data) => {
        output += data.toString();
      });

      testProcess.on('close', (code) => {
        try {
          // Clean up test script
          if (fs.existsSync(testScriptPath)) {
            fs.unlinkSync(testScriptPath);
          }

          if (output.trim()) {
            const result = JSON.parse(output.trim().split('\n').pop() || '{}');
            if (result.success) {
              res.json({ success: true, userInfo: result.userInfo });
            } else {
              res.status(400).json({ error: result.error || 'Session validation failed' });
            }
          } else {
            res.status(500).json({ error: 'No output from session test' });
          }
        } catch (parseError) {
          console.error('Failed to parse test output:', output);
          res.status(500).json({ error: 'Failed to parse session test result' });
        }
      });

    } catch (error) {
      console.error('Failed to test session:', error);
      res.status(500).json({ error: 'Failed to test session string' });
    }
  });

  app.post('/api/python-copier/start-pair', async (req, res) => {
    try {
      const { pairId, sessionString } = req.body;
      
      if (!pairId || !sessionString) {
        return res.status(400).json({ error: 'Pair ID and session string are required' });
      }

      // This would start an individual pair - for now, return success
      // In a full implementation, you'd modify the forwarder to support individual pairs
      res.json({ 
        success: true, 
        message: `Started forwarding for pair ${pairId}`,
        pairId 
      });
    } catch (error) {
      console.error('Failed to start individual pair:', error);
      res.status(500).json({ error: 'Failed to start individual pair' });
    }
  });

  app.post('/api/python-copier/pause', async (req, res) => {
    try {
      if (pythonCopier) {
        // Send SIGTERM to pause gracefully
        pythonCopier.kill('SIGTERM');
        pythonCopierStatus.running = false;
        pythonCopierStatus.isPaused = true;
      }
      
      res.json({ 
        success: true, 
        message: 'Python copier paused',
        status: pythonCopierStatus 
      });
    } catch (error) {
      console.error('Failed to pause copier:', error);
      res.status(500).json({ error: 'Failed to pause copier' });
    }
  });

  app.post('/api/python-copier/resume', async (req, res) => {
    try {
      // Resume would restart the copier with current config
      // For now, return success
      pythonCopierStatus.isPaused = false;
      
      res.json({ 
        success: true, 
        message: 'Python copier resumed',
        status: pythonCopierStatus 
      });
    } catch (error) {
      console.error('Failed to resume copier:', error);
      res.status(500).json({ error: 'Failed to resume copier' });
    }
  });

  // Node.js Telegram Bot API (New Implementation)
  app.post('/api/node-bot/start', async (req, res) => {
    try {
      // Load configuration from file
      const telegramConfig = configReader.getTelegramConfig();
      const downloadsConfig = configReader.getDownloadsConfig();
      const featuresConfig = configReader.getFeaturesConfig();
      const systemConfig = configReader.getSystemConfig();
      
      // Allow override from request body, but use config file as defaults
      const { 
        api_id = telegramConfig.api_id, 
        api_hash = telegramConfig.api_hash, 
        bot_token = telegramConfig.bot_token, 
        authorized_user_ids = telegramConfig.authorized_user_ids, 
        download_path = downloadsConfig.base_path,
        max_parallel = featuresConfig.max_parallel,
        progress_download = featuresConfig.progress_download,
        language = systemConfig.language
      } = req.body;

      console.log('🚀 Starting Node.js bot with config file values');
      console.log('API ID:', api_id);
      console.log('Bot Token:', bot_token.slice(0, 10) + '...');
      console.log('Authorized Users:', authorized_user_ids);

      if (!api_id || !api_hash || !bot_token) {
        return res.status(400).json({ 
          error: 'api_id, api_hash, and bot_token are required' 
        });
      }

      // Stop existing bot if running
      if (nodeBotManager) {
        await nodeBotManager.stop();
        destroyBotManager();
      }

      // Resolve download path
      const resolvedDownloadPath = path.resolve(process.cwd(), download_path.replace('./', ''));
      
      // Create download directories
      fs.mkdirSync(resolvedDownloadPath, { recursive: true });
      fs.mkdirSync(path.join(resolvedDownloadPath, 'completed'), { recursive: true });
      fs.mkdirSync(path.join(resolvedDownloadPath, 'youtube'), { recursive: true });
      fs.mkdirSync(path.join(resolvedDownloadPath, 'temp'), { recursive: true });

      // Create new bot manager with enhanced features
      nodeBotManager = createBotManager({
        api_id: parseInt(api_id),
        api_hash,
        bot_token,
        authorized_user_ids: Array.isArray(authorized_user_ids) ? authorized_user_ids : [authorized_user_ids],
        download_path: resolvedDownloadPath,
        max_parallel: parseInt(max_parallel),
        progress_download: Boolean(progress_download),
        language,
        features: {
          enableUnzip: featuresConfig.enabled_unzip,
          enableUnrar: featuresConfig.enabled_unrar,
          enable7z: featuresConfig.enabled_7z,
          enableYoutube: featuresConfig.enabled_youtube,
        }
      });

      // Start the bot
      await nodeBotManager.start();

      res.json({ 
        success: true, 
        status: nodeBotManager.getStatus(),
        message: 'Node.js Telegram Bot started successfully'
      });

    } catch (error) {
      console.error('Failed to start Node.js bot:', error);
      res.status(500).json({ 
        error: 'Failed to start Node.js bot', 
        details: error.message 
      });
    }
  });

  app.post('/api/node-bot/stop', async (req, res) => {
    try {
      if (nodeBotManager) {
        await nodeBotManager.stop();
        destroyBotManager();
        nodeBotManager = null;
      }

      res.json({ 
        success: true, 
        message: 'Node.js Telegram Bot stopped successfully' 
      });
    } catch (error) {
      console.error('Failed to stop Node.js bot:', error);
      res.status(500).json({ 
        error: 'Failed to stop Node.js bot', 
        details: error.message 
      });
    }
  });

  app.post('/api/node-bot/restart', async (req, res) => {
    try {
      if (!nodeBotManager) {
        return res.status(400).json({ error: 'Bot is not running' });
      }

      await nodeBotManager.restart();

      res.json({ 
        success: true, 
        status: nodeBotManager.getStatus(),
        message: 'Node.js Telegram Bot restarted successfully'
      });
    } catch (error) {
      console.error('Failed to restart Node.js bot:', error);
      res.status(500).json({ 
        error: 'Failed to restart Node.js bot', 
        details: error.message 
      });
    }
  });

  app.get('/api/node-bot/status', (req, res) => {
    if (!nodeBotManager) {
      return res.json({ 
        running: false, 
        message: 'Bot is not initialized' 
      });
    }

    res.json(nodeBotManager.getStatus());
  });

  app.get('/api/node-bot/downloads', (req, res) => {
    if (!nodeBotManager) {
      return res.status(400).json({ error: 'Bot is not running' });
    }

    res.json({ downloads: nodeBotManager.getActiveDownloads() });
  });

  app.post('/api/node-bot/download/cancel', async (req, res) => {
    try {
      const { downloadId } = req.body;

      if (!nodeBotManager) {
        return res.status(400).json({ error: 'Bot is not running' });
      }

      const success = nodeBotManager.cancelDownload(downloadId);

      res.json({ 
        success, 
        message: success ? 'Download cancelled' : 'Download not found' 
      });
    } catch (error) {
      console.error('Failed to cancel download:', error);
      res.status(500).json({ 
        error: 'Failed to cancel download', 
        details: error.message 
      });
    }
  });

  app.post('/api/node-bot/youtube/download', async (req, res) => {
    try {
      const { url, format = 'video' } = req.body;

      if (!nodeBotManager) {
        return res.status(400).json({ error: 'Bot is not running' });
      }

      if (!url) {
        return res.status(400).json({ error: 'URL is required' });
      }

      const isValid = await nodeBotManager.isValidYouTubeUrl(url);
      if (!isValid) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
      }

      let result;
      if (format === 'audio') {
        result = await nodeBotManager.downloadYouTubeAudio(url);
      } else {
        result = await nodeBotManager.downloadYouTubeVideo(url);
      }

      res.json({ 
        success: true, 
        filePath: result,
        message: `YouTube ${format} download completed`
      });

    } catch (error) {
      console.error('Failed to download YouTube content:', error);
      res.status(500).json({ 
        error: 'Failed to download YouTube content', 
        details: error.message 
      });
    }
  });

  app.post('/api/node-bot/direct/download', async (req, res) => {
    try {
      const { url, filename } = req.body;

      if (!nodeBotManager) {
        return res.status(400).json({ error: 'Bot is not running' });
      }

      if (!url) {
        return res.status(400).json({ error: 'URL is required' });
      }

      const result = await nodeBotManager.downloadDirectUrl(url, filename);

      res.json({ 
        success: result.success, 
        filePath: result.filePath,
        message: result.success ? 'Direct download completed' : 'Download failed',
        error: result.error
      });

    } catch (error) {
      console.error('Failed to download direct URL:', error);
      res.status(500).json({ 
        error: 'Failed to download direct URL', 
        details: error.message 
      });
    }
  });

  app.post('/api/node-bot/extract', async (req, res) => {
    try {
      const { filePath, outputDir } = req.body;

      if (!nodeBotManager) {
        return res.status(400).json({ error: 'Bot is not running' });
      }

      if (!filePath) {
        return res.status(400).json({ error: 'File path is required' });
      }

      const result = await nodeBotManager.extractFile(filePath, outputDir);

      res.json({ 
        success: result.success, 
        extractedFiles: result.extractedFiles,
        outputPath: result.outputPath,
        message: result.success ? 'File extracted successfully' : 'Extraction failed',
        error: result.error
      });

    } catch (error) {
      console.error('Failed to extract file:', error);
      res.status(500).json({ 
        error: 'Failed to extract file', 
        details: error.message 
      });
    }
  });

  app.get('/api/node-bot/youtube/info', async (req, res) => {
    try {
      const { url } = req.query;

      if (!nodeBotManager) {
        return res.status(400).json({ error: 'Bot is not running' });
      }

      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'URL is required' });
      }

      const info = await nodeBotManager.getYouTubeInfo(url);

      res.json({ success: true, info });

    } catch (error) {
      console.error('Failed to get YouTube info:', error);
      res.status(500).json({ 
        error: 'Failed to get YouTube info', 
        details: error.message 
      });
    }
  });

  app.put('/api/node-bot/config', async (req, res) => {
    try {
      if (!nodeBotManager) {
        return res.status(400).json({ error: 'Bot is not running' });
      }

      const config = req.body;
      nodeBotManager.updateConfig(config);

      res.json({ 
        success: true, 
        config: nodeBotManager.getConfig(),
        message: 'Configuration updated successfully'
      });

    } catch (error) {
      console.error('Failed to update config:', error);
      res.status(500).json({ 
        error: 'Failed to update config', 
        details: error.message 
      });
    }
  });

  app.get('/api/node-bot/health', (req, res) => {
    if (!nodeBotManager) {
      return res.status(503).json({ 
        healthy: false, 
        message: 'Bot is not initialized' 
      });
    }

    const healthy = nodeBotManager.isHealthy();
    res.status(healthy ? 200 : 503).json({ 
      healthy, 
      status: nodeBotManager.getStatus() 
    });
  });

  // Store for active forwarding jobs
  const forwardJobs = new Map<string, Partial<ForwardJob>>();

  // Telegram Forwarder API endpoints
  app.post('/api/telegram/start-forwarding', async (req, res) => {
    try {
      // Validate the request body - now includes session info
      const requestData = forwardConfigSchema.extend({
        sessionString: z.string().min(1, "Session string is required"),
        apiId: z.number().min(1, "API ID is required"),
        apiHash: z.string().min(1, "API Hash is required"),
      }).parse(req.body);
      
      const { sessionString, apiId, apiHash, ...config } = requestData;

      const jobId = await TelegramForwarder.startForwarding(
        config,
        sessionString,
        apiId,
        apiHash,
        (jobId: string, update: Partial<ForwardJob>) => {
          // Update the job in our store
          const existingJob = forwardJobs.get(jobId) || {};
          forwardJobs.set(jobId, { ...existingJob, ...update });
          
          // Here you could also emit to WebSocket clients for real-time updates
          logger.info(`Job ${jobId} updated: ${JSON.stringify(update)}`);
        }
      );

      // Initialize job in our store
      const initialJob: Partial<ForwardJob> = {
        id: jobId,
        config,
        status: 'running',
        currentOffset: config.offsetFrom,
        progress: 0,
        logs: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      forwardJobs.set(jobId, initialJob);

      res.json({ 
        success: true, 
        jobId,
        job: initialJob
      });

    } catch (error) {
      logger.error(`Failed to start forwarding: ${error instanceof Error ? error.message : String(error)}`);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ 
        error: 'Failed to start forwarding', 
        details: errorMessage 
      });
    }
  });

  app.post('/api/telegram/stop-forwarding', async (req, res) => {
    try {
      const { jobId } = req.body;
      
      if (!jobId) {
        return res.status(400).json({ error: 'Job ID is required' });
      }

      await TelegramForwarder.stopForwarding(jobId);

      // Update job status in our store
      const existingJob = forwardJobs.get(jobId);
      if (existingJob) {
        existingJob.status = 'paused';
        existingJob.updatedAt = new Date().toISOString();
        forwardJobs.set(jobId, existingJob);
      }

      res.json({ 
        success: true, 
        message: 'Forwarding stopped successfully'
      });

    } catch (error) {
      logger.error(`Failed to stop forwarding: ${error instanceof Error ? error.message : String(error)}`);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ 
        error: 'Failed to stop forwarding', 
        details: errorMessage 
      });
    }
  });

  app.get('/api/telegram/forwarding-jobs', (req, res) => {
    try {
      const jobs = Array.from(forwardJobs.values()).map(job => ({
        ...job,
        // Get fresh status and logs from the forwarder
        ...TelegramForwarder.getJobStatus(job.id || ''),
      }));

      res.json({ jobs });

    } catch (error) {
      logger.error(`Failed to get forwarding jobs: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ 
        error: 'Failed to get forwarding jobs',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.get('/api/telegram/forwarding-job/:jobId', (req, res) => {
    try {
      const { jobId } = req.params;
      const job = forwardJobs.get(jobId);
      
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      // Get fresh status and logs from the forwarder
      const freshStatus = TelegramForwarder.getJobStatus(jobId);
      const updatedJob = { ...job, ...freshStatus };

      res.json({ job: updatedJob });

    } catch (error) {
      logger.error(`Failed to get forwarding job: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ 
        error: 'Failed to get forwarding job',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.get('/api/telegram/forwarding-job/:jobId/logs', (req, res) => {
    try {
      const { jobId } = req.params;
      const logs = TelegramForwarder.getJobLogs(jobId);

      res.json({ logs });

    } catch (error) {
      logger.error(`Failed to get forwarding job logs: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ 
        error: 'Failed to get forwarding job logs',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // GitHub PAT and Sync Routes
  
  // Helper function to get GitHub PAT token
  const getGitHubToken = async (req: any): Promise<string | null> => {
    // Check for PAT in Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    
    // Check for PAT in custom header
    const patHeader = req.headers['x-github-pat'];
    if (patHeader) {
      return patHeader;
    }
    
    // Use default PAT with full GitHub permissions
    return await storage.getDefaultGitHubPAT();
  };
  
  // Get GitHub user repositories
  app.get('/api/github/repos', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) {
        return res.status(401).json({ error: 'No GitHub Personal Access Token provided' });
      }
      
      const response = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitHubSync',
        },
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return res.status(response.status).json({ 
          error: 'Failed to fetch repositories',
          details: errorData.message || response.statusText
        });
      }
      
      const repos = await response.json();
      res.json({ repos });
      
    } catch (error) {
      logger.error(`Failed to fetch GitHub repos: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ 
        error: 'Failed to fetch repositories',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // Get GitHub user info
  app.get('/api/github/user', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) {
        return res.status(401).json({ error: 'No GitHub Personal Access Token provided' });
      }
      
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitHubSync',
        },
      });
      
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch user info' });
      }
      
      const user = await response.json();
      res.json({ user });
      
    } catch (error) {
      logger.error(`Failed to fetch GitHub user: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ 
        error: 'Failed to fetch user info',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // Create new GitHub repository
  app.post('/api/github/repos', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) {
        return res.status(401).json({ error: 'No GitHub Personal Access Token provided' });
      }
      
      const { name, private: isPrivate = false, description = '' } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: 'Repository name is required' });
      }
      
      const response = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitHubSync',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          private: isPrivate,
          description: description || `Synced from Replit workspace`,
          auto_init: true,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return res.status(response.status).json({ 
          error: 'Failed to create repository',
          details: errorData.message || response.statusText
        });
      }
      
      const repo = await response.json();
      res.json({ repo });
      
    } catch (error) {
      logger.error(`Failed to create GitHub repo: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ 
        error: 'Failed to create repository',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // Get repository packages
  app.get('/api/github/repos/:owner/:repo/packages', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) {
        return res.status(401).json({ error: 'No GitHub Personal Access Token provided' });
      }
      
      const { owner, repo } = req.params;
      
      const response = await fetch(`https://api.github.com/orgs/${owner}/packages?package_type=container`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitHubSync',
          'Accept': 'application/vnd.github.v3+json',
        },
      });
      
      if (!response.ok && response.status !== 404) {
        return res.status(response.status).json({ error: 'Failed to fetch packages' });
      }
      
      const packages = response.status === 404 ? [] : await response.json();
      res.json(packages);
      
    } catch (error) {
      logger.error(`Failed to fetch packages: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to fetch packages' });
    }
  });

  // Get repository releases
  app.get('/api/github/repos/:owner/:repo/releases', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) {
        return res.status(401).json({ error: 'No GitHub Personal Access Token provided' });
      }
      
      const { owner, repo } = req.params;
      
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitHubSync',
        },
      });
      
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch releases' });
      }
      
      const releases = await response.json();
      res.json(releases);
      
    } catch (error) {
      logger.error(`Failed to fetch releases: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to fetch releases' });
    }
  });

  // Get repository deployments
  app.get('/api/github/repos/:owner/:repo/deployments', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) {
        return res.status(401).json({ error: 'No GitHub Personal Access Token provided' });
      }
      
      const { owner, repo } = req.params;
      
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/deployments`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitHubSync',
        },
      });
      
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch deployments' });
      }
      
      const deployments = await response.json();
      res.json(deployments);
      
    } catch (error) {
      logger.error(`Failed to fetch deployments: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to fetch deployments' });
    }
  });

  // Get repository environments
  app.get('/api/github/repos/:owner/:repo/environments', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) {
        return res.status(401).json({ error: 'No GitHub Personal Access Token provided' });
      }
      
      const { owner, repo } = req.params;
      
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/environments`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitHubSync',
        },
      });
      
      if (!response.ok && response.status !== 404) {
        return res.status(response.status).json({ error: 'Failed to fetch environments' });
      }
      
      const environments = response.status === 404 ? { environments: [] } : await response.json();
      res.json(environments.environments || []);
      
    } catch (error) {
      logger.error(`Failed to fetch environments: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to fetch environments' });
    }
  });

  // Get repository discussions
  app.get('/api/github/repos/:owner/:repo/discussions', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) {
        return res.status(401).json({ error: 'No GitHub Personal Access Token provided' });
      }
      
      const { owner, repo } = req.params;
      
      // GitHub GraphQL API for discussions
      const query = `
        query {
          repository(owner: "${owner}", name: "${repo}") {
            discussions(first: 10) {
              nodes {
                title
                body
                author {
                  login
                }
                createdAt
                updatedAt
              }
            }
          }
        }
      `;
      
      const response = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitHubSync',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });
      
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch discussions' });
      }
      
      const data = await response.json();
      const discussions = data.data?.repository?.discussions?.nodes || [];
      res.json(discussions);
      
    } catch (error) {
      logger.error(`Failed to fetch discussions: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to fetch discussions' });
    }
  });

  // Get repository projects
  app.get('/api/github/repos/:owner/:repo/projects', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) {
        return res.status(401).json({ error: 'No GitHub Personal Access Token provided' });
      }
      
      const { owner, repo } = req.params;
      
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/projects`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitHubSync',
          'Accept': 'application/vnd.github.inertia-preview+json',
        },
      });
      
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch projects' });
      }
      
      const projects = await response.json();
      res.json(projects);
      
    } catch (error) {
      logger.error(`Failed to fetch projects: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to fetch projects' });
    }
  });

  // Get notifications
  app.get('/api/github/notifications', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) {
        return res.status(401).json({ error: 'No GitHub Personal Access Token provided' });
      }
      
      const response = await fetch('https://api.github.com/notifications', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitHubSync',
        },
      });
      
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch notifications' });
      }
      
      const notifications = await response.json();
      res.json(notifications);
      
    } catch (error) {
      logger.error(`Failed to fetch notifications: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to fetch notifications' });
    }
  });

  // Archive repository
  app.post('/api/github/repos/:owner/:repo/archive', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) {
        return res.status(401).json({ error: 'No GitHub Personal Access Token provided' });
      }
      
      const { owner, repo } = req.params;
      
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitHubSync',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          archived: true
        }),
      });
      
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to archive repository' });
      }
      
      const result = await response.json();
      res.json(result);
      
    } catch (error) {
      logger.error(`Failed to archive repository: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to archive repository' });
    }
  });

  // Get user gists
  app.get('/api/github/gists', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) {
        return res.status(401).json({ error: 'No GitHub Personal Access Token provided' });
      }
      
      const response = await fetch('https://api.github.com/gists', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitHubSync',
        },
      });
      
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch gists' });
      }
      
      const gists = await response.json();
      res.json(gists);
      
    } catch (error) {
      logger.error(`Failed to fetch gists: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to fetch gists' });
    }
  });

  // Get user SSH keys
  app.get('/api/github/user/keys', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) {
        return res.status(401).json({ error: 'No GitHub Personal Access Token provided' });
      }
      
      const response = await fetch('https://api.github.com/user/keys', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitHubSync',
        },
      });
      
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch SSH keys' });
      }
      
      const keys = await response.json();
      res.json(keys);
      
    } catch (error) {
      logger.error(`Failed to fetch SSH keys: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to fetch SSH keys' });
    }
  });

  // Get user GPG keys
  app.get('/api/github/user/gpg-keys', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) {
        return res.status(401).json({ error: 'No GitHub Personal Access Token provided' });
      }
      
      const response = await fetch('https://api.github.com/user/gpg_keys', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitHubSync',
        },
      });
      
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch GPG keys' });
      }
      
      const keys = await response.json();
      res.json(keys);
      
    } catch (error) {
      logger.error(`Failed to fetch GPG keys: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to fetch GPG keys' });
    }
  });
  
  // Sync files to GitHub repository
  app.post('/api/github/sync', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) {
        return res.status(401).json({ error: 'Not authenticated with GitHub' });
      }
      
      const { repoFullName, files, targetPath = '' } = req.body;
      
      if (!repoFullName || !files || !Array.isArray(files)) {
        return res.status(400).json({ error: 'Repository name and files are required' });
      }
      
      // Import utilities dynamically to avoid circular dependencies
      const { validateGitHubRepo } = await import('./utils/github-uploader');
      
      // Skip validation - proceed directly to upload with token
      logger.info(`Proceeding with upload to ${repoFullName} using token`);
      
      // Import the existing uploadToGitHub function
      const { uploadToGitHub } = await import('./utils/github-uploader');
      
      // Convert files to the expected format
      const project = {
        name: 'uploaded-files',
        files: files.map((file: any) => ({
          path: targetPath ? `${targetPath}/${file.path}` : file.path,
          content: file.content,
          encoding: file.encoding || 'utf8',
          type: 'file' as const,
          size: file.content ? Buffer.byteLength(file.content, file.encoding || 'utf8') : 0
        })),
        totalSize: files.reduce((total: number, file: any) => total + Buffer.byteLength(file.content, file.encoding || 'utf8'), 0)
      };
      
      logger.info(`Starting sync of ${project.files.length} files to ${repoFullName}${targetPath ? ` (target: ${targetPath})` : ''}`);
      
      // Upload to GitHub
      const result = await uploadToGitHub(project, repoFullName, accessToken);
      
      if (result.success) {
        logger.info(`✅ Sync completed successfully: ${result.filesUploaded} files uploaded to ${repoFullName}`);
        res.json({ 
          message: 'Sync completed successfully',
          status: 'completed',
          filesUploaded: result.filesUploaded,
          filesSkipped: result.filesSkipped,
          repoFullName,
          repositoryUrl: `https://github.com/${repoFullName}`,
          errors: result.errors
        });
      } else {
        logger.error(`❌ Sync failed: ${result.errors.length} errors occurred`);
        res.status(400).json({ 
          message: 'Sync completed with errors',
          status: 'error',
          filesUploaded: result.filesUploaded,
          filesSkipped: result.filesSkipped,
          repoFullName,
          repositoryUrl: `https://github.com/${repoFullName}`,
          errors: result.errors
        });
      }
      
    } catch (error) {
      logger.error(`Failed to start GitHub sync: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ 
        error: 'Failed to start sync',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Chunked sync endpoint - for better handling of large files/folders
  app.post('/api/github/sync-chunked', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) {
        return res.status(401).json({ error: 'Not authenticated with GitHub' });
      }
      
      const { repoFullName, files, targetPath = '', chunkIndex = 0, totalChunks = 1 } = req.body;
      
      if (!repoFullName || !files || !Array.isArray(files)) {
        return res.status(400).json({ error: 'Repository name and files are required' });
      }
      
      logger.info(`Processing chunk ${chunkIndex + 1}/${totalChunks} with ${files.length} files for ${repoFullName}`);
      
      // Import the existing uploadToGitHub function
      const { uploadToGitHub } = await import('./utils/github-uploader');
      
      // Convert files to the expected format
      const project = {
        name: `uploaded-files-chunk-${chunkIndex}`,
        files: files.map((file: any) => ({
          path: targetPath ? `${targetPath}/${file.path}` : file.path,
          content: file.content,
          encoding: file.encoding || 'utf8',
          type: 'file' as const,
          size: file.content ? Buffer.byteLength(file.content, file.encoding || 'utf8') : 0
        })),
        totalSize: files.reduce((total: number, file: any) => total + Buffer.byteLength(file.content, file.encoding || 'utf8'), 0)
      };
      
      // Upload this chunk to GitHub with progress callback
      const result = await uploadToGitHub(project, repoFullName, accessToken, (progress) => {
        // We could implement real-time progress updates via WebSocket here if needed
        logger.debug(`Chunk ${chunkIndex + 1}/${totalChunks} progress: ${progress.filesProcessed}/${progress.totalFiles}`);
      });
      
      const isLastChunk = chunkIndex === totalChunks - 1;
      
      if (result.success || result.filesUploaded > 0) {
        logger.info(`✅ Chunk ${chunkIndex + 1}/${totalChunks} completed: ${result.filesUploaded} files uploaded`);
        res.json({
          message: isLastChunk ? 'All chunks completed successfully' : `Chunk ${chunkIndex + 1}/${totalChunks} completed`,
          status: 'chunk_completed',
          chunkIndex,
          totalChunks,
          isLastChunk,
          filesUploaded: result.filesUploaded,
          filesSkipped: result.filesSkipped,
          errors: result.errors,
          repoFullName,
          repositoryUrl: `https://github.com/${repoFullName}`
        });
      } else {
        logger.error(`❌ Chunk ${chunkIndex + 1}/${totalChunks} failed: ${result.errors.length} errors occurred`);
        res.status(400).json({
          message: `Chunk ${chunkIndex + 1}/${totalChunks} failed`,
          status: 'chunk_error',
          chunkIndex,
          totalChunks,
          isLastChunk,
          filesUploaded: result.filesUploaded,
          filesSkipped: result.filesSkipped,
          errors: result.errors
        });
      }
      
    } catch (error) {
      logger.error(`Failed to process chunk: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({
        error: 'Failed to process chunk',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Python sync endpoint - execute Python code for GitHub sync (for large projects)
  app.post('/api/github/python-sync', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) {
        return res.status(401).json({ error: 'Not authenticated with GitHub' });
      }
      
      const { files, repoFullName, targetPath = '' } = req.body;
      
      if (!files || !Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ error: 'Files are required for Python sync' });
      }
      
      if (!repoFullName) {
        return res.status(400).json({ error: 'Repository name is required' });
      }
      
      logger.info(`Starting Python sync of ${files.length} files to ${repoFullName}${targetPath ? ` (target: ${targetPath})` : ''}`);
      
      // Generate Python script to handle the file uploads
      const processedCode = generatePythonUploadScript(files, repoFullName, targetPath, accessToken);
      
      // Import Python execution utilities
      const { spawn } = await import('child_process');
      const { writeFileSync, unlinkSync } = await import('fs');
      const { join } = await import('path');
      const { tmpdir } = await import('os');
      
      // Create a temporary Python file
      const tempDir = tmpdir();
      const scriptPath = join(tempDir, `github_sync_${Date.now()}.py`);
      
      try {
        writeFileSync(scriptPath, processedCode);
        
        // Execute Python script
        const pythonProcess = spawn('python3', [scriptPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env }
        });
        
        let output = '';
        let errorOutput = '';
        
        pythonProcess.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        pythonProcess.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });
        
        pythonProcess.on('close', (code) => {
          clearTimeout(timeoutHandle);
          
          // Clean up temporary file
          try {
            unlinkSync(scriptPath);
          } catch (e) {
            logger.warn(`Failed to delete temporary script file: ${e}`);
          }
          
          if (!res.headersSent) {
            if (code === 0) {
              logger.info(`✅ Python sync completed successfully for ${repoFullName}`);
              res.json({
                message: 'Python sync completed successfully',
                status: 'completed',
                output: output,
                repoFullName,
                repositoryUrl: `https://github.com/${repoFullName}`,
                filesProcessed: (output.match(/uploaded|created|modified/gi) || []).length,
                totalFiles: files.length
              });
            } else {
              logger.error(`❌ Python sync failed with exit code ${code}: ${errorOutput}`);
              res.status(400).json({
                message: 'Python sync failed',
                status: 'error',
                output: output,
                error: errorOutput,
                exitCode: code,
                repoFullName
              });
            }
          }
        });
        
        pythonProcess.on('error', (error) => {
          clearTimeout(timeoutHandle);
          
          // Clean up temporary file
          try {
            unlinkSync(scriptPath);
          } catch (e) {
            logger.warn(`Failed to delete temporary script file: ${e}`);
          }
          
          if (!res.headersSent) {
            logger.error(`Failed to execute Python script: ${error.message}`);
            res.status(500).json({
              error: 'Failed to execute Python script',
              details: error.message,
              status: 'error'
            });
          }
        });
        
        // Set a longer timeout for large file uploads - 30 minutes
        const timeoutHandle = setTimeout(() => {
          if (!pythonProcess.killed) {
            pythonProcess.kill('SIGTERM');
            logger.warn('Python script execution timed out');
            if (!res.headersSent) {
              res.status(408).json({
                error: 'Python script execution timed out',
                status: 'timeout'
              });
            }
          }
        }, 30 * 60 * 1000); // 30 minutes timeout
        
      } catch (fileError) {
        logger.error(`Failed to create/execute Python script: ${fileError}`);
        return res.status(500).json({
          error: 'Failed to create Python script',
          details: fileError instanceof Error ? fileError.message : 'Unknown error',
          status: 'error'
        });
      }
      
    } catch (error) {
      logger.error(`Failed to start Python sync: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({
        error: 'Failed to start Python sync',
        details: error instanceof Error ? error.message : 'Unknown error',
        status: 'error'
      });
    }
  });
  
  // Clear GitHub PAT (logout equivalent)
  app.post('/api/github/logout', (req, res) => {
    // No session token to clear in PAT mode, just return success
    res.json({ message: 'Logged out successfully' });
  });

  // Get GitHub PAT settings
  app.get('/api/github/settings', async (req, res) => {
    try {
      const userId = 'default-user';
      const settings = await storage.getGitHubSettings(userId);
      const defaultPAT = await storage.getDefaultGitHubPAT();
      
      res.json({ 
        settings,
        hasDefaultPAT: !!defaultPAT,
        isDefaultActive: !settings?.personalAccessToken
      });
    } catch (error) {
      logger.error(`Failed to get GitHub settings: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ 
        error: 'Failed to get GitHub settings',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Save GitHub PAT settings
  app.post('/api/github/settings', async (req, res) => {
    try {
      const userId = 'default-user';
      const { personalAccessToken } = req.body;
      
      if (!personalAccessToken || personalAccessToken.trim() === '') {
        return res.status(400).json({ error: 'Personal Access Token is required' });
      }

      // Validate PAT format (GitHub PATs start with ghp_, github_pat_, etc.)
      if (!personalAccessToken.match(/^(ghp_|github_pat_|gho_|ghu_|ghs_|ghr_)/)) {
        return res.status(400).json({ error: 'Invalid GitHub Personal Access Token format' });
      }
      
      const settings = await storage.saveGitHubSettings(userId, {
        userId,
        personalAccessToken: personalAccessToken.trim(),
        isDefault: false,
      });
      
      res.json({ settings, message: 'GitHub PAT saved successfully' });
    } catch (error) {
      logger.error(`Failed to save GitHub settings: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ 
        error: 'Failed to save GitHub settings',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ===========================================
  // GIT CONTROL API ROUTES - Advanced GitHub Management
  // ===========================================

  // Token Management
  app.get('/api/git-control/tokens', async (req, res) => {
    try {
      const tokens = await storage.getGitTokenConfigs();
      // Return masked tokens only, never expose tokenHash
      const maskedTokens = tokens.map(token => ({
        ...token,
        maskedToken: `${token.tokenHash.substring(0, 8)}...${token.tokenHash.substring(token.tokenHash.length - 4)}`,
        tokenHash: undefined // Remove hash from response
      }));
      res.json(maskedTokens); // Return array directly as expected by client
    } catch (error) {
      logger.error(`Failed to get token configs: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to get token configs' });
    }
  });

  app.post('/api/git-control/tokens', async (req, res) => {
    try {
      const { label, token } = req.body;
      
      if (!label || !token) {
        return res.status(400).json({ error: 'Label and token are required' });
      }

      // Test token and get scopes
      const testResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'TelegramManager-GitControl'
        }
      });

      if (!testResponse.ok) {
        return res.status(401).json({ error: 'Invalid GitHub token' });
      }

      const scopes = testResponse.headers.get('X-OAuth-Scopes')?.split(', ') || [];

      const savedToken = await storage.saveGitTokenConfig({
        label: label.trim(),
        tokenHash: token, // Store token directly as requested
        scopes
      });

      // Return success with masked token display
      const responseToken = {
        ...savedToken,
        maskedToken: `${token.substring(0, 8)}...${token.substring(token.length - 4)}`,
        tokenHash: undefined // Don't expose actual token
      };

      res.json(responseToken);
    } catch (error) {
      logger.error(`Failed to save token config: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to save token config' });
    }
  });

  app.delete('/api/git-control/tokens/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteGitTokenConfig(id);
      
      if (!success) {
        return res.status(404).json({ error: 'Token not found' });
      }

      res.json({ message: 'Token deleted successfully' });
    } catch (error) {
      logger.error(`Failed to delete token: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to delete token' });
    }
  });

  // GitHub Scopes and Rate Limit
  app.get('/api/git-control/scopes', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) {
        return res.status(401).json({ error: 'No GitHub token provided' });
      }

      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitControl'
        }
      });

      if (!response.ok) {
        return res.status(401).json({ error: 'Invalid GitHub token' });
      }

      const scopes = response.headers.get('X-OAuth-Scopes')?.split(', ') || [];
      const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
      const rateLimitLimit = response.headers.get('X-RateLimit-Limit');
      const rateLimitReset = response.headers.get('X-RateLimit-Reset');

      res.json({
        scopes,
        rateLimit: {
          remaining: parseInt(rateLimitRemaining || '0'),
          limit: parseInt(rateLimitLimit || '0'),
          reset: parseInt(rateLimitReset || '0')
        }
      });
    } catch (error) {
      logger.error(`Failed to get scopes: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to get token scopes' });
    }
  });

  // ===========================================
  // COMPREHENSIVE GITHUB FEATURES - ALL ENDPOINTS
  // ===========================================

  // Repository Management
  app.get('/api/git-control/repos/:owner/:repo', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) return res.status(401).json({ error: 'No GitHub token provided' });

      const { owner, repo } = req.params;
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitControl'
        }
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch repository details' });
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      logger.error(`Failed to get repository details: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to get repository details' });
    }
  });

  // Repository Branches
  app.get('/api/git-control/repos/:owner/:repo/branches', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) return res.status(401).json({ error: 'No GitHub token provided' });

      const { owner, repo } = req.params;
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitControl'
        }
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch branches' });
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      logger.error(`Failed to get branches: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to get branches' });
    }
  });

  // Repository Contents (Files/Folders)
  app.get('/api/git-control/repos/:owner/:repo/contents/*?', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) return res.status(401).json({ error: 'No GitHub token provided' });

      const { owner, repo } = req.params;
      const path = (req.params as any)[0] || ''; // Get the path from the wildcard
      const ref = req.query.ref as string; // Optional branch/ref parameter
      
      let url = `https://api.github.com/repos/${owner}/${repo}/contents`;
      if (path) url += `/${path}`;
      if (ref) url += `?ref=${ref}`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitControl'
        }
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch repository contents' });
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      logger.error(`Failed to get repository contents: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to get repository contents' });
    }
  });

  // Create or Update File
  app.put('/api/git-control/repos/:owner/:repo/contents/*', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) return res.status(401).json({ error: 'No GitHub token provided' });

      const { owner, repo } = req.params;
      const path = (req.params as any)[0];
      const { message, content, branch, sha } = req.body;

      if (!message || !content) {
        return res.status(400).json({ error: 'Commit message and content are required' });
      }

      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitControl',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message,
          content: Buffer.from(content).toString('base64'),
          branch: branch || 'main',
          ...(sha && { sha }) // Include SHA for updates
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return res.status(response.status).json({ 
          error: 'Failed to create/update file',
          details: errorData.message || response.statusText
        });
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      logger.error(`Failed to create/update file: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to create/update file' });
    }
  });

  // Delete File
  app.delete('/api/git-control/repos/:owner/:repo/contents/*', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) return res.status(401).json({ error: 'No GitHub token provided' });

      const { owner, repo } = req.params;
      const path = (req.params as any)[0];
      const { message, sha, branch } = req.body;

      if (!message || !sha) {
        return res.status(400).json({ error: 'Commit message and file SHA are required' });
      }

      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitControl',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message,
          sha,
          branch: branch || 'main'
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return res.status(response.status).json({ 
          error: 'Failed to delete file',
          details: errorData.message || response.statusText
        });
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      logger.error(`Failed to delete file: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to delete file' });
    }
  });

  // Repository Collaborators
  app.get('/api/git-control/repos/:owner/:repo/collaborators', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) return res.status(401).json({ error: 'No GitHub token provided' });

      const { owner, repo } = req.params;
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/collaborators`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitControl'
        }
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch collaborators' });
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      logger.error(`Failed to get collaborators: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to get collaborators' });
    }
  });

  // Star/Unstar Repository
  app.put('/api/git-control/repos/:owner/:repo/star', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) return res.status(401).json({ error: 'No GitHub token provided' });

      const { owner, repo } = req.params;
      const response = await fetch(`https://api.github.com/user/starred/${owner}/${repo}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitControl'
        }
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to star repository' });
      }

      res.json({ message: 'Repository starred successfully' });
    } catch (error) {
      logger.error(`Failed to star repository: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to star repository' });
    }
  });

  app.delete('/api/git-control/repos/:owner/:repo/star', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) return res.status(401).json({ error: 'No GitHub token provided' });

      const { owner, repo } = req.params;
      const response = await fetch(`https://api.github.com/user/starred/${owner}/${repo}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitControl'
        }
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to unstar repository' });
      }

      res.json({ message: 'Repository unstarred successfully' });
    } catch (error) {
      logger.error(`Failed to unstar repository: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to unstar repository' });
    }
  });

  // Fork Repository
  app.post('/api/git-control/repos/:owner/:repo/fork', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) return res.status(401).json({ error: 'No GitHub token provided' });

      const { owner, repo } = req.params;
      const { organization } = req.body; // Optional organization to fork to

      const requestBody = organization ? { organization } : {};

      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/forks`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitControl',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return res.status(response.status).json({ 
          error: 'Failed to fork repository',
          details: errorData.message || response.statusText
        });
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      logger.error(`Failed to fork repository: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to fork repository' });
    }
  });

  // Delete Repository
  app.delete('/api/git-control/repos/:owner/:repo', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) return res.status(401).json({ error: 'No GitHub token provided' });

      const { owner, repo } = req.params;
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitControl'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return res.status(response.status).json({ 
          error: 'Failed to delete repository',
          details: errorData.message || response.statusText
        });
      }

      res.json({ message: 'Repository deleted successfully' });
    } catch (error) {
      logger.error(`Failed to delete repository: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to delete repository' });
    }
  });

  // Repository Webhooks
  app.get('/api/git-control/repos/:owner/:repo/webhooks', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) return res.status(401).json({ error: 'No GitHub token provided' });

      const { owner, repo } = req.params;
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/hooks`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitControl'
        }
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch webhooks' });
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      logger.error(`Failed to get webhooks: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to get webhooks' });
    }
  });

  // Repository Pull Requests  
  app.get('/api/git-control/repos/:owner/:repo/pulls', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) return res.status(401).json({ error: 'No GitHub token provided' });

      const { owner, repo } = req.params;
      const { state = 'open' } = req.query;
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?state=${state}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitControl'
        }
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch pull requests' });
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      logger.error(`Failed to get pull requests: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to get pull requests' });
    }
  });

  // Repository Management
  app.get('/api/git-control/repos/:owner/:repo', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) {
        return res.status(401).json({ error: 'No GitHub token provided' });
      }

      const { owner, repo } = req.params;
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitControl'
        }
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: 'Repository not found or not accessible' });
      }

      const repository = await response.json();
      res.json({ repository });
    } catch (error) {
      logger.error(`Failed to get repository: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to get repository details' });
    }
  });

  app.patch('/api/git-control/repos/:owner/:repo/settings', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) {
        return res.status(401).json({ error: 'No GitHub token provided' });
      }

      const { owner, repo } = req.params;
      const { description, homepage, topics, defaultBranch, hasIssues, hasWiki, hasPages } = req.body;

      const updateData: any = {};
      if (description !== undefined) updateData.description = description;
      if (homepage !== undefined) updateData.homepage = homepage;
      if (topics !== undefined) updateData.topics = topics;
      if (defaultBranch !== undefined) updateData.default_branch = defaultBranch;
      if (hasIssues !== undefined) updateData.has_issues = hasIssues;
      if (hasWiki !== undefined) updateData.has_wiki = hasWiki;
      if (hasPages !== undefined) updateData.has_pages = hasPages;

      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitControl',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return res.status(response.status).json({ error: error.message || 'Failed to update repository' });
      }

      const updatedRepo = await response.json();
      res.json({ repository: updatedRepo, message: 'Repository updated successfully' });
    } catch (error) {
      logger.error(`Failed to update repository: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to update repository settings' });
    }
  });

  // Branch Management
  app.get('/api/git-control/repos/:owner/:repo/branches', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) {
        return res.status(401).json({ error: 'No GitHub token provided' });
      }

      const { owner, repo } = req.params;
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitControl'
        }
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch branches' });
      }

      const branches = await response.json();
      res.json({ branches });
    } catch (error) {
      logger.error(`Failed to get branches: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to get branches' });
    }
  });

  app.post('/api/git-control/repos/:owner/:repo/branches', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) {
        return res.status(401).json({ error: 'No GitHub token provided' });
      }

      const { owner, repo } = req.params;
      const { name, fromBranch = 'main' } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Branch name is required' });
      }

      // Get reference SHA from base branch
      const refResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${fromBranch}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitControl'
        }
      });

      if (!refResponse.ok) {
        return res.status(400).json({ error: 'Base branch not found' });
      }

      const refData = await refResponse.json();
      const sha = refData.object.sha;

      // Create new branch
      const createResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitControl',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ref: `refs/heads/${name}`,
          sha
        })
      });

      if (!createResponse.ok) {
        const error = await createResponse.json().catch(() => ({}));
        return res.status(createResponse.status).json({ error: error.message || 'Failed to create branch' });
      }

      const newBranch = await createResponse.json();
      res.json({ branch: newBranch, message: 'Branch created successfully' });
    } catch (error) {
      logger.error(`Failed to create branch: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to create branch' });
    }
  });

  // Collaborators Management
  app.get('/api/git-control/repos/:owner/:repo/collaborators', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) {
        return res.status(401).json({ error: 'No GitHub token provided' });
      }

      const { owner, repo } = req.params;
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/collaborators`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitControl'
        }
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch collaborators' });
      }

      const collaborators = await response.json();
      res.json({ collaborators });
    } catch (error) {
      logger.error(`Failed to get collaborators: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to get collaborators' });
    }
  });

  app.put('/api/git-control/repos/:owner/:repo/collaborators/:username', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) {
        return res.status(401).json({ error: 'No GitHub token provided' });
      }

      const { owner, repo, username } = req.params;
      const { permission = 'push' } = req.body;

      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/collaborators/${username}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitControl',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ permission })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return res.status(response.status).json({ error: error.message || 'Failed to add collaborator' });
      }

      res.json({ message: 'Collaborator added successfully' });
    } catch (error) {
      logger.error(`Failed to add collaborator: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to add collaborator' });
    }
  });

  // Webhooks Management
  app.get('/api/git-control/repos/:owner/:repo/webhooks', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) {
        return res.status(401).json({ error: 'No GitHub token provided' });
      }

      const { owner, repo } = req.params;
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/hooks`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitControl'
        }
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch webhooks' });
      }

      const webhooks = await response.json();
      res.json({ webhooks });
    } catch (error) {
      logger.error(`Failed to get webhooks: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to get webhooks' });
    }
  });

  app.post('/api/git-control/repos/:owner/:repo/webhooks', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) {
        return res.status(401).json({ error: 'No GitHub token provided' });
      }

      const { owner, repo } = req.params;
      const { url, contentType = 'json', events = ['push'], active = true } = req.body;

      if (!url) {
        return res.status(400).json({ error: 'Webhook URL is required' });
      }

      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/hooks`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitControl',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'web',
          active,
          events,
          config: {
            url,
            content_type: contentType
          }
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return res.status(response.status).json({ error: error.message || 'Failed to create webhook' });
      }

      const webhook = await response.json();
      res.json({ webhook, message: 'Webhook created successfully' });
    } catch (error) {
      logger.error(`Failed to create webhook: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to create webhook' });
    }
  });

  // Pull Requests
  app.get('/api/git-control/repos/:owner/:repo/pulls', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) {
        return res.status(401).json({ error: 'No GitHub token provided' });
      }

      const { owner, repo } = req.params;
      const { state = 'open' } = req.query;

      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?state=${state}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitControl'
        }
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch pull requests' });
      }

      const pullRequests = await response.json();
      res.json({ pullRequests });
    } catch (error) {
      logger.error(`Failed to get pull requests: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to get pull requests' });
    }
  });

  app.post('/api/git-control/repos/:owner/:repo/pulls', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) {
        return res.status(401).json({ error: 'No GitHub token provided' });
      }

      const { owner, repo } = req.params;
      const { title, head, base, body = '' } = req.body;

      if (!title || !head || !base) {
        return res.status(400).json({ error: 'Title, head branch, and base branch are required' });
      }

      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitControl',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title,
          head,
          base,
          body
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return res.status(response.status).json({ error: error.message || 'Failed to create pull request' });
      }

      const pullRequest = await response.json();
      res.json({ pullRequest, message: 'Pull request created successfully' });
    } catch (error) {
      logger.error(`Failed to create pull request: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to create pull request' });
    }
  });

  // Commits and Activity
  app.get('/api/git-control/repos/:owner/:repo/commits', async (req, res) => {
    try {
      const accessToken = await getGitHubToken(req);
      if (!accessToken) {
        return res.status(401).json({ error: 'No GitHub token provided' });
      }

      const { owner, repo } = req.params;
      const { sha, per_page = 30 } = req.query;

      let url = `https://api.github.com/repos/${owner}/${repo}/commits?per_page=${per_page}`;
      if (sha) {
        url += `&sha=${sha}`;
      }

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TelegramManager-GitControl'
        }
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch commits' });
      }

      const commits = await response.json();
      res.json({ commits });
    } catch (error) {
      logger.error(`Failed to get commits: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: 'Failed to get commits' });
    }
  });

  // Test GitHub PAT
  app.post('/api/github/test-pat', async (req, res) => {
    try {
      const { personalAccessToken } = req.body;
      
      if (!personalAccessToken) {
        return res.status(400).json({ error: 'Personal Access Token is required' });
      }

      // Test the PAT by making a simple API call
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${personalAccessToken}`,
          'User-Agent': 'TelegramManager-GitHubSync',
        },
      });

      if (!response.ok) {
        return res.status(400).json({ 
          error: 'Invalid or expired Personal Access Token',
          valid: false
        });
      }

      const user = await response.json();
      res.json({ 
        valid: true, 
        user: {
          login: user.login,
          name: user.name,
          avatar_url: user.avatar_url
        }
      });
      
    } catch (error) {
      logger.error(`Failed to test GitHub PAT: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ 
        error: 'Failed to test PAT',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Helper function to generate Python script for file uploads
  function generatePythonUploadScript(files: any[], repoFullName: string, targetPath: string, accessToken: string): string {
    const fileData = files.map(file => {
      const safePath = file.path.replace(/'/g, "\\'");
      // Clean content of null bytes and problematic characters
      const cleanContent = file.content
        .replace(/\0/g, '') // Remove null bytes
        .replace(/'''/g, "\\'\\'\\'") // Escape triple quotes
        .replace(/\\/g, '\\\\') // Escape backslashes
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // Remove control characters
      
      return `    {
        'path': '${safePath}',
        'content': '''${cleanContent}''',
        'encoding': '${file.encoding}'
    }`;
    }).join(',\n');

    return `#!/usr/bin/env python3
import requests
import base64
import json
import sys
import time
from urllib.parse import quote

# Configuration
GITHUB_API = "https://api.github.com"
ACCESS_TOKEN = "${accessToken}"
REPO_NAME = "${repoFullName}"
TARGET_PATH = "${targetPath}"

# File data
files = [
${fileData}
]

def upload_file(file_info):
    """Upload a single file to GitHub repository"""
    file_path = file_info['path']
    content = file_info['content']
    encoding = file_info['encoding']
    
    # Build the full path
    if TARGET_PATH:
        full_path = f"{TARGET_PATH}/{file_path}".replace('//', '/')
    else:
        full_path = file_path
    
    url = f"{GITHUB_API}/repos/{REPO_NAME}/contents/{quote(full_path)}"
    
    headers = {
        'Authorization': f'Bearer {ACCESS_TOKEN}',
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'TelegramManager-PythonSync'
    }
    
    # Check if file exists
    try:
        response = requests.get(url, headers=headers)
        sha = response.json().get('sha') if response.status_code == 200 else None
    except Exception as e:
        print(f"Warning: Could not check existing file {full_path}: {e}")
        sha = None
    
    # Prepare content - already base64 encoded for binary files
    if encoding == 'base64':
        file_content = content
    else:
        file_content = base64.b64encode(content.encode('utf-8')).decode()
    
    data = {
        'message': f'Upload {file_path} via Python sync',
        'content': file_content,
        'branch': 'main'
    }
    
    if sha:
        data['sha'] = sha
    
    try:
        response = requests.put(url, json=data, headers=headers)
        if response.status_code in [200, 201]:
            print(f"✅ Uploaded: {full_path}")
            return True
        else:
            error_info = response.json() if response.content else {}
            print(f"❌ Failed to upload {full_path}: {response.status_code} - {error_info.get('message', 'Unknown error')}")
            return False
    except Exception as e:
        print(f"❌ Error uploading {full_path}: {e}")
        return False

def main():
    """Main upload function"""
    print(f"Starting Python sync of {len(files)} files to {REPO_NAME}")
    
    success_count = 0
    error_count = 0
    
    for file_info in files:
        if upload_file(file_info):
            success_count += 1
        else:
            error_count += 1
    
    print(f"\\nUpload completed: {success_count} uploaded, {error_count} failed")
    
    if error_count > 0:
        sys.exit(1)
    else:
        print("All files uploaded successfully!")
        sys.exit(0)

if __name__ == '__main__':
    main()
`;
  }

  const httpServer = createServer(app);

  return httpServer;
}
