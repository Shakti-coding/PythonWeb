#!/usr/bin/env python3

import sys
import os
import asyncio

# Add the telethon-downloader directory to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'telethon-downloader'))

from bottorrent import TelegramBot

def main():
    """Main entry point for the Telethon Downloader bot"""
    try:
        bot = TelegramBot()
        asyncio.run(bot.start())
    except KeyboardInterrupt:
        print("Bot stopped by user")
    except Exception as e:
        print(f"Error starting bot: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()