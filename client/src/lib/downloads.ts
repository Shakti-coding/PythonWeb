import type { DownloadItem } from '@shared/schema';
import { storage } from './storage';

interface FileSystemDirectoryHandle {
  requestPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
}

interface FileSystemFileHandle {
  createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemWritableFileStream extends WritableStream {
  write(data: BufferSource | Blob | string): Promise<void>;
  close(): Promise<void>;
}

declare global {
  interface Window {
    showDirectoryPicker(): Promise<FileSystemDirectoryHandle>;
  }
}

class DownloadManager {
  private downloadDirectory: FileSystemDirectoryHandle | null = null;
  private activeDownloads = new Map<string, AbortController>();
  private useDefaultDownload = true; // Default to browser downloads

  async selectDownloadDirectory(): Promise<boolean> {
    console.log('Attempting to select directory...');
    console.log('showDirectoryPicker available:', 'showDirectoryPicker' in window);
    console.log('User agent:', navigator.userAgent);
    
    if (!('showDirectoryPicker' in window)) {
      throw new Error('File System Access API is not supported in this browser');
    }

    try {
      console.log('Calling showDirectoryPicker...');
      this.downloadDirectory = await window.showDirectoryPicker();
      console.log('Directory selected:', this.downloadDirectory);
      
      // Request write permission
      const permission = await this.downloadDirectory.requestPermission({ mode: 'readwrite' });
      console.log('Permission result:', permission);
      
      if (permission !== 'granted') {
        throw new Error('Write permission not granted');
      }

      // Store the directory handle in localStorage as a fallback reference
      localStorage.setItem('downloadDirectoryGranted', 'true');
      
      return true;
    } catch (error) {
      console.log('Error in selectDownloadDirectory:', error);
      // Check if user cancelled the dialog
      if (error instanceof Error && 
          (error.message.includes('aborted') || 
           error.message.includes('cancelled') ||
           error.message.includes('dismissed') ||
           error.name === 'AbortError')) {
        // User cancelled - this is not an error, just return false
        console.log('User cancelled directory selection');
        return false;
      }
      
      console.error('Failed to select download directory:', error);
      throw error;
    }
  }

  async saveFile(data: Uint8Array, fileName: string): Promise<string> {
    if (!this.downloadDirectory) {
      throw new Error('Download directory not selected');
    }

    try {
      // Sanitize filename
      const sanitizedFileName = fileName.replace(/[^\w\s.-]/g, '_');
      
      // Create or get file handle
      const fileHandle = await this.downloadDirectory.getFileHandle(sanitizedFileName, { create: true });
      
      // Create writable stream
      const writable = await fileHandle.createWritable();
      
      // Write data
      await writable.write(data);
      await writable.close();
      
      return sanitizedFileName;
    } catch (error) {
      console.error('Failed to save file:', error);
      throw error;
    }
  }

  async downloadWithProgress(
    downloadItem: DownloadItem,
    dataProvider: (onProgress: (progress: number, speed: number) => void) => Promise<Uint8Array>,
    onProgress?: (progress: number, speed: number) => void
  ): Promise<string> {
    const controller = new AbortController();
    this.activeDownloads.set(downloadItem.id, controller);

    try {
      // Update status to downloading
      downloadItem.status = 'downloading';
      downloadItem.progress = 0;
      await storage.saveDownload(downloadItem);

      const progressCallback = async (progress: number, speed: number) => {
        if (controller.signal.aborted) {
          throw new Error('Download aborted');
        }

        // Update progress in storage
        await storage.updateDownloadProgress(downloadItem.id, progress, speed);
        
        // Call external progress callback
        if (onProgress) {
          onProgress(progress, speed);
        }
      };

      // Get file data with progress tracking
      const data = await dataProvider(progressCallback);

      if (controller.signal.aborted) {
        throw new Error('Download aborted');
      }

      let savedFileName: string;
      
      // Use File System Access API if directory is selected and not using default, otherwise fallback
      if (this.downloadDirectory && this.hasFileSystemSupport() && !this.useDefaultDownload) {
        savedFileName = await this.saveFile(data, downloadItem.fileName);
      } else {
        // Use fallback download method (browser default downloads)
        await this.fallbackDownload(data, downloadItem.fileName);
        savedFileName = downloadItem.fileName;
      }

      // Update download status
      downloadItem.status = 'completed';
      downloadItem.progress = 100;
      downloadItem.downloadPath = savedFileName;
      await storage.saveDownload(downloadItem);

      return savedFileName;
    } catch (error) {
      // Update download status to failed
      downloadItem.status = 'failed';
      await storage.saveDownload(downloadItem);
      
      console.error('Download failed:', error);
      throw error;
    } finally {
      this.activeDownloads.delete(downloadItem.id);
    }
  }

