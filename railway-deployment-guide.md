# Railway Deployment Guide

## Critical Setup Steps

### 1. After Railway Init, Configure Volumes

**IMPORTANT**: Your session files and downloads need persistent storage!

```bash
# Create persistent volumes
railway volumes create sessions --mount-path=/app/sessions
railway volumes create downloads --mount-path=/app/downloads
railway volumes create logs --mount-path=/app/logs
```

### 2. Copy Your Session Files to Volumes

Before first deployment, you need to upload your existing session files:

```bash
# Copy session files to Railway volume
railway run bash -c "cp /tmp/bottorrent.session* /app/sessions/ 2>/dev/null || true"
railway run bash -c "cp /tmp/test_bot.session /app/sessions/ 2>/dev/null || true"
```

### 3. Set Environment Variables

Set these in Railway dashboard or via CLI:

```bash
railway variables set TG_API_ID=your_api_id
railway variables set TG_API_HASH=your_api_hash  
railway variables set TG_BOT_TOKEN=your_bot_token
railway variables set TG_AUTHORIZED_USER_ID=your_user_id
railway variables set DATABASE_URL=your_database_url
railway variables set SESSION_SECRET=your_session_secret
```

### 4. Deploy

```bash
railway up
```

## Verification Checklist

After deployment:
- ✅ Check logs: `railway logs`  
- ✅ Test web interface functionality
- ✅ Verify Telegram bot responds
- ✅ Test file downloads
- ✅ Check session persistence
- ✅ Test YouTube downloads

The application will work **exactly** the same as your local setup!