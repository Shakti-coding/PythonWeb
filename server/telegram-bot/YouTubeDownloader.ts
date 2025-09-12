import ytdl from 'ytdl-core';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

interface DownloadOptions {
  format: 'video' | 'audio';
  quality: string;
  outputPath: string;
  progressCallback?: (progress: any) => void;
}

interface DownloadProgress {
  percentage: number;
  downloaded: number;
  total: number;
  speed: string;
  eta: string;
}

export class YouTubeDownloader {
  private outputPath: string;
  private maxRetries: number = 3;

  constructor(outputPath: string) {
    this.outputPath = outputPath;
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    const dirs = [
      this.outputPath,
      path.join(this.outputPath, 'video'),
      path.join(this.outputPath, 'audio'),
    ];

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  async downloadVideo(url: string, options: Partial<DownloadOptions> = {}): Promise<string> {
    const opts: DownloadOptions = {
      format: 'video',
      quality: 'highest',
      outputPath: path.join(this.outputPath, 'video'),
      ...options,
    };

    return this.download(url, opts);
  }

  async downloadAudio(url: string, options: Partial<DownloadOptions> = {}): Promise<string> {
    const opts: DownloadOptions = {
      format: 'audio',
      quality: 'highestaudio',
      outputPath: path.join(this.outputPath, 'audio'),
      ...options,
    };

    return this.download(url, opts);
  }

  private async download(url: string, options: DownloadOptions): Promise<string> {
    try {
      console.log(`🎬 Starting YouTube ${options.format} download:`, url);

      // Get video info
      const info = await ytdl.getInfo(url);
      const title = this.sanitizeFilename(info.videoDetails.title);
      
      let filename: string;
      let outputFile: string;

      if (options.format === 'audio') {
        filename = `${title}.mp3`;
        outputFile = path.join(options.outputPath, filename);
        return this.downloadAudioWithYtDlp(url, outputFile, options.progressCallback);
      } else {
        filename = `${title}.mp4`;
        outputFile = path.join(options.outputPath, filename);
        return this.downloadVideoWithYtDlp(url, outputFile, options.progressCallback);
      }

    } catch (error) {
      console.error('YouTube download error:', error);
      throw new Error(`Failed to download: ${error.message}`);
    }
  }

  private async downloadVideoWithYtDlp(url: string, outputFile: string, progressCallback?: (progress: any) => void): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [
        url,
        '-o', outputFile,
        '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--merge-output-format', 'mp4',
        '--no-playlist',
        '--write-info-json',
        '--write-description',
        '--write-annotations',
        '--embed-subs',
        '--write-auto-sub',
      ];

      console.log('Running yt-dlp with args:', args);

      const ytDlp = spawn('yt-dlp', args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let errorOutput = '';

      ytDlp.stdout?.on('data', (data) => {
        const output = data.toString();
        console.log('yt-dlp stdout:', output);
        
        // Parse progress if callback provided
        if (progressCallback) {
          const progress = this.parseProgress(output);
          if (progress) {
            progressCallback(progress);
          }
        }
      });

      ytDlp.stderr?.on('data', (data) => {
        errorOutput += data.toString();
        console.log('yt-dlp stderr:', data.toString());
      });

      ytDlp.on('close', (code) => {
        if (code === 0) {
          console.log('✅ YouTube video download completed');
          resolve(outputFile);
        } else {
          console.error('❌ yt-dlp failed with code:', code);
          console.error('Error output:', errorOutput);
          reject(new Error(`yt-dlp failed: ${errorOutput}`));
        }
      });

      ytDlp.on('error', (error) => {
        console.error('❌ Failed to start yt-dlp:', error);
        // Fallback to ytdl-core for basic downloads
        this.downloadVideoWithYtdlCore(url, outputFile, progressCallback)
          .then(resolve)
          .catch(reject);
      });
    });
  }

  private async downloadAudioWithYtDlp(url: string, outputFile: string, progressCallback?: (progress: any) => void): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [
        url,
        '-o', outputFile.replace('.mp3', '.%(ext)s'),
        '--format', 'bestaudio/best',
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '320K',
        '--no-playlist',
        '--embed-thumbnail',
        '--add-metadata',
      ];

      console.log('Running yt-dlp for audio with args:', args);

      const ytDlp = spawn('yt-dlp', args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let errorOutput = '';

      ytDlp.stdout?.on('data', (data) => {
        const output = data.toString();
        console.log('yt-dlp stdout:', output);
        
        if (progressCallback) {
          const progress = this.parseProgress(output);
          if (progress) {
            progressCallback(progress);
          }
        }
      });

      ytDlp.stderr?.on('data', (data) => {
        errorOutput += data.toString();
        console.log('yt-dlp stderr:', data.toString());
      });

      ytDlp.on('close', (code) => {
        if (code === 0) {
          console.log('✅ YouTube audio download completed');
          resolve(outputFile);
        } else {
          console.error('❌ yt-dlp failed with code:', code);
          console.error('Error output:', errorOutput);
          reject(new Error(`yt-dlp failed: ${errorOutput}`));
        }
      });

      ytDlp.on('error', (error) => {
        console.error('❌ Failed to start yt-dlp:', error);
        // Fallback to ytdl-core for basic downloads
        this.downloadAudioWithYtdlCore(url, outputFile, progressCallback)
          .then(resolve)
          .catch(reject);
      });
    });
  }

  private async downloadVideoWithYtdlCore(url: string, outputFile: string, progressCallback?: (progress: any) => void): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        console.log('🔄 Falling back to ytdl-core for video download');
        
        const stream = ytdl(url, {
          quality: 'highest',
          filter: 'videoandaudio',
        });

        const writeStream = fs.createWriteStream(outputFile);
        
        let totalSize = 0;
        let downloadedSize = 0;

        stream.on('info', (info) => {
          totalSize = parseInt(info.formats[0]?.contentLength || '0');
          console.log('📊 Video size:', this.formatBytes(totalSize));
        });

        stream.on('data', (chunk) => {
          downloadedSize += chunk.length;
          
          if (progressCallback && totalSize > 0) {
            const progress = {
              percentage: Math.round((downloadedSize / totalSize) * 100),
              downloaded: downloadedSize,
              total: totalSize,
              speed: 'N/A',
              eta: 'N/A',
            };
            progressCallback(progress);
          }
        });

        stream.on('error', (error) => {
          console.error('❌ ytdl-core stream error:', error);
          writeStream.destroy();
          reject(error);
        });

        writeStream.on('error', (error) => {
          console.error('❌ Write stream error:', error);
          reject(error);
        });

        writeStream.on('finish', () => {
          console.log('✅ Video download completed with ytdl-core');
          resolve(outputFile);
        });

        stream.pipe(writeStream);

      } catch (error) {
        console.error('❌ ytdl-core error:', error);
        reject(error);
      }
    });
  }

  private async downloadAudioWithYtdlCore(url: string, outputFile: string, progressCallback?: (progress: any) => void): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        console.log('🔄 Falling back to ytdl-core for audio download');
        
        const stream = ytdl(url, {
          quality: 'highestaudio',
          filter: 'audioonly',
        });

        const writeStream = fs.createWriteStream(outputFile.replace('.mp3', '.webm'));
        
        let totalSize = 0;
        let downloadedSize = 0;

        stream.on('info', (info) => {
          const audioFormat = info.formats.find(f => f.hasAudio && !f.hasVideo);
          totalSize = parseInt(audioFormat?.contentLength || '0');
          console.log('📊 Audio size:', this.formatBytes(totalSize));
        });

        stream.on('data', (chunk) => {
          downloadedSize += chunk.length;
          
          if (progressCallback && totalSize > 0) {
            const progress = {
              percentage: Math.round((downloadedSize / totalSize) * 100),
              downloaded: downloadedSize,
              total: totalSize,
              speed: 'N/A',
              eta: 'N/A',
            };
            progressCallback(progress);
          }
        });

        stream.on('error', (error) => {
          console.error('❌ ytdl-core stream error:', error);
          writeStream.destroy();
          reject(error);
        });

        writeStream.on('finish', () => {
          console.log('✅ Audio download completed with ytdl-core');
          
          // Convert to MP3 using ffmpeg if available
          this.convertToMp3(outputFile.replace('.mp3', '.webm'), outputFile)
            .then(() => resolve(outputFile))
            .catch(() => resolve(outputFile.replace('.mp3', '.webm')));
        });

        stream.pipe(writeStream);

      } catch (error) {
        console.error('❌ ytdl-core error:', error);
        reject(error);
      }
    });
  }

  private async convertToMp3(inputFile: string, outputFile: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', inputFile,
        '-acodec', 'libmp3lame',
        '-ab', '320k',
        '-ar', '44100',
        '-y', // Overwrite output file
        outputFile,
      ]);

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          // Remove original file
          fs.unlinkSync(inputFile);
          resolve();
        } else {
          reject(new Error(`FFmpeg failed with code: ${code}`));
        }
      });

      ffmpeg.on('error', (error) => {
        reject(error);
      });
    });
  }

  private parseProgress(output: string): DownloadProgress | null {
    // Parse yt-dlp progress output
    const progressMatch = output.match(/(\d+\.?\d*)%.*?(\d+\.?\d*\w+\/s).*?ETA\s+(\d+:\d+)/);
    
    if (progressMatch) {
      return {
        percentage: parseFloat(progressMatch[1]),
        downloaded: 0, // yt-dlp doesn't always provide this
        total: 0,     // yt-dlp doesn't always provide this
        speed: progressMatch[2],
        eta: progressMatch[3],
      };
    }

    return null;
  }

  private sanitizeFilename(filename: string): string {
    // Remove or replace invalid characters
    return filename
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 200); // Limit length
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async getVideoInfo(url: string): Promise<any> {
    try {
      const info = await ytdl.getInfo(url);
      
      return {
        title: info.videoDetails.title,
        duration: info.videoDetails.lengthSeconds,
        author: info.videoDetails.author.name,
        description: info.videoDetails.description,
        thumbnails: info.videoDetails.thumbnails,
        formats: info.formats.map(f => ({
          quality: f.quality,
          container: f.container,
          hasVideo: f.hasVideo,
          hasAudio: f.hasAudio,
          contentLength: f.contentLength,
        })),
      };
    } catch (error) {
      console.error('Error getting video info:', error);
      throw error;
    }
  }

  async isValidUrl(url: string): Promise<boolean> {
    try {
      return ytdl.validateURL(url);
    } catch (error) {
      return false;
    }
  }

  async downloadPlaylist(url: string, options: Partial<DownloadOptions> = {}): Promise<string[]> {
    // This would require additional implementation for playlist support
    // For now, we'll extract individual video URLs and download them
    console.log('Playlist download not yet implemented');
    return [];
  }
}