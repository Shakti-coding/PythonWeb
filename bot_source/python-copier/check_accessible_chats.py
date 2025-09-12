#!/usr/bin/env python3
"""
Script to check which chats/users are accessible for forwarding
"""

import asyncio
import sys
from telethon import TelegramClient
from telethon.sessions import StringSession
from settings import API_ID, API_HASH, STRING_SESSION

async def check_accessible_chats():
    """Check which chats/users are accessible for forwarding"""
    if not STRING_SESSION:
        print("❌ No session string found. Please set STRING_SESSION in settings.py")
        return

    async with TelegramClient(StringSession(STRING_SESSION), API_ID, API_HASH) as client:
        print("✅ Successfully connected to Telegram!")
        
        # Get current user info
        me = await client.get_me()
        print(f"\n🆔 Your Account: {me.first_name} (@{me.username}) - ID: {me.id}")
        print(f"✅ You can always use 'me' or your user ID: {me.id}")
        
        print("\n📋 Accessible Chats/Channels:")
        print("=" * 50)
        
        accessible_chats = []
        
        # Get dialogs (recent chats)
        async for dialog in client.iter_dialogs():
            try:
                # Test if we can access this entity
                entity = await client.get_input_entity(dialog.entity)
                chat_type = "User" if dialog.is_user else "Group" if dialog.is_group else "Channel"
                
                accessible_chats.append({
                    'id': dialog.entity.id,
                    'title': dialog.title,
                    'type': chat_type,
                    'username': getattr(dialog.entity, 'username', None)
                })
                
                username_part = f" (@{dialog.entity.username})" if getattr(dialog.entity, 'username', None) else ""
                print(f"✅ {chat_type}: {dialog.title}{username_part} - ID: {dialog.entity.id}")
                
            except Exception as e:
                print(f"❌ Cannot access: {dialog.title} - Error: {e}")
        
        print(f"\n📊 Summary:")
        print(f"✅ Total accessible chats: {len(accessible_chats)}")
        
        # Group by type
        users = [c for c in accessible_chats if c['type'] == 'User']
        groups = [c for c in accessible_chats if c['type'] == 'Group']  
        channels = [c for c in accessible_chats if c['type'] == 'Channel']
        
        print(f"👤 Users: {len(users)}")
        print(f"👥 Groups: {len(groups)}")
        print(f"📢 Channels: {len(channels)}")
        
        print(f"\n💡 Forwarding Tips:")
        print(f"• Use 'me' to forward from/to your own saved messages")
        print(f"• Use the chat ID (numbers) for private chats")
        print(f"• Use @username for public channels/groups")
        print(f"• You can only forward FROM chats you're a member of")
        print(f"• You can forward TO any accessible chat")
        
        return accessible_chats

if __name__ == "__main__":
    try:
        asyncio.run(check_accessible_chats())
    except KeyboardInterrupt:
        print("\n❌ Script interrupted by user")
    except Exception as e:
        print(f"❌ Error: {e}")