import os
import sys
from pathlib import Path

import logger

# Add shared directory to Python path to import config reader
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', 'shared'))

try:
    from config_reader import config_reader
    CONFIG_AVAILABLE = True
except ImportError:
    CONFIG_AVAILABLE = False
    print("Warning: Could not import config_reader, falling back to environment variables")


class EnvironmentReader:
    def __init__(self):
        # Define some variables so the code reads easier
        # Try to use file-based config first, then fall back to environment variables
        
        if CONFIG_AVAILABLE:
            # Use file-based configuration
            telegram_config = config_reader.get_telegram_config()
            downloads_config = config_reader.get_download_config()
            features_config = config_reader.get_features_config()
            youtube_config = config_reader.get_youtube_config()
            system_config = config_reader.get_system_config()
            paths_config = config_reader.get_paths_config()
            
            self.API_ID = telegram_config.get('api_id')
            self.API_HASH = telegram_config.get('api_hash')
            self.BOT_TOKEN = telegram_config.get('bot_token')
            self.SESSION = telegram_config.get('session', 'bottorrent')
            
            self.PUID = system_config.get('puid')
            self.PGID = system_config.get('pgid')
            
            self.PERMISSIONS_FOLDER = system_config.get('permissions_folder', 777)
            self.PERMISSIONS_FILE = system_config.get('permissions_file', 755)
            
            # Convert list to comma-separated string for compatibility
            authorized_users = telegram_config.get('authorized_user_ids', [])
            self.TG_AUTHORIZED_USER_ID = ','.join(authorized_users) if authorized_users else False
            
            self.TG_MAX_PARALLEL = int(features_config.get('max_parallel', 4))
            self.TG_PROGRESS_DOWNLOAD = features_config.get('progress_download', True)
            self.PROGRESS_STATUS_SHOW = features_config.get('progress_status_show', 10)
            # Prioritize environment variable, then config file
            self.TG_DOWNLOAD_PATH = os.environ.get("TG_DOWNLOAD_PATH", downloads_config.get('base_path', './downloads'))
            self.TG_DOWNLOAD_PATH_TORRENTS = os.environ.get("TG_DOWNLOAD_PATH_TORRENTS", "./downloads/torrents")
            
            # Convert relative paths to absolute paths only if not already absolute
            if self.TG_DOWNLOAD_PATH.startswith('./') and not os.path.isabs(self.TG_DOWNLOAD_PATH):
                self.TG_DOWNLOAD_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', self.TG_DOWNLOAD_PATH[2:]))
                
            self.PATH_COMPLETED = downloads_config.get('completed_folder', os.path.join(self.TG_DOWNLOAD_PATH, "completed"))
            self.PATH_LINKS = downloads_config.get('links_folder', os.path.join(self.TG_DOWNLOAD_PATH, "links"))
            self.PATH_TMP = downloads_config.get('temp_folder', os.path.join(self.TG_DOWNLOAD_PATH, "tmp"))
            
            # Convert relative paths to absolute
            if self.PATH_COMPLETED.startswith('./'):
                self.PATH_COMPLETED = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', self.PATH_COMPLETED[2:]))
            if self.PATH_LINKS.startswith('./'):
                self.PATH_LINKS = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', self.PATH_LINKS[2:]))
            if self.PATH_TMP.startswith('./'):
                self.PATH_TMP = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', self.PATH_TMP[2:]))

            ## YOUTUBE
            self.PATH_YOUTUBE = os.path.join(self.TG_DOWNLOAD_PATH, "youtube")
            self.YOUTUBE_AUDIO_FOLDER = downloads_config.get('youtube_audio_folder', os.path.join(self.PATH_YOUTUBE, "youtube_audios"))
            self.YOUTUBE_VIDEO_FOLDER = downloads_config.get('youtube_video_folder', os.path.join(self.PATH_YOUTUBE, "youtube_video"))
            
            # Convert relative paths
            if self.YOUTUBE_AUDIO_FOLDER.startswith('./'):
                self.YOUTUBE_AUDIO_FOLDER = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', self.YOUTUBE_AUDIO_FOLDER[2:]))
            if self.YOUTUBE_VIDEO_FOLDER.startswith('./'):
                self.YOUTUBE_VIDEO_FOLDER = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', self.YOUTUBE_VIDEO_FOLDER[2:]))

            self.YOUTUBE_LINKS_SUPPORTED = ','.join(youtube_config.get('links_supported', ["youtube.com", "youtu.be"]))
            self.YOUTUBE_DEFAULT_DOWNLOAD = youtube_config.get('default_download', 'VIDEO')
            self.YOUTUBE_DEFAULT_EXTENSION = youtube_config.get('default_extension', 'mkv')
            self.YOUTUBE_FORMAT_AUDIO = youtube_config.get('format_audio', 'bestaudio/best')
            self.YOUTUBE_FORMAT_VIDEO = youtube_config.get('format_video', 'bestvideo+bestaudio/best')
            self.YOUTUBE_SHOW_OPTION_TIMEOUT = int(youtube_config.get('show_option_timeout', 5))
            self.YOUTUBE_SHOW_OPTION = youtube_config.get('show_option', True)

            ## TELEGRAM
            self.TG_DL_TIMEOUT = int(features_config.get('dl_timeout', 3600))
            self.TG_FOLDER_BY_AUTHORIZED = os.environ.get("TG_FOLDER_BY_AUTHORIZED", False)
            self.TG_UNZIP_TORRENTS = os.environ.get("TG_UNZIP_TORRENTS", False)
            self.ENABLED_UNZIP = features_config.get('enabled_unzip', False)
            self.ENABLED_UNRAR = features_config.get('enabled_unrar', False)
            self.ENABLED_7Z = features_config.get('enabled_7z', False)

            self.LANGUAGE = system_config.get('language', 'en_EN')

            self.PATH_CONFIG = paths_config.get('config', './tmp/config/config.ini')
            self.PATH_PENDING_MESSAGES = paths_config.get('pending_messages', './tmp/config/pending_messages.json')
            self.PATH_DOWNLOAD_FILES = paths_config.get('download_files', './tmp/config/download_files.json')
            
            # Convert relative paths
            if self.PATH_CONFIG.startswith('./'):
                self.PATH_CONFIG = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', self.PATH_CONFIG[2:]))
            if self.PATH_PENDING_MESSAGES.startswith('./'):
                self.PATH_PENDING_MESSAGES = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', self.PATH_PENDING_MESSAGES[2:]))
            if self.PATH_DOWNLOAD_FILES.startswith('./'):
                self.PATH_DOWNLOAD_FILES = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', self.PATH_DOWNLOAD_FILES[2:]))

            self.YOUTUBE = "youtube"
            
            print("✅ Using file-based configuration")
            
        else:
            # Fallback to environment variables
            print("⚠️ Using environment variables as fallback")
            self.API_ID = os.environ.get("TG_API_ID")
            self.API_HASH = os.environ.get("TG_API_HASH")
            self.BOT_TOKEN = os.environ.get("TG_BOT_TOKEN")
            self.SESSION = os.environ.get("TG_SESSION", "bottorrent")

            self.PUID = os.environ.get("PUID", None)
            self.PGID = os.environ.get("PGID", None)

            self.PERMISSIONS_FOLDER = os.environ.get("PERMISSIONS_FOLDER", 777)
            self.PERMISSIONS_FILE = os.environ.get("PERMISSIONS_FILE", 755)

            self.TG_AUTHORIZED_USER_ID = os.environ.get("TG_AUTHORIZED_USER_ID", False)
            self.TG_MAX_PARALLEL = int(os.environ.get("TG_MAX_PARALLEL", 4))
            self.TG_PROGRESS_DOWNLOAD = os.environ.get("TG_PROGRESS_DOWNLOAD", True)
            self.PROGRESS_STATUS_SHOW = os.environ.get("PROGRESS_STATUS_SHOW", 10)
            self.TG_DOWNLOAD_PATH = os.environ.get("TG_DOWNLOAD_PATH", "/download")
            self.TG_DOWNLOAD_PATH_TORRENTS = os.environ.get("TG_DOWNLOAD_PATH_TORRENTS", "/watch")

            self.PATH_COMPLETED = os.path.join(self.TG_DOWNLOAD_PATH, "completed")
            self.PATH_LINKS = os.path.join(self.TG_DOWNLOAD_PATH, "links")
            self.PATH_TMP = os.path.join(self.TG_DOWNLOAD_PATH, "tmp")

            ## YOUTUBE
            self.PATH_YOUTUBE = os.path.join(self.TG_DOWNLOAD_PATH, "youtube")
            self.YOUTUBE_AUDIO_FOLDER = os.environ.get("YOUTUBE_AUDIO_FOLDER", os.path.join(self.PATH_YOUTUBE, "youtube_audios"))
            self.YOUTUBE_VIDEO_FOLDER = os.environ.get("YOUTUBE_VIDEO_FOLDER", os.path.join(self.PATH_YOUTUBE, "youtube_video"))

            self.YOUTUBE_LINKS_SUPPORTED = os.environ.get("YOUTUBE_LINKS_SUPPORTED", "youtube.com,youtu.be")
            self.YOUTUBE_DEFAULT_DOWNLOAD = os.environ.get("YOUTUBE_DEFAULT_DOWNLOAD", "VIDEO")
            self.YOUTUBE_DEFAULT_EXTENSION = os.environ.get("YOUTUBE_DEFAULT_EXTENSION", "mkv")
            self.YOUTUBE_FORMAT_AUDIO = os.environ.get("YOUTUBE_FORMAT_AUDIO", "bestaudio/best")
            self.YOUTUBE_FORMAT_VIDEO = os.environ.get("YOUTUBE_FORMAT_VIDEO", "bestvideo+bestaudio/best")
            self.YOUTUBE_SHOW_OPTION_TIMEOUT = int(os.environ.get("YOUTUBE_SHOW_OPTION_TIMEOUT", 5))
            self.YOUTUBE_SHOW_OPTION = os.environ.get("YOUTUBE_SHOW_OPTION", True)

            ## TELEGRAM
            self.TG_DL_TIMEOUT = int(os.environ.get("TG_DL_TIMEOUT", 3600))
            self.TG_FOLDER_BY_AUTHORIZED = os.environ.get("TG_FOLDER_BY_AUTHORIZED", False)
            self.TG_UNZIP_TORRENTS = os.environ.get("TG_UNZIP_TORRENTS", False)
            self.ENABLED_UNZIP = os.environ.get("ENABLED_UNZIP", False)
            self.ENABLED_UNRAR = os.environ.get("ENABLED_UNRAR", False)
            self.ENABLED_7Z = os.environ.get("ENABLED_7Z", False)

            self.LANGUAGE = os.environ.get("APP_LANGUAGE", "en_EN")

            self.PATH_CONFIG = os.environ.get("PATH_CONFIG", "/tmp/config/config.ini")
            self.PATH_PENDING_MESSAGES = os.environ.get("PATH_PENDING_MESSAGES", "/tmp/config/pending_messages.json")
            self.PATH_DOWNLOAD_FILES = os.environ.get("PATH_DOWNLOAD_FILES", "/tmp/config/download_files.json")

            self.YOUTUBE = "youtube"

    def print_variables(self):
        logger.logger.info(f"API_ID: {self.API_ID}")
        logger.logger.info(f"API_HASH: {self.API_HASH}")
        logger.logger.info(f"BOT_TOKEN: {self.BOT_TOKEN}")
        logger.logger.info(f"SESSION: {self.SESSION}")

    def printAttribute(self, attribute_name):
        if hasattr(self, attribute_name):
            attribute_value = getattr(self, attribute_name)
            logger.logger.info(f"{attribute_name}: {attribute_value}")
        else:
            attribute_value = getattr(self, attribute_name)
            logger.logger.info(f"{attribute_name}: {attribute_value}")

    def get_variable(self, variable_name):
        value = getattr(self, variable_name, None)
        if isinstance(value, str):
            return value.strip() if value is not None else None
        return value