  async cancelDownload(downloadId: string): Promise<void> {
    const controller = this.activeDownloads.get(downloadId);
    if (controller) {
      // Immediately abort and update status
      controller.abort();
      this.activeDownloads.delete(downloadId);
      
      // Update download status to cancelled
      try {
        const downloads = await storage.getDownloads();
        const download = downloads.find(d => d.id === downloadId);
        if (download) {
          download.status = 'cancelled';
          await storage.saveDownload(download);
        }
      } catch (error) {
        console.error('Failed to update download status to cancelled:', error);
      }
    }
  }

  async pauseDownload(downloadId: string): Promise<void> {
    const controller = this.activeDownloads.get(downloadId);
    if (controller) {
      // Abort current download but mark as paused
      controller.abort();
      this.activeDownloads.delete(downloadId);
      
      // Update download status to paused
      try {
        const downloads = await storage.getDownloads();
        const download = downloads.find(d => d.id === downloadId);
        if (download) {
          download.status = 'paused';
          await storage.saveDownload(download);
        }
      } catch (error) {
        console.error('Failed to update download status to paused:', error);
      }
    }
  }

  async resumeDownload(
    downloadItem: DownloadItem,
    dataProvider: (onProgress: (progress: number, speed: number) => void) => Promise<Uint8Array>,
    onProgress?: (progress: number, speed: number) => void
  ): Promise<string> {
    // Resume download by starting it again
    return this.downloadWithProgress(downloadItem, dataProvider, onProgress);
  }

  cancelAllDownloads(): void {
    Array.from(this.activeDownloads.keys()).forEach(downloadId => {
      this.cancelDownload(downloadId);
    });
  }

  isDownloadDirectorySelected(): boolean {
    return this.downloadDirectory !== null;
  }

  getActiveDownloadCount(): number {
    return this.activeDownloads.size;
  }

  // Fallback download method for browsers without File System Access API
  async fallbackDownload(data: Uint8Array, fileName: string): Promise<void> {
    const blob = new Blob([data]);
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
  }

  hasFileSystemSupport(): boolean {
    // Check if showDirectoryPicker is available
    const hasAPI = 'showDirectoryPicker' in window;
    const isSecureContext = window.isSecureContext;
    console.log('File System Support Check:', { hasAPI, isSecureContext, userAgent: navigator.userAgent });
    
    return hasAPI && isSecureContext;
  }

  isMobileDevice(): boolean {
    return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(window.navigator.userAgent);
  }

  setUseDefaultDownload(useDefault: boolean): void {
    this.useDefaultDownload = useDefault;
    localStorage.setItem('useDefaultDownload', useDefault.toString());
  }

  getUseDefaultDownload(): boolean {
    const stored = localStorage.getItem('useDefaultDownload');
    if (stored !== null) {
      this.useDefaultDownload = stored === 'true';
    } else {
      // Default to browser downloads if no preference is stored
      this.useDefaultDownload = true;
    }
    return this.useDefaultDownload;
  }
}

export const downloadManager = new DownloadManager();
