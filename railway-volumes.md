# Railway Volume Configuration

To ensure persistence of session files and downloads, you need to configure Railway volumes:

## Required Volumes

1. **Downloads Volume**
   - Mount path: `/app/downloads`
   - Purpose: Store all downloaded files, YouTube videos, documents, etc.

2. **Sessions Volume** 
   - Mount path: `/app/sessions`
   - Purpose: Store Telegram session files (*.session, *.session-journal)

3. **Logs Volume** (Optional)
   - Mount path: `/app/logs`
   - Purpose: Store application logs

## Railway Volume Setup

After deployment, in the Railway dashboard:

1. Go to your service
2. Click on "Variables" tab
3. Add these volume configurations:
   ```
   RAILWAY_VOLUME_MOUNT_PATH_1=/app/downloads
   RAILWAY_VOLUME_MOUNT_PATH_2=/app/sessions
   RAILWAY_VOLUME_MOUNT_PATH_3=/app/logs
   ```

Or create volumes via Railway CLI:
```bash
railway volumes create downloads --mount-path=/app/downloads
railway volumes create sessions --mount-path=/app/sessions
railway volumes create logs --mount-path=/app/logs
```

## Environment Variable Updates

Update these environment variables in Railway dashboard:
```
TG_DOWNLOAD_PATH=/app/downloads
YOUTUBE_AUDIO_FOLDER=/app/downloads/youtube/audio
YOUTUBE_VIDEO_FOLDER=/app/downloads/youtube/videos
```

This ensures your session files and downloads persist across deployments.