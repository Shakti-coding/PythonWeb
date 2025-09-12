import * as fs from 'fs';
import * as path from 'path';

export interface TelegramConfig {
  api_id: string;
  api_hash: string;
  bot_token: string;
  session: string;
  authorized_user_ids: string[];
}

export interface DownloadsConfig {
  base_path: string;
  youtube_audio_folder: string;
  youtube_video_folder: string;
  completed_folder: string;
  temp_folder: string;
  links_folder: string;
}

export interface FeaturesConfig {
  enabled_unzip: boolean;
  enabled_unrar: boolean;
  enabled_7z: boolean;
  enabled_youtube: boolean;
  progress_download: boolean;
  max_parallel: number;
  progress_status_show: number;
  dl_timeout: number;
}

export interface YouTubeConfig {
  links_supported: string[];
  default_download: string;
  default_extension: string;
  format_audio: string;
  format_video: string;
  show_option_timeout: number;
  show_option: boolean;
}

export interface SystemConfig {
  language: string;
  puid: string | null;
  pgid: string | null;
  permissions_folder: string;
  permissions_file: string;
}

export interface PathsConfig {
  config: string;
  pending_messages: string;
  download_files: string;
}

export interface BotConfig {
  telegram: TelegramConfig;
  downloads: DownloadsConfig;
  features: FeaturesConfig;
  youtube: YouTubeConfig;
  system: SystemConfig;
  paths: PathsConfig;
}

export class ConfigReader {
  private config: BotConfig;
  private configPath: string;

  constructor(configPath?: string) {
    if (!configPath) {
      // Look for config file in project root (ES module compatible)
      const currentDir = path.dirname(new URL(import.meta.url).pathname);
      const projectRoot = path.resolve(currentDir, '..');
      this.configPath = path.join(projectRoot, 'config', 'bot-config.json');
    } else {
      this.configPath = configPath;
    }

    this.config = this.loadConfig();
  }

  private loadConfig(): BotConfig {
    try {
      if (!fs.existsSync(this.configPath)) {
        throw new Error(`Configuration file not found: ${this.configPath}`);
      }

      const configData = fs.readFileSync(this.configPath, 'utf-8');
      return JSON.parse(configData) as BotConfig;
    } catch (error) {
      console.error('Error loading configuration:', error);
      throw error;
    }
  }

  public get<T>(section: keyof BotConfig, key: string, defaultValue?: T): T {
    try {
      const sectionData = this.config[section] as any;
      return sectionData[key] !== undefined ? sectionData[key] : defaultValue;
    } catch (error) {
      console.error(`Error getting config value [${section}][${key}]:`, error);
      return defaultValue as T;
    }
  }

  public getSection<T>(section: keyof BotConfig): T {
    return this.config[section] as T;
  }

  public getTelegramConfig(): TelegramConfig {
    return this.config.telegram;
  }

  public getDownloadsConfig(): DownloadsConfig {
    return this.config.downloads;
  }

  public getFeaturesConfig(): FeaturesConfig {
    return this.config.features;
  }

  public getYouTubeConfig(): YouTubeConfig {
    return this.config.youtube;
  }

  public getSystemConfig(): SystemConfig {
    return this.config.system;
  }

  public getPathsConfig(): PathsConfig {
    return this.config.paths;
  }

  public getFullConfig(): BotConfig {
    return { ...this.config };
  }

  public reloadConfig(): void {
    this.config = this.loadConfig();
  }

  // Helper methods for easy access to common values
  public getApiId(): number {
    return parseInt(this.config.telegram.api_id);
  }

  public getApiHash(): string {
    return this.config.telegram.api_hash;
  }

  public getBotToken(): string {
    return this.config.telegram.bot_token;
  }

  public getAuthorizedUserIds(): string[] {
    return this.config.telegram.authorized_user_ids;
  }

  public getDownloadPath(): string {
    return this.config.downloads.base_path;
  }

  public isFeatureEnabled(feature: keyof FeaturesConfig): boolean {
    const value = this.config.features[feature];
    return typeof value === 'boolean' ? value : false;
  }

  public printConfig(): void {
    console.log('=== Bot Configuration ===');
    console.log('Telegram API ID:', this.config.telegram.api_id);
    console.log('Telegram API Hash:', this.config.telegram.api_hash.slice(0, 8) + '...');
    console.log('Bot Token:', this.config.telegram.bot_token.slice(0, 10) + '...');
    console.log('Authorized Users:', this.config.telegram.authorized_user_ids.length);
    console.log('Download Path:', this.config.downloads.base_path);
    console.log('Features Enabled:', Object.keys(this.config.features).filter(key => 
      this.config.features[key as keyof FeaturesConfig] === true
    ).join(', '));
    console.log('========================');
  }
}

// Create singleton instance
export const configReader = new ConfigReader();