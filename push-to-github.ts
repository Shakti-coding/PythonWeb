import { promises as fs } from 'fs';
import path from 'path';
import { uploadToGitHub, validateGitHubRepo } from './server/utils/github-uploader';
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
 * Recursively read all files from the current directory
 */
async function readProjectFiles(dir: string = '.', relativePath: string = ''): Promise<ReplitFile[]> {
  const files: ReplitFile[] = [];
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      
      // Skip ignored files and directories
      if (shouldIgnore(relPath) || entry.name.startsWith('.')) {
        console.log(`Skipping: ${relPath}`);
        continue;
      }
      
      if (entry.isDirectory()) {
        // Add directory entry
        files.push({
          path: relPath,
          content: '',
          encoding: 'utf8',
          type: 'directory',
          size: 0
        });
        
        // Recursively process directory
        const subFiles = await readProjectFiles(fullPath, relPath);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        try {
          const stats = await fs.stat(fullPath);
          
          // Skip very large files (over 100MB)
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
          
          console.log(`Added: ${relPath} (${Math.round(stats.size / 1024)}KB)`);
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
 * Main function to push project to GitHub
 */
async function pushToGitHub() {
  try {
    console.log('🔍 Reading project files...');
    const files = await readProjectFiles();
    
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    
    const project: ReplitProject = {
      name: 'PythonWeb',
      files,
      totalSize
    };
    
    console.log(`📁 Found ${files.length} files (${Math.round(totalSize / 1024 / 1024)}MB total)`);
    
    console.log('🔑 Getting GitHub access token...');
    const accessToken = await getGitHubToken();
    
    console.log('✅ Validating GitHub repository access...');
    const validation = await validateGitHubRepo(GITHUB_REPO, accessToken);
    
    if (!validation.valid) {
      throw new Error(`GitHub repository validation failed: ${validation.error}`);
    }
    
    console.log(`📤 Starting upload to ${GITHUB_REPO}...`);
    
    const result = await uploadToGitHub(
      project,
      GITHUB_REPO,
      accessToken,
      (progress) => {
        const percent = Math.round((progress.filesProcessed / progress.totalFiles) * 100);
        console.log(`📤 Progress: ${percent}% (${progress.filesProcessed}/${progress.totalFiles}) - ${progress.currentFile || ''}`);
        
        if (progress.errors.length > 0) {
          console.log('❌ Recent errors:', progress.errors.slice(-3));
        }
      }
    );
    
    if (result.success) {
      console.log('🎉 Upload completed successfully!');
      console.log(`✅ Files uploaded: ${result.filesUploaded}`);
      console.log(`⏭️ Files skipped: ${result.filesSkipped}`);
      console.log(`🔗 Repository URL: ${result.repositoryUrl}`);
      
      if (result.errors.length > 0) {
        console.log('⚠️ Some files had errors:');
        result.errors.forEach(error => console.log(`  - ${error}`));
      }
    } else {
      console.log('❌ Upload failed');
      result.errors.forEach(error => console.log(`  - ${error}`));
    }
    
  } catch (error) {
    console.error('❌ Push to GitHub failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  pushToGitHub();
}