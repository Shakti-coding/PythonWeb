// @ts-ignore - No type definitions available
import MTProto from '@mtproto/core';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from './logger';

export interface MTProtoConfig {
  api_id: number;
  api_hash: string;
  session?: string;
}

export class MTProtoClient {
  private mtproto: MTProto;
  private session: any = null;
  private isAuthenticated = false;
  private config: MTProtoConfig;

  constructor(config: MTProtoConfig) {
    this.config = config;
    
    this.mtproto = new MTProto({
      api_id: config.api_id,
      api_hash: config.api_hash,
      storageOptions: {
        path: path.resolve('./downloads/session.json'),
      },
    });

    // Set up error handling
    this.mtproto.updates.on('updateShortMessage', (message: any) => {
      logger.debug(`MTProto update: ${JSON.stringify(message)}`);
    });
  }

  async connect(): Promise<void> {
    try {
      logger.info('🔌 Connecting to MTProto API...');
      
      // Try to load existing session
      await this.loadSession();
      
      // Test the connection
      await this.call('help.getConfig');
      this.isAuthenticated = true;
      
      logger.info('✅ MTProto client connected successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`❌ MTProto connection failed: ${errorMessage}`);
      throw error;
    }
  }

  private async loadSession(): Promise<void> {
    try {
      const sessionPath = path.resolve('./downloads/session.json');
      if (fs.existsSync(sessionPath)) {
        const sessionData = fs.readFileSync(sessionPath, 'utf8');
        this.session = JSON.parse(sessionData);
        logger.debug('📁 Loaded existing MTProto session');
      }
    } catch (error) {
      logger.debug('⚠️ No existing session found, will create new one');
    }
  }

  private async saveSession(): Promise<void> {
    try {
      const sessionPath = path.resolve('./downloads/session.json');
      fs.writeFileSync(sessionPath, JSON.stringify(this.session, null, 2));
      logger.debug('💾 MTProto session saved');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`❌ Failed to save session: ${errorMessage}`);
    }
  }

  private async call(method: string, params: any = {}): Promise<any> {
    try {
      return await this.mtproto.call(method, params);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`MTProto call failed: ${method} - ${errorMessage}`);
      throw error;
    }
  }

  async downloadFile(
    fileLocation: any,
    fileName: string,
    onProgress?: (percentage: number) => void
  ): Promise<string> {
    try {
      if (!this.isAuthenticated) {
        throw new Error('MTProto client not authenticated');
      }

      logger.info(`📥 Starting MTProto file download: ${fileName}`);
      
      // Create download directory
      const downloadDir = path.resolve('./downloads/completed');
      if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
      }

      const outputPath = path.join(downloadDir, fileName);
      const writeStream = fs.createWriteStream(outputPath);

      // Get file info
      const fileInfo = await this.call('upload.getFile', {
        location: fileLocation,
        offset: 0,
        limit: 1024 * 1024, // 1MB chunks
      });

      let offset = 0;
      const totalSize = fileInfo.bytes?.length || 0;
      let downloadedSize = 0;

      // Download file in chunks
      while (true) {
        const chunk = await this.call('upload.getFile', {
          location: fileLocation,
          offset: offset,
          limit: 1024 * 1024, // 1MB chunks
        });

        if (!chunk.bytes || chunk.bytes.length === 0) {
          break;
        }

        writeStream.write(chunk.bytes);
        downloadedSize += chunk.bytes.length;
        offset += chunk.bytes.length;

        // Report progress
        if (onProgress && totalSize > 0) {
          const percentage = Math.round((downloadedSize / totalSize) * 100);
          onProgress(percentage);
        }

        logger.debug(`Downloaded ${downloadedSize} bytes of ${fileName}`);
      }

      writeStream.end();

      return new Promise((resolve, reject) => {
        writeStream.on('finish', () => {
          logger.info(`✅ MTProto download completed: ${fileName} (${downloadedSize} bytes)`);
          resolve(outputPath);
        });

        writeStream.on('error', (error) => {
          logger.error(`❌ MTProto download failed: ${error.message}`);
          reject(error);
        });
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`MTProto download error: ${errorMessage}`);
      throw error;
    }
  }

  async getFileInfo(fileId: string): Promise<any> {
    try {
      if (!this.isAuthenticated) {
        throw new Error('MTProto client not authenticated');
      }

      // Convert file_id to file location
      // This is complex and requires understanding Telegram's file_id format
      // For now, we'll use a simplified approach
      
      return await this.call('messages.getDocumentByHash', {
        sha256: fileId,
        size: 0,
        mime_type: 'application/octet-stream',
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to get file info: ${errorMessage}`);
      throw error;
    }
  }

  isConnected(): boolean {
    return this.isAuthenticated;
  }

  async disconnect(): Promise<void> {
    try {
      if (this.session) {
        await this.saveSession();
      }
      logger.info('🔌 MTProto client disconnected');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error disconnecting MTProto: ${errorMessage}`);
    }
  }
}