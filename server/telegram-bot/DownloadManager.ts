import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { createWriteStream } from 'fs';

interface DownloadOptions {
  outputPath: string;
  filename?: string;
  maxRetries?: number;
  timeout?: number;
  headers?: Record<string, string>;
  progressCallback?: (progress: DownloadProgress) => void;
}

interface DownloadProgress {
  percentage: number;
  downloaded: number;
  total: number;
  speed: number;
  eta: number;
}

interface DownloadResult {
  success: boolean;
  filePath?: string;
  error?: string;
  size?: number;
}

export class DownloadManager {
  private activeDownloads: Map<string, any> = new Map();
  private downloadPaths: Map<string, string> = new Map();

  constructor() {
    this.initializePathMappings();
  }

  private initializePathMappings(): void {
    // Define download paths based on file types/patterns
    this.downloadPaths.set('video', 'downloads/video');
    this.downloadPaths.set('audio', 'downloads/audio');
    this.downloadPaths.set('image', 'downloads/images');
    this.downloadPaths.set('document', 'downloads/documents');
    this.downloadPaths.set('archive', 'downloads/archives');
    this.downloadPaths.set('default', 'downloads/misc');
  }

  async downloadDirectUrl(url: string, options: DownloadOptions): Promise<DownloadResult> {
    try {
      console.log('🌐 Starting direct URL download:', url);

      const downloadId = this.generateDownloadId();
      const filename = options.filename || this.extractFilenameFromUrl(url);
      const outputPath = path.join(options.outputPath, filename);

      // Ensure directory exists
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Start download
      const result = await this.performDownload(url, outputPath, options, downloadId);
      
      return result;

    } catch (error) {
      console.error('❌ Direct download error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  private async performDownload(
    url: string, 
    outputPath: string, 
    options: DownloadOptions, 
    downloadId: string
  ): Promise<DownloadResult> {
    
    const maxRetries = options.maxRetries || 3;
    const timeout = options.timeout || 300000; // 5 minutes

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📥 Download attempt ${attempt}/${maxRetries} for: ${path.basename(outputPath)}`);

        const response = await axios({
          method: 'GET',
          url: url,
          responseType: 'stream',
          timeout: timeout,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            ...options.headers
          }
        });

        const totalSize = parseInt(response.headers['content-length'] || '0');
        let downloadedSize = 0;
        let lastProgressUpdate = Date.now();

        const writeStream = createWriteStream(outputPath);
        this.activeDownloads.set(downloadId, { url, outputPath, startTime: Date.now() });

        return new Promise((resolve, reject) => {
          response.data.on('data', (chunk: Buffer) => {
            downloadedSize += chunk.length;
            
            // Update progress
            if (options.progressCallback && totalSize > 0) {
              const now = Date.now();
              if (now - lastProgressUpdate > 1000) { // Update every second
                const percentage = Math.round((downloadedSize / totalSize) * 100);
                const speed = this.calculateSpeed(downloadedSize, Date.now() - this.activeDownloads.get(downloadId)?.startTime);
                const eta = this.calculateETA(downloadedSize, totalSize, speed);

                options.progressCallback({
                  percentage,
                  downloaded: downloadedSize,
                  total: totalSize,
                  speed,
                  eta
                });

                lastProgressUpdate = now;
              }
            }
          });

          response.data.on('error', (error: Error) => {
            console.error('❌ Download stream error:', error);
            writeStream.destroy();
            this.activeDownloads.delete(downloadId);
            reject(error);
          });

          writeStream.on('error', (error: Error) => {
            console.error('❌ Write stream error:', error);
            this.activeDownloads.delete(downloadId);
            reject(error);
          });

          writeStream.on('finish', () => {
            this.activeDownloads.delete(downloadId);
            console.log('✅ Download completed:', outputPath);
            
            resolve({
              success: true,
              filePath: outputPath,
              size: downloadedSize
            });
          });

          response.data.pipe(writeStream);
        });

      } catch (error) {
        console.error(`❌ Download attempt ${attempt} failed:`, error.message);
        
        if (attempt === maxRetries) {
          this.activeDownloads.delete(downloadId);
          return {
            success: false,
            error: error.message
          };
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
      }
    }

    return {
      success: false,
      error: 'Max retries exceeded'
    };
  }

  private calculateSpeed(downloaded: number, timeElapsed: number): number {
    if (timeElapsed === 0) return 0;
    return Math.round(downloaded / (timeElapsed / 1000)); // bytes per second
  }

  private calculateETA(downloaded: number, total: number, speed: number): number {
    if (speed === 0 || downloaded >= total) return 0;
    return Math.round((total - downloaded) / speed); // seconds
  }

  private extractFilenameFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      let filename = path.basename(pathname);
      
      // If no filename found, generate one
      if (!filename || filename === '/' || !filename.includes('.')) {
        const extension = this.guessExtensionFromUrl(url);
        filename = `download_${Date.now()}.${extension}`;
      }
      
      return this.sanitizeFilename(filename);
    } catch (error) {
      return `download_${Date.now()}.bin`;
    }
  }

  private guessExtensionFromUrl(url: string): string {
    const commonExtensions = [
      'mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm',
      'mp3', 'wav', 'flac', 'aac', 'ogg',
      'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp',
      'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
      'zip', 'rar', '7z', 'tar', 'gz'
    ];

    for (const ext of commonExtensions) {
      if (url.toLowerCase().includes(`.${ext}`)) {
        return ext;
      }
    }

    return 'bin';
  }

  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '_')
      .trim()
      .substring(0, 200);
  }

  private generateDownloadId(): string {
    return `download_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getDownloadPath(fileType: string, filename?: string): string {
    // Determine file type from filename
    const type = this.determineFileType(filename || '');
    const basePath = this.downloadPaths.get(type) || this.downloadPaths.get('default')!;
    
    // Create full path
    const fullPath = path.join(process.cwd(), basePath);
    
    // Ensure directory exists
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
    
    return fullPath;
  }

  private determineFileType(filename: string): string {
    const extension = path.extname(filename).toLowerCase();
    
    const typeMap: Record<string, string> = {
      // Video
      '.mp4': 'video', '.avi': 'video', '.mkv': 'video', '.mov': 'video',
      '.wmv': 'video', '.flv': 'video', '.webm': 'video', '.m4v': 'video',
      
      // Audio
      '.mp3': 'audio', '.wav': 'audio', '.flac': 'audio', '.aac': 'audio',
      '.ogg': 'audio', '.wma': 'audio', '.m4a': 'audio',
      
      // Images
      '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.gif': 'image',
      '.bmp': 'image', '.webp': 'image', '.tiff': 'image', '.svg': 'image',
      
      // Documents
      '.pdf': 'document', '.doc': 'document', '.docx': 'document',
      '.xls': 'document', '.xlsx': 'document', '.ppt': 'document',
      '.pptx': 'document', '.txt': 'document', '.rtf': 'document',
      
      // Archives
      '.zip': 'archive', '.rar': 'archive', '.7z': 'archive',
      '.tar': 'archive', '.gz': 'archive', '.bz2': 'archive'
    };
    
    return typeMap[extension] || 'default';
  }

  organizeFileByPattern(filename: string, patterns: Record<string, string>): string {
    for (const [pattern, targetPath] of Object.entries(patterns)) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(filename)) {
        const fullPath = path.join(process.cwd(), targetPath);
        if (!fs.existsSync(fullPath)) {
          fs.mkdirSync(fullPath, { recursive: true });
        }
        return fullPath;
      }
    }
    
    return this.getDownloadPath('default');
  }

  async validateDownload(filePath: string, expectedSize?: number): Promise<boolean> {
    try {
      if (!fs.existsSync(filePath)) {
        return false;
      }

      const stats = fs.statSync(filePath);
      
      // Check if file is not empty
      if (stats.size === 0) {
        return false;
      }

      // Check expected size if provided
      if (expectedSize && Math.abs(stats.size - expectedSize) > 1024) { // Allow 1KB difference
        console.warn(`Size mismatch: expected ${expectedSize}, got ${stats.size}`);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error validating download:', error);
      return false;
    }
  }

  async retryFailedDownload(url: string, originalPath: string, options: DownloadOptions): Promise<DownloadResult> {
    console.log('🔄 Retrying failed download:', url);
    
    // Remove incomplete file if exists
    if (fs.existsSync(originalPath)) {
      try {
        fs.unlinkSync(originalPath);
      } catch (error) {
        console.error('Error removing incomplete file:', error);
      }
    }
    
    return this.downloadDirectUrl(url, options);
  }

  getActiveDownloads(): Array<{ id: string; url: string; outputPath: string; startTime: number }> {
    return Array.from(this.activeDownloads.entries()).map(([id, info]) => ({
      id,
      ...info
    }));
  }

  cancelDownload(downloadId: string): boolean {
    if (this.activeDownloads.has(downloadId)) {
      this.activeDownloads.delete(downloadId);
      console.log('❌ Download cancelled:', downloadId);
      return true;
    }
    return false;
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  formatSpeed(bytesPerSecond: number): string {
    return this.formatFileSize(bytesPerSecond) + '/s';
  }

  formatTime(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
}