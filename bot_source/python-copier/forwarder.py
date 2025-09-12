""" A script to send all messages from one chat to another. """

import asyncio
import logging
import sys
import json
import os

from telethon.tl.patched import MessageService
from telethon.errors.rpcerrorlist import FloodWaitError
from telethon import TelegramClient
from telethon.sessions import StringSession
from settings import API_ID, API_HASH, forwards, get_forward, update_offset, STRING_SESSION, reload_config

# Configure logging to output to stdout for API capture
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO,
    stream=sys.stdout
)

SENT_VIA = f'\n__Sent via__ `Telegram Manager Python Copier`'


def intify(string):
    try:
        return int(string)
    except:
        return string


async def forward_job():
    """ The function that does the job """
    # Always use the hardcoded session string
    session = StringSession(STRING_SESSION)
    
    async with TelegramClient(session, API_ID, API_HASH) as client:
        
        # Get user information and display it
        me = await client.get_me()
        user_id = me.id
        username = me.username or "No username"
        first_name = me.first_name or ""
        
        print(f"✅ Successfully logged in using hardcoded session string!")
        print(f"🆔 User ID: {user_id}")
        print(f"👤 Name: {first_name}")
        print(f"📱 Username: @{username}")
        print(f"📧 Connected to Telegram as: {first_name} (@{username}) - ID: {user_id}")
        
        logging.info(f"Telegram client connected successfully - User ID: {user_id}, Username: @{username}")
        logging.info("Using hardcoded session string for authentication - no phone/OTP required")
        
        # Reload config to get latest pairs
        reload_config()
        
        if not forwards:
            logging.warning("No forward pairs configured")
            return

        error_occured = False
        total_messages = 0
        
        for forward in forwards:
            try:
                from_chat, to_chat, offset = get_forward(forward)
                logging.info(f"Processing forward pair: {forward}")
                logging.info(f"From: {from_chat}, To: {to_chat}, Offset: {offset}")

                if not offset:
                    offset = 0

                last_id = offset
                messages_forwarded = 0

                async for message in client.iter_messages(intify(from_chat), reverse=True, offset_id=offset):
                    if isinstance(message, MessageService):
                        continue
                    try:
                        await client.send_message(intify(to_chat), message)
                        last_id = str(message.id)
                        messages_forwarded += 1
                        total_messages += 1
                        logging.info(f'Forwarded message with id = {last_id} from {forward}')
                        update_offset(forward, last_id)
                        
                        # Add small delay to avoid flooding
                        await asyncio.sleep(0.1)
                        
                    except FloodWaitError as fwe:
                        logging.warning(f'Flood wait error: {fwe}. Waiting {fwe.seconds} seconds...')
                        await asyncio.sleep(fwe.seconds)
                    except Exception as err:
                        logging.exception(f"Error forwarding message: {err}")
                        error_occured = True
                        break

                logging.info(f'Completed {forward}: forwarded {messages_forwarded} messages')

            except Exception as err:
                logging.exception(f"Error processing forward pair {forward}: {err}")
                error_occured = True
                continue

        # Send completion message to self
        try:
            message = f'Forward job completed. Total messages processed: {total_messages}' if not error_occured else f'Forward job completed with errors. Messages processed: {total_messages}. Check logs for details.'
            
            completion_msg = f'''Hi!

**{message}**

**Telegram Manager Python Copier** - Chat forwarding completed.
{SENT_VIA}'''
            
            await client.send_message('me', completion_msg, link_preview=False)
            logging.info("Completion notification sent")
            
        except Exception as err:
            logging.error(f"Failed to send completion notification: {err}")


async def main():
    """Main entry point"""
    try:
        await forward_job()
    except Exception as e:
        logging.exception(f"Fatal error in forwarder: {e}")
        sys.exit(1)


if __name__ == "__main__":
    # Check if we have forward pairs
    if not forwards:
        logging.error("No forward pairs configured. Please set up config.ini first.")
        sys.exit(1)
    
    asyncio.run(main())
