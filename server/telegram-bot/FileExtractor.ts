import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import unzipper from 'unzipper';
import { createReadStream } from 'fs';

interface ExtractionResult {
  success: boolean;
  extractedFiles: string[];
  outputPath: string;
  error?: string;
}

export class FileExtractor {
  private config: {
    enableUnzip: boolean;
    enableUnrar: boolean;
    enable7z: boolean;
  };

  constructor(config = { enableUnzip: true, enableUnrar: true, enable7z: true }) {
    this.config = config;
  }

  async extractFile(filePath: string, outputDir?: string): Promise<ExtractionResult> {
    try {
      const fileExtension = path.extname(filePath).toLowerCase();
      const fileName = path.basename(filePath, fileExtension);
      
      // Default output directory
      if (!outputDir) {
        outputDir = path.join(path.dirname(filePath), fileName);
      }

      // Ensure output directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      console.log(`📦 Extracting ${fileExtension} file: ${filePath}`);
      console.log(`📁 Output directory: ${outputDir}`);

      switch (fileExtension) {
        case '.zip':
          return this.config.enableUnzip ? 
            await this.extractZip(filePath, outputDir) : 
            { success: false, extractedFiles: [], outputPath: outputDir, error: 'ZIP extraction disabled' };

        case '.rar':
          return this.config.enableUnrar ? 
            await this.extractRar(filePath, outputDir) : 
            { success: false, extractedFiles: [], outputPath: outputDir, error: 'RAR extraction disabled' };

        case '.7z':
          return this.config.enable7z ? 
            await this.extract7z(filePath, outputDir) : 
            { success: false, extractedFiles: [], outputPath: outputDir, error: '7Z extraction disabled' };

        default:
          return {
            success: false,
            extractedFiles: [],
            outputPath: outputDir,
            error: `Unsupported archive format: ${fileExtension}`
          };
      }

    } catch (error) {
      console.error('❌ Extraction error:', error);
      return {
        success: false,
        extractedFiles: [],
        outputPath: outputDir || '',
        error: error.message
      };
    }
  }

  private async extractZip(filePath: string, outputDir: string): Promise<ExtractionResult> {
    try {
      console.log('🔧 Using Node.js unzipper for ZIP extraction');
      
      const extractedFiles: string[] = [];

      return new Promise((resolve) => {
        createReadStream(filePath)
          .pipe(unzipper.Extract({ path: outputDir }))
          .on('entry', (entry) => {
            const fileName = entry.path;
            if (entry.type === 'File') {
              extractedFiles.push(path.join(outputDir, fileName));
            }
          })
          .on('finish', () => {
            console.log('✅ ZIP extraction completed');
            resolve({
              success: true,
              extractedFiles,
              outputPath: outputDir
            });
          })
          .on('error', (error) => {
            console.error('❌ ZIP extraction failed:', error);
            resolve({
              success: false,
              extractedFiles: [],
              outputPath: outputDir,
              error: error.message
            });
          });
      });

    } catch (error) {
      console.error('❌ ZIP extraction error:', error);
      return {
        success: false,
        extractedFiles: [],
        outputPath: outputDir,
        error: error.message
      };
    }
  }

  private async extractRar(filePath: string, outputDir: string): Promise<ExtractionResult> {
    return new Promise((resolve) => {
      console.log('🔧 Using unrar command for RAR extraction');
      
      const command = 'unrar';
      const args = ['x', '-o+', filePath, outputDir + '/'];

      console.log(`Running: ${command} ${args.join(' ')}`);

      const unrarProcess = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let outputData = '';
      let errorData = '';

      unrarProcess.stdout?.on('data', (data) => {
        outputData += data.toString();
        console.log('unrar stdout:', data.toString());
      });

      unrarProcess.stderr?.on('data', (data) => {
        errorData += data.toString();
        console.log('unrar stderr:', data.toString());
      });

      unrarProcess.on('close', (code) => {
        if (code === 0) {
          console.log('✅ RAR extraction completed');
          
          // Get list of extracted files
          const extractedFiles = this.getExtractedFiles(outputDir);
          
          resolve({
            success: true,
            extractedFiles,
            outputPath: outputDir
          });
        } else {
          console.error('❌ unrar failed with code:', code);
          console.error('Error output:', errorData);
          
          resolve({
            success: false,
            extractedFiles: [],
            outputPath: outputDir,
            error: `unrar failed with code ${code}: ${errorData}`
          });
        }
      });

      unrarProcess.on('error', (error) => {
        console.error('❌ Failed to start unrar:', error);
        resolve({
          success: false,
          extractedFiles: [],
          outputPath: outputDir,
          error: `Failed to start unrar: ${error.message}`
        });
      });
    });
  }

