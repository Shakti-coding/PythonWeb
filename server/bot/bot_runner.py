#!/usr/bin/env python3

import sys
import os
import json
import asyncio
import subprocess
from pathlib import Path

# Add the bot directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from telethon import TelegramClient, events
from telethon.sessions import StringSession
import logger
from constants import EnvironmentReader
from language_templates import LanguageTemplates
from download_manager import DownloadPathManager
from db_downloads import DownloadFilesDB
from utils import Utils

class WebIntegratedBot:
    def __init__(self):
        self.client = None
        self.is_running = False
        self.config = {}
        self.utils = Utils()
        
    async def initialize(self, config):
        """Initialize the bot with configuration from web interface"""
        self.config = config
        
        # Set environment variables for the bot
        os.environ['TG_API_ID'] = str(config.get('api_id', ''))
        os.environ['TG_API_HASH'] = config.get('api_hash', '')
        os.environ['TG_BOT_TOKEN'] = config.get('bot_token', '')
        os.environ['TG_AUTHORIZED_USER_ID'] = str(config.get('authorized_user_id', ''))
        os.environ['TG_SESSION'] = config.get('session_file', 'bot_session')
        os.environ['APP_LANGUAGE'] = config.get('language', 'en_EN')
        os.environ['TG_MAX_PARALLEL'] = str(config.get('max_parallel', 4))
        os.environ['TG_DL_TIMEOUT'] = str(config.get('download_timeout', 3600))
        os.environ['ENABLED_UNZIP'] = str(config.get('enable_unzip', True))
        os.environ['ENABLED_UNRAR'] = str(config.get('enable_unrar', True))
        os.environ['TG_PROGRESS_DOWNLOAD'] = str(config.get('show_progress', True))
        os.environ['YOUTUBE_DEFAULT_DOWNLOAD'] = config.get('youtube_default', 'VIDEO')
        os.environ['YOUTUBE_DEFAULT_EXTENSION'] = config.get('youtube_extension', 'MP4')
        
        # Set download paths
        os.environ['TG_DOWNLOAD_PATH'] = str(Path.cwd() / 'downloads')
        os.environ['YOUTUBE_AUDIO_FOLDER'] = str(Path.cwd() / 'downloads' / 'youtube' / 'audio')
        os.environ['YOUTUBE_VIDEO_FOLDER'] = str(Path.cwd() / 'downloads' / 'youtube' / 'video')
        
        try:
            # Initialize Telethon client
            self.client = TelegramClient(
                StringSession(config.get('session_string', '')),
                int(config['api_id']),
                config['api_hash']
            )
            
            return True
        except Exception as e:
            print(f"Error initializing bot: {e}")
            return False
    
    async def start_bot(self):
        """Start the bot"""
        if not self.client:
            return False
            
        try:
            await self.client.start(bot_token=self.config['bot_token'])
            self.is_running = True
            
            # Import and run the original bot logic
            from bottorrent import TelegramBot
            
            # Override the original bot's initialization to use our client
            original_bot = TelegramBot()
            original_bot.client = self.client
            
            # Set up event handlers
            await self.setup_handlers(original_bot)
            
            print("Bot started successfully!")
            return True
            
        except Exception as e:
            print(f"Error starting bot: {e}")
            return False
    
    async def setup_handlers(self, bot_instance):
        """Setup message handlers"""
        
        @self.client.on(events.NewMessage)
        async def handle_message(event):
            try:
                # Use the original bot's message handling logic
                if hasattr(bot_instance, 'handle_new_message'):
                    await bot_instance.handle_new_message(event)
                else:
                    # Basic message handling
                    sender = await event.get_sender()
                    
                    if event.message.text:
                        if event.message.text.startswith('/start'):
                            await event.respond(
                                "🤖 **Telethon Downloader Bot**\n\n"
                                "Send me files, videos, or YouTube links and I'll download them!\n\n"
                                "**Features:**\n"
                                "• Automatic file downloading\n"
                                "• YouTube video/audio download\n"
                                "• File organization by type\n"
                                "• Zip/Rar extraction\n"
                                "• Progress tracking\n\n"
                                "Bot is controlled from your web application! 🌐"
                            )
                        elif event.message.text.startswith('/help'):
                            await event.respond(
                                "📋 **Available Commands:**\n\n"
                                "/start - Welcome message\n"
                                "/help - Show this help\n"
                                "/status - Bot status\n\n"
                                "**File Downloads:**\n"
                                "• Send any file and I'll download it\n"
                                "• Send YouTube links for video/audio download\n"
                                "• Send direct file links\n\n"
                                "**Supported Formats:**\n"
                                "• Videos: MP4, MKV, AVI, etc.\n"
                                "• Audio: MP3, FLAC, etc.\n"
                                "• Documents: PDF, etc.\n"
                                "• Images: JPG, PNG, etc.\n\n"
                                "🌐 Managed from your web application!"
                            )
                        elif event.message.text.startswith('/status'):
                            await event.respond(
                                f"✅ **Bot Status: Active**\n"
                                f"🤖 Telethon Downloader v4.0.9\n"
                                f"📱 Chat ID: `{event.chat_id}`\n"
                                f"👤 User ID: `{sender.id}`\n"
                                f"🌐 Controlled from: Web Application\n"
                                f"📁 Download Path: `/downloads`\n"
                                f"🎥 YouTube Downloads: Enabled\n"
                                f"📦 File Extraction: Enabled"
                            )
                        else:
                            # Handle file downloads, YouTube links, etc.
                            await event.respond(
                                "📁 Send me files, videos, or YouTube links to download!\n"
                                "Use /help for more information."
                            )
                    
                    # Handle media messages
                    if event.message.media:
                        await event.respond("📥 Starting download...")
                        # Here we would integrate the original download logic
                        
            except Exception as e:
                print(f"Error handling message: {e}")
                await event.respond("❌ Error processing your request. Please try again.")
    
    async def stop_bot(self):
        """Stop the bot"""
        if self.client and self.is_running:
            await self.client.disconnect()
            self.is_running = False
            return True
        return False
    
    def get_status(self):
        """Get bot status"""
        return {
            'running': self.is_running,
            'client_connected': self.client is not None,
            'download_path': str(Path.cwd() / 'downloads')
        }

async def main():
    """Main function to run the bot based on command line arguments"""
    if len(sys.argv) < 2:
        print("Usage: python bot_runner.py <command> [config_json]")
        sys.exit(1)
    
    command = sys.argv[1]
    bot = WebIntegratedBot()
    
    if command == "start" and len(sys.argv) >= 3:
        config = json.loads(sys.argv[2])
        if await bot.initialize(config):
            if await bot.start_bot():
                print("Bot started successfully!")
                # Keep the bot running
                await bot.client.run_until_disconnected()
            else:
                print("Failed to start bot")
                sys.exit(1)
        else:
            print("Failed to initialize bot")
            sys.exit(1)
    
    elif command == "stop":
        await bot.stop_bot()
        print("Bot stopped")
    
    elif command == "status":
        status = bot.get_status()
        print(json.dumps(status))
    
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())