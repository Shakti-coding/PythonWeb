#!/usr/bin/env python3

import json
import os
from pathlib import Path

class ConfigReader:
    def __init__(self, config_path=None):
        """
        Initialize the config reader
        
        Args:
            config_path (str): Path to the config file. If None, will look for config/bot-config.json
        """
        if config_path is None:
            # Look for config file in project root
            project_root = Path(__file__).parent.parent
            config_path = project_root / "config" / "bot-config.json"
        
        self.config_path = Path(config_path)
        self.config = self._load_config()
    
    def _load_config(self):
        """Load configuration from JSON file"""
        try:
            if not self.config_path.exists():
                raise FileNotFoundError(f"Configuration file not found: {self.config_path}")
            
            with open(self.config_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading configuration: {e}")
            return {}
    
    def get(self, section, key, default=None):
        """
        Get a configuration value
        
        Args:
            section (str): Section name (e.g., 'telegram', 'downloads')
            key (str): Key name within the section
            default: Default value if key is not found
            
        Returns:
            Configuration value or default
        """
        try:
            return self.config.get(section, {}).get(key, default)
        except Exception:
            return default
    
    def get_section(self, section):
        """Get entire configuration section"""
        return self.config.get(section, {})
    
    def get_telegram_config(self):
        """Get Telegram-specific configuration"""
        return self.get_section('telegram')
    
    def get_download_config(self):
        """Get download-specific configuration"""
        return self.get_section('downloads')
    
    def get_features_config(self):
        """Get features configuration"""
        return self.get_section('features')
    
    def get_youtube_config(self):
        """Get YouTube configuration"""
        return self.get_section('youtube')
    
    def get_system_config(self):
        """Get system configuration"""
        return self.get_section('system')
    
    def get_paths_config(self):
        """Get paths configuration"""
        return self.get_section('paths')
    
    # Environment variable compatibility methods
    def get_variable(self, var_name):
        """
        Get variable in a way compatible with the old EnvironmentReader
        Maps old environment variable names to new config structure
        """
        variable_mapping = {
            # Telegram
            'API_ID': ('telegram', 'api_id'),
            'API_HASH': ('telegram', 'api_hash'),
            'BOT_TOKEN': ('telegram', 'bot_token'),
            'SESSION': ('telegram', 'session'),
            'TG_AUTHORIZED_USER_ID': ('telegram', 'authorized_user_ids'),
            
            # Downloads
            'TG_DOWNLOAD_PATH': ('downloads', 'base_path'),
            'YOUTUBE_AUDIO_FOLDER': ('downloads', 'youtube_audio_folder'),
            'YOUTUBE_VIDEO_FOLDER': ('downloads', 'youtube_video_folder'),
            
            # Features
            'TG_MAX_PARALLEL': ('features', 'max_parallel'),
            'TG_PROGRESS_DOWNLOAD': ('features', 'progress_download'),
            'PROGRESS_STATUS_SHOW': ('features', 'progress_status_show'),
            'TG_DL_TIMEOUT': ('features', 'dl_timeout'),
            'ENABLED_UNZIP': ('features', 'enabled_unzip'),
            'ENABLED_UNRAR': ('features', 'enabled_unrar'),
            'ENABLED_7Z': ('features', 'enabled_7z'),
            
            # YouTube
            'YOUTUBE_LINKS_SUPPORTED': ('youtube', 'links_supported'),
            'YOUTUBE_DEFAULT_DOWNLOAD': ('youtube', 'default_download'),
            'YOUTUBE_DEFAULT_EXTENSION': ('youtube', 'default_extension'),
            'YOUTUBE_FORMAT_AUDIO': ('youtube', 'format_audio'),
            'YOUTUBE_FORMAT_VIDEO': ('youtube', 'format_video'),
            'YOUTUBE_SHOW_OPTION_TIMEOUT': ('youtube', 'show_option_timeout'),
            'YOUTUBE_SHOW_OPTION': ('youtube', 'show_option'),
            
            # System
            'LANGUAGE': ('system', 'language'),
            'PUID': ('system', 'puid'),
            'PGID': ('system', 'pgid'),
            'PERMISSIONS_FOLDER': ('system', 'permissions_folder'),
            'PERMISSIONS_FILE': ('system', 'permissions_file'),
            
            # Paths
            'PATH_CONFIG': ('paths', 'config'),
            'PATH_PENDING_MESSAGES': ('paths', 'pending_messages'),
            'PATH_DOWNLOAD_FILES': ('paths', 'download_files'),
        }
        
        if var_name in variable_mapping:
            section, key = variable_mapping[var_name]
            value = self.get(section, key)
            
            # Handle special cases
            if var_name == 'TG_AUTHORIZED_USER_ID':
                # Convert list to comma-separated string for compatibility
                if isinstance(value, list):
                    return ','.join(value)
            elif var_name == 'YOUTUBE_LINKS_SUPPORTED':
                # Convert list to comma-separated string
                if isinstance(value, list):
                    return ','.join(value)
            
            return value
        
        # If not found in mapping, return None
        return None
    
    def print_variables(self):
        """Print key variables for debugging"""
        telegram_config = self.get_telegram_config()
        print(f"API_ID: {telegram_config.get('api_id')}")
        print(f"API_HASH: {telegram_config.get('api_hash')}")
        print(f"BOT_TOKEN: {telegram_config.get('bot_token')}")
        print(f"SESSION: {telegram_config.get('session')}")
        print(f"AUTHORIZED_USER_IDS: {telegram_config.get('authorized_user_ids')}")

# Create global instance for easy access
config_reader = ConfigReader()