  private async extract7z(filePath: string, outputDir: string): Promise<ExtractionResult> {
    return new Promise((resolve) => {
      console.log('🔧 Using 7z command for 7Z extraction');
      
      const command = '7z';
      const args = ['x', `-o${outputDir}`, '-y', filePath];

      console.log(`Running: ${command} ${args.join(' ')}`);

      const sevenZipProcess = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let outputData = '';
      let errorData = '';

      sevenZipProcess.stdout?.on('data', (data) => {
        outputData += data.toString();
        console.log('7z stdout:', data.toString());
      });

      sevenZipProcess.stderr?.on('data', (data) => {
        errorData += data.toString();
        console.log('7z stderr:', data.toString());
      });

      sevenZipProcess.on('close', (code) => {
        if (code === 0) {
          console.log('✅ 7Z extraction completed');
          
          // Get list of extracted files
          const extractedFiles = this.getExtractedFiles(outputDir);
          
          resolve({
            success: true,
            extractedFiles,
            outputPath: outputDir
          });
        } else {
          console.error('❌ 7z failed with code:', code);
          console.error('Error output:', errorData);
          
          resolve({
            success: false,
            extractedFiles: [],
            outputPath: outputDir,
            error: `7z failed with code ${code}: ${errorData}`
          });
        }
      });

      sevenZipProcess.on('error', (error) => {
        console.error('❌ Failed to start 7z:', error);
        resolve({
          success: false,
          extractedFiles: [],
          outputPath: outputDir,
          error: `Failed to start 7z: ${error.message}`
        });
      });
    });
  }

  private getExtractedFiles(directory: string): string[] {
    const files: string[] = [];
    
    try {
      const items = fs.readdirSync(directory, { withFileTypes: true });
      
      for (const item of items) {
        const fullPath = path.join(directory, item.name);
        
        if (item.isFile()) {
          files.push(fullPath);
        } else if (item.isDirectory()) {
          // Recursively get files from subdirectories
          files.push(...this.getExtractedFiles(fullPath));
        }
      }
    } catch (error) {
      console.error('Error reading extracted files:', error);
    }
    
    return files;
  }

  async isArchiveFile(filePath: string): Promise<boolean> {
    const supportedExtensions = ['.zip', '.rar', '.7z'];
    const extension = path.extname(filePath).toLowerCase();
    return supportedExtensions.includes(extension);
  }

  async getArchiveInfo(filePath: string): Promise<any> {
    try {
      const extension = path.extname(filePath).toLowerCase();
      const stats = fs.statSync(filePath);
      
      return {
        path: filePath,
        name: path.basename(filePath),
        extension,
        size: stats.size,
        canExtract: await this.canExtract(extension),
        modified: stats.mtime,
      };
    } catch (error) {
      console.error('Error getting archive info:', error);
      return null;
    }
  }

  private async canExtract(extension: string): Promise<boolean> {
    switch (extension) {
      case '.zip':
        return this.config.enableUnzip;
      case '.rar':
        return this.config.enableUnrar && await this.isCommandAvailable('unrar');
      case '.7z':
        return this.config.enable7z && await this.isCommandAvailable('7z');
      default:
        return false;
    }
  }

  private async isCommandAvailable(command: string): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn(command, ['--version'], { stdio: 'ignore' });
      
      child.on('close', (code) => {
        resolve(code === 0);
      });
      
      child.on('error', () => {
        resolve(false);
      });
    });
  }

  async extractMultiple(filePaths: string[], outputBaseDir?: string): Promise<ExtractionResult[]> {
    const results: ExtractionResult[] = [];
    
    for (const filePath of filePaths) {
      if (await this.isArchiveFile(filePath)) {
        const result = await this.extractFile(filePath, outputBaseDir);
        results.push(result);
      } else {
        results.push({
          success: false,
          extractedFiles: [],
          outputPath: '',
          error: 'Not an archive file'
        });
      }
    }
    
    return results;
  }

  async verifyExtraction(result: ExtractionResult): Promise<boolean> {
    try {
      if (!result.success || result.extractedFiles.length === 0) {
        return false;
      }

      // Check if all extracted files exist
      for (const filePath of result.extractedFiles) {
        if (!fs.existsSync(filePath)) {
          console.error('Extracted file not found:', filePath);
          return false;
        }
      }

      console.log(`✅ Verified ${result.extractedFiles.length} extracted files`);
      return true;
    } catch (error) {
      console.error('Error verifying extraction:', error);
      return false;
    }
  }

  async cleanupOriginalFile(filePath: string, keepOriginal: boolean = false): Promise<void> {
    try {
      if (!keepOriginal && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('🗑️ Removed original archive file:', filePath);
      }
    } catch (error) {
      console.error('Error cleaning up original file:', error);
    }
  }

  getConfig() {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<typeof this.config>): void {
    this.config = { ...this.config, ...newConfig };
  }
}