import { promises as fs } from 'fs';
import path from 'path';
import type { ReplitFile, ReplitProject } from './server/utils/replit-fetcher';

// GitHub repository from the URL provided
const GITHUB_REPO = 'Shakti-coding/PythonWeb';

// Files and directories to ignore (only those that can be rebuilt)
const IGNORE_PATTERNS = [
  'node_modules',
  'dist',
  '.DS_Store',
  'server/public',
  '.git',
  '*.tar.gz',
  'vite.config.ts.*'
];

/**
 * Check if a file should be ignored based on patterns
 */
function shouldIgnore(filePath: string): boolean {
  for (const pattern of IGNORE_PATTERNS) {
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      if (regex.test(filePath)) return true;
    } else {
      if (filePath.includes(pattern)) return true;
    }
  }
  return false;
}

/**
 * Check if a file should be treated as binary
 */
function isBinaryFile(filename: string): boolean {
  const binaryExtensions = [
    '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.webp',
    '.mp4', '.mov', '.avi', '.mkv', '.mp3', '.wav', '.ogg',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.zip', '.tar', '.gz', '.rar', '.7z',
    '.exe', '.dll', '.so', '.dylib',
    '.woff', '.woff2', '.ttf', '.otf', '.eot',
    '.db', '.sqlite', '.sqlite3'
  ];
  
  const ext = path.extname(filename).toLowerCase();
  return binaryExtensions.includes(ext);
}

/**
 * Get GitHub access token from the Replit integration
 */
async function getGitHubToken(): Promise<string> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('Replit token not found');
  }

  const response = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  );

  const data = await response.json();
  const connection = data.items?.[0];
  
  const accessToken = connection?.settings?.access_token || connection?.settings?.oauth?.credentials?.access_token;

  if (!accessToken) {
    throw new Error('GitHub not connected or access token not found');
  }
  
  return accessToken;
}

/**
 * Delete all files in the repository
 */
async function clearRepository(owner: string, repo: string, accessToken: string): Promise<void> {
  console.log('🗑️ Clearing repository contents...');
  
  try {
    // Get all files in the repository
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents`, {
      headers: {
        'Authorization': `token ${accessToken}`,
        'User-Agent': 'TelegramManager-GitHubSync',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      console.log('Repository appears to be empty or error getting contents');
      return;
    }

    const contents = await response.json();
    
    if (Array.isArray(contents)) {
      // Delete each file/directory
      for (const item of contents) {
        if (item.type === 'file') {
          await deleteFile(owner, repo, item.path, item.sha, accessToken);
        }
      }
    }
  } catch (error) {
    console.log('Note: Repository may already be empty or inaccessible');
  }
}

/**
 * Delete a single file
 */
async function deleteFile(owner: string, repo: string, filePath: string, sha: string, accessToken: string): Promise<void> {
  try {
    const encodedPath = filePath.split('/').map(component => encodeURIComponent(component)).join('/');
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `token ${accessToken}`,
        'User-Agent': 'TelegramManager-GitHubSync',
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({
        message: `Delete ${filePath} for complete replacement`,
        sha: sha,
        branch: 'main'
      })
    });

    if (response.ok) {
      console.log(`🗑️ Deleted: ${filePath}`);
    } else {
      console.log(`⚠️ Could not delete: ${filePath}`);
    }
  } catch (error) {
    console.log(`⚠️ Error deleting ${filePath}:`, error);
  }
}

/**
 * Upload a single file without SHA checks (force create)
 */
async function forceUploadFile(
  file: ReplitFile,
  owner: string,
  repo: string,
  accessToken: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const filePath = file.path.startsWith('/') ? file.path.slice(1) : file.path;
    const encodedPath = filePath.split('/').map(component => encodeURIComponent(component)).join('/');
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;
    
    // Prepare file content encoding
    let base64Content: string;
    if (file.encoding === 'base64') {
      base64Content = file.content;
    } else {
      base64Content = Buffer.from(file.content, 'utf8').toString('base64');
    }

    const uploadData = {
      message: `Force upload: ${filePath}`,
      content: base64Content,
      branch: 'main'
    };
    
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
      return { success: true };
    }
    
    const errorData = await uploadResponse.json().catch(() => ({}));
    const errorMsg = errorData.message || `HTTP ${uploadResponse.status}: ${uploadResponse.statusText}`;
    return { success: false, error: errorMsg };
    
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Read all project files
 */
async function readProjectFiles(dir: string = '.', relativePath: string = ''): Promise<ReplitFile[]> {
  const files: ReplitFile[] = [];
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      
      if (shouldIgnore(relPath) || entry.name.startsWith('.')) {
        continue;
      }
      
      if (entry.isDirectory()) {
        const subFiles = await readProjectFiles(fullPath, relPath);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        try {
          const stats = await fs.stat(fullPath);
          
          if (stats.size > 100 * 1024 * 1024) {
            console.log(`Skipping large file: ${relPath} (${Math.round(stats.size / 1024 / 1024)}MB)`);
            continue;
          }
          
          const isBinary = isBinaryFile(entry.name);
          let content: string;
          
          if (isBinary) {
            const buffer = await fs.readFile(fullPath);
            content = buffer.toString('base64');
          } else {
            content = await fs.readFile(fullPath, 'utf8');
          }
          
          files.push({
            path: relPath,
            content,
            encoding: isBinary ? 'base64' : 'utf8',
            type: 'file',
            size: stats.size
          });
        } catch (error) {
          console.warn(`Error reading file ${relPath}:`, error);
        }
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error);
  }
  
  return files;
}

/**
 * Main function to force replace all files
 */
async function forceReplaceRepo() {
  try {
    const [owner, repo] = GITHUB_REPO.split('/');
    
    console.log('🔑 Getting GitHub access token...');
    const accessToken = await getGitHubToken();
    
    console.log('🔍 Reading project files...');
    const files = await readProjectFiles();
    
    console.log(`📁 Found ${files.length} files to upload`);
    
    // Clear the repository first
    await clearRepository(owner, repo, accessToken);
    
    // Wait a bit for deletions to complete
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('📤 Starting fresh upload...');
    
    let uploaded = 0;
    let failed = 0;
    
    // Upload files in batches
    const BATCH_SIZE = 3;
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      
      await Promise.all(batch.map(async (file) => {
        const result = await forceUploadFile(file, owner, repo, accessToken);
        
        if (result.success) {
          uploaded++;
          console.log(`✅ Uploaded: ${file.path}`);
        } else {
          failed++;
          console.log(`❌ Failed: ${file.path} - ${result.error}`);
        }
      }));
      
      // Small delay between batches
      if (i + BATCH_SIZE < files.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      const percent = Math.round(((i + batch.length) / files.length) * 100);
      console.log(`📤 Progress: ${percent}% (${i + batch.length}/${files.length})`);
    }
    
    console.log(`🎉 Complete! Uploaded: ${uploaded}, Failed: ${failed}`);
    console.log(`🔗 Repository: https://github.com/${GITHUB_REPO}`);
    
  } catch (error) {
    console.error('❌ Force replace failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  forceReplaceRepo();
}