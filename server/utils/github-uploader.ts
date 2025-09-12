import { logger } from '../telegram-bot/logger';
import type { ReplitFile, ReplitProject } from './replit-fetcher';

export interface UploadProgress {
  status: 'uploading' | 'completed' | 'error';
  filesProcessed: number;
  totalFiles: number;
  currentFile?: string;
  errors: string[];
  uploadedFiles: string[];
}

export interface GitHubUploadResult {
  success: boolean;
  filesUploaded: number;
  filesSkipped: number;
  errors: string[];
  repositoryUrl: string;
}

/**
 * Upload a Replit project to a GitHub repository
 */
export async function uploadToGitHub(
  project: ReplitProject,
  repoFullName: string,
  accessToken: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<GitHubUploadResult> {
  const [owner, repo] = repoFullName.split('/');
  const baseApiUrl = 'https://api.github.com';
  
  const progress: UploadProgress = {
    status: 'uploading',
    filesProcessed: 0,
    totalFiles: project.files.filter(f => f.type === 'file').length,
    errors: [],
    uploadedFiles: []
  };
  
  const result: GitHubUploadResult = {
    success: false,
    filesUploaded: 0,
    filesSkipped: 0,
    errors: [],
    repositoryUrl: `https://github.com/${repoFullName}`
  };
  
  logger.info(`Starting upload of ${progress.totalFiles} files to ${repoFullName}`);
  
  try {
    // Filter out directories and only process files
    const filesToUpload = project.files.filter(file => file.type === 'file');
    
    // Batch upload files to avoid rate limiting
    const BATCH_SIZE = 5;
    const batches = [];
    
    for (let i = 0; i < filesToUpload.length; i += BATCH_SIZE) {
      batches.push(filesToUpload.slice(i, i + BATCH_SIZE));
    }
    
    for (const batch of batches) {
      await Promise.all(
        batch.map(async (file) => {
          try {
            progress.currentFile = file.path;
            onProgress?.(progress);
            
            const uploadResult = await uploadSingleFile(
              file,
              owner,
              repo,
              accessToken,
              baseApiUrl
            );
            
            if (uploadResult.success) {
              result.filesUploaded++;
              progress.uploadedFiles.push(file.path);
              logger.debug(`✅ Uploaded: ${file.path}`);
            } else {
              result.filesSkipped++;
              result.errors.push(`Failed to upload ${file.path}: ${uploadResult.error}`);
              progress.errors.push(`${file.path}: ${uploadResult.error}`);
              logger.warn(`❌ Failed to upload: ${file.path} - ${uploadResult.error}`);
            }
          } catch (error) {
            result.filesSkipped++;
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            result.errors.push(`Failed to upload ${file.path}: ${errorMsg}`);
            progress.errors.push(`${file.path}: ${errorMsg}`);
            logger.error(`❌ Upload error for ${file.path}: ${errorMsg}`);
          } finally {
            progress.filesProcessed++;
            onProgress?.(progress);
          }
        })
      );
      
      // Small delay between batches to respect rate limits
      if (batches.indexOf(batch) < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Update final progress
    progress.status = result.errors.length === 0 ? 'completed' : 'error';
    onProgress?.(progress);
    
    result.success = result.filesUploaded > 0;
    
    logger.info(`Upload completed: ${result.filesUploaded} uploaded, ${result.filesSkipped} skipped, ${result.errors.length} errors`);
    
    return result;
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    progress.status = 'error';
    progress.errors.push(errorMsg);
    result.errors.push(errorMsg);
    onProgress?.(progress);
    
    logger.error(`Upload failed: ${errorMsg}`);
    throw error;
  }
}

/**
 * Upload a single file to GitHub repository with SHA mismatch retry logic
 */
async function uploadSingleFile(
  file: ReplitFile,
  owner: string,
  repo: string,
  accessToken: string,
  baseApiUrl: string
): Promise<{ success: boolean; error?: string }> {
  const filePath = file.path.startsWith('/') ? file.path.slice(1) : file.path;
  // Encode each path component separately to avoid encoding forward slashes
  const encodedPath = filePath.split('/').map(component => encodeURIComponent(component)).join('/');
  const url = `${baseApiUrl}/repos/${owner}/${repo}/contents/${encodedPath}`;
  
  // Helper function to get current SHA
  const getCurrentSha = async (): Promise<string | undefined> => {
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `token ${accessToken}`,
          'User-Agent': 'TelegramManager-GitHubSync',
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.sha;
      }
      return undefined;
    } catch (error) {
      logger.debug(`File ${filePath} doesn't exist or error checking: ${error}`);
      return undefined;
    }
  };

  // Prepare file content encoding
  let base64Content: string;
  try {
    if (file.encoding === 'base64') {
      base64Content = file.content;
    } else {
      // Convert to Base64 with proper encoding handling
      const encoding = file.encoding || 'utf8';
      base64Content = Buffer.from(file.content, encoding as BufferEncoding).toString('base64');
    }
  } catch (error) {
    return { success: false, error: `Failed to encode file content: ${error}` };
  }

  // Retry logic for SHA mismatches
  const MAX_RETRIES = 3;
  let attempts = 0;
  
  while (attempts < MAX_RETRIES) {
    attempts++;
    
    try {
      // Get the current SHA
      const existingSha = await getCurrentSha();
      logger.debug(`File ${filePath} ${existingSha ? `exists with SHA: ${existingSha}` : 'does not exist'} (attempt ${attempts})`);
      
      const uploadData: any = {
        message: `Sync from Replit: ${existingSha ? 'Update' : 'Add'} ${filePath}`,
        content: base64Content,
        branch: 'main'
      };
      
      // Add SHA if file exists (for updates)
      if (existingSha) {
        uploadData.sha = existingSha;
      }
      
      // Upload the file
      const uploadResponse = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${accessToken}`,
          'User-Agent': 'TelegramManager-GitHubSync',
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify(uploadData)
      });
      
      if (uploadResponse.ok) {
        logger.debug(`✅ Successfully uploaded ${filePath} on attempt ${attempts}`);
        return { success: true };
      }
      
      const errorData = await uploadResponse.json().catch(() => ({}));
      const errorMsg = errorData.message || `HTTP ${uploadResponse.status}: ${uploadResponse.statusText}`;
      
      // Handle SHA mismatch errors with retry
      if (uploadResponse.status === 409 || (errorData.message && errorData.message.includes('but expected'))) {
        if (attempts < MAX_RETRIES) {
          logger.warn(`SHA mismatch for ${filePath}, retrying attempt ${attempts + 1}/${MAX_RETRIES}`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts)); // Progressive delay
          continue; // Retry with fresh SHA
        } else {
          return { 
            success: false, 
            error: `SHA mismatch after ${MAX_RETRIES} attempts: ${errorMsg}` 
          };
        }
      }
      
      // Handle rate limiting
      if (uploadResponse.status === 429) {
        const retryAfter = uploadResponse.headers.get('Retry-After') || '60';
        return { 
          success: false, 
          error: `Rate limited. Retry after ${retryAfter} seconds` 
        };
      }
      
      // Handle file too large
      if (errorData.message && errorData.message.includes('too large')) {
        logger.warn(`Large file detected: ${file.path}`);
        return { 
          success: false, 
          error: `File too large: ${file.path}. Consider using Git LFS for files over 100MB` 
        };
      }
      
      // Handle permission issues
      if (uploadResponse.status === 403 || errorData.message?.includes('Resource not accessible')) {
        return { 
          success: false, 
          error: 'GitHub token lacks necessary permissions. Ensure your Personal Access Token has "repo" scope and can access this repository' 
        };
      }
      
      // For other errors, don't retry
      return { success: false, error: errorMsg };
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      
      if (attempts < MAX_RETRIES) {
        logger.warn(`Upload error for ${filePath}, retrying attempt ${attempts + 1}/${MAX_RETRIES}: ${errorMsg}`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
        continue;
      } else {
        return { success: false, error: `Upload failed after ${MAX_RETRIES} attempts: ${errorMsg}` };
      }
    }
  }
  
  return { success: false, error: `Upload failed after ${MAX_RETRIES} attempts` };
}

/**
 * Validate GitHub repository access
 */
export async function validateGitHubRepo(
  repoFullName: string,
  accessToken: string
): Promise<{ valid: boolean; error?: string; repoData?: any }> {
  try {
    const [owner, repo] = repoFullName.split('/');
    if (!owner || !repo) {
      return { valid: false, error: 'Invalid repository format. Expected: owner/repo' };
    }
    
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        'Authorization': `token ${accessToken}`,
        'User-Agent': 'TelegramManager-GitHubSync',
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        return { valid: false, error: 'Repository not found or not accessible' };
      }
      
      if (response.status === 403) {
        return { valid: false, error: 'Permission denied. Check repository access rights' };
      }
      
      const errorData = await response.json().catch(() => ({}));
      return { 
        valid: false, 
        error: errorData.message || `HTTP ${response.status}: ${response.statusText}` 
      };
    }
    
    const repoData = await response.json();
    
    // Check if we have push access
    if (!repoData.permissions?.push) {
      return { valid: false, error: 'No push access to repository' };
    }
    
    return { valid: true, repoData };
    
  } catch (error) {
    return { 
      valid: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Get GitHub API rate limit status
 */
export async function getGitHubRateLimit(accessToken: string): Promise<{
  limit: number;
  remaining: number;
  reset: number;
  used: number;
}> {
  try {
    const response = await fetch('https://api.github.com/rate_limit', {
      headers: {
        'Authorization': `token ${accessToken}`,
        'User-Agent': 'TelegramManager-GitHubSync'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get rate limit: ${response.status}`);
    }
    
    const data = await response.json();
    return data.rate;
    
  } catch (error) {
    logger.error(`Failed to get GitHub rate limit: ${error instanceof Error ? error.message : String(error)}`);
    // Return conservative defaults
    return {
      limit: 5000,
      remaining: 1000,
      reset: Date.now() + 3600000,
      used: 4000
    };
  }
}