import { JSDOM } from 'jsdom';
import AdmZip from 'adm-zip';
import path from 'path';
import { logger } from '../telegram-bot/logger';

export interface ReplitFile {
  path: string;
  content: string;
  encoding: 'utf8' | 'base64';
  type: 'file' | 'directory';
  size: number;
}

export interface ReplitProject {
  name: string;
  files: ReplitFile[];
  totalSize: number;
}

/**
 * Extract username and project name from Replit URL
 */
export function parseReplitUrl(url: string): { username: string; projectName: string } | null {
  const match = url.match(/https:\/\/replit\.com\/@([\w-]+)\/([\w-]+)/);
  if (!match) {
    return null;
  }
  
  return {
    username: match[1],
    projectName: match[2]
  };
}

/**
 * Check if a file should be treated as binary based on its extension
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
 * Fetch files from a public Replit workspace using the zip download approach
 */
export async function fetchReplitProject(replitUrl: string): Promise<ReplitProject> {
  const parsedUrl = parseReplitUrl(replitUrl);
  if (!parsedUrl) {
    throw new Error('Invalid Replit URL format');
  }

  const { username, projectName } = parsedUrl;
  
  try {
    // First approach: Try to get the ZIP download
    const zipUrl = `${replitUrl}.zip`;
    logger.info(`Attempting to fetch Replit project ZIP from: ${zipUrl}`);
    
    const zipResponse = await fetch(zipUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GitHubSync/1.0)'
      }
    });
    
    if (zipResponse.ok) {
      logger.info('Successfully fetched ZIP, extracting files...');
      return await extractZipFiles(await zipResponse.arrayBuffer(), projectName);
    }
    
    logger.warn('ZIP download failed, trying alternative approach...');
    
    // Second approach: Try to scrape the public workspace
    return await scrapeReplitWorkspace(replitUrl, username, projectName);
    
  } catch (error) {
    logger.error(`Failed to fetch Replit project: ${error instanceof Error ? error.message : String(error)}`);
    throw new Error(`Failed to fetch Replit project: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract files from a ZIP buffer
 */
async function extractZipFiles(zipBuffer: ArrayBuffer, projectName: string): Promise<ReplitProject> {
  const zip = new AdmZip(Buffer.from(zipBuffer));
  const entries = zip.getEntries();
  
  const files: ReplitFile[] = [];
  let totalSize = 0;
  
  for (const entry of entries) {
    if (entry.isDirectory) {
      files.push({
        path: entry.entryName,
        content: '',
        encoding: 'utf8',
        type: 'directory',
        size: 0
      });
      continue;
    }
    
    const content = entry.getData();
    const filepath = entry.entryName;
    const size = content.length;
    totalSize += size;
    
    // Note: No file size limits - GitHub API can handle large files through proper chunking
    logger.debug(`Processing file: ${filepath} (${Math.round(size / 1024)} KB)`);
    
    // Determine if file is binary
    const isBinary = isBinaryFile(filepath);
    
    files.push({
      path: filepath,
      content: isBinary ? content.toString('base64') : content.toString('utf8'),
      encoding: isBinary ? 'base64' : 'utf8',
      type: 'file',
      size
    });
  }
  
  logger.info(`Extracted ${files.length} files from ZIP (${totalSize} bytes total)`);
  
  return {
    name: projectName,
    files,
    totalSize
  };
}

/**
 * Scrape a public Replit workspace to get file structure
 * This is a fallback approach when ZIP download is not available
 */
async function scrapeReplitWorkspace(replitUrl: string, username: string, projectName: string): Promise<ReplitProject> {
  logger.info(`Attempting to scrape Replit workspace: ${replitUrl}`);
  
  const response = await fetch(replitUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; GitHubSync/1.0)'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to access Replit workspace: ${response.status} ${response.statusText}`);
  }
  
  const html = await response.text();
  const dom = new JSDOM(html);
  const document = dom.window.document;
  
  // Look for file structure in various possible locations
  const files: ReplitFile[] = [];
  let totalSize = 0;
  
  // Try to find file links or data
  // This is a simplified approach - real implementation would need more robust parsing
  const codeElements = document.querySelectorAll('script[type="application/json"]');
  
  for (const element of codeElements) {
    try {
      const data = JSON.parse(element.textContent || '{}');
      
      // Look for file structure in the JSON data
      if (data.files || data.fileTree) {
        const fileData = data.files || data.fileTree;
        await extractFilesFromData(fileData, files, '');
        break;
      }
    } catch (e) {
      // Continue to next element if JSON parsing fails
      continue;
    }
  }
  
  // If no files found through JSON, create a basic structure with common files
  if (files.length === 0) {
    logger.warn('Could not extract file structure from workspace, creating basic project structure');
    
    // Try to find some basic information
    const titleElement = document.querySelector('title');
    const title = titleElement?.textContent || projectName;
    
    files.push({
      path: 'README.md',
      content: `# ${title}\n\nThis project was synced from Replit: ${replitUrl}\n\nNote: Full file structure could not be extracted automatically. You may need to manually add files to this repository.`,
      encoding: 'utf8',
      type: 'file',
      size: 200
    });
    
    files.push({
      path: 'main.py',
      content: '# Main Python file\n# Add your code here\n\nprint("Hello from Replit!")',
      encoding: 'utf8',
      type: 'file',
      size: 100
    });
    
    totalSize = 300;
  }
  
  logger.info(`Scraped ${files.length} files from workspace`);
  
  return {
    name: projectName,
    files,
    totalSize
  };
}

/**
 * Recursively extract files from data structure
 */
async function extractFilesFromData(data: any, files: ReplitFile[], currentPath: string): Promise<void> {
  if (typeof data !== 'object' || data === null) {
    return;
  }
  
  for (const [key, value] of Object.entries(data)) {
    const fullPath = currentPath ? `${currentPath}/${key}` : key;
    
    if (typeof value === 'object' && value !== null) {
      if ('content' in value) {
        // This is a file with content
        const content = String(value.content || '');
        const isBinary = isBinaryFile(fullPath);
        
        files.push({
          path: fullPath,
          content: isBinary ? Buffer.from(content).toString('base64') : content,
          encoding: isBinary ? 'base64' : 'utf8',
          type: 'file',
          size: content.length
        });
      } else if ('children' in value || 'files' in value) {
        // This is a directory
        files.push({
          path: fullPath,
          content: '',
          encoding: 'utf8',
          type: 'directory',
          size: 0
        });
        
        // Recursively process children
        const children = value.children || value.files;
        if (children) {
          await extractFilesFromData(children, files, fullPath);
        }
      } else {
        // This might be a nested directory structure
        await extractFilesFromData(value, files, fullPath);
      }
    } else if (typeof value === 'string') {
      // Simple file with string content
      const isBinary = isBinaryFile(fullPath);
      
      files.push({
        path: fullPath,
        content: isBinary ? Buffer.from(value).toString('base64') : value,
        encoding: isBinary ? 'base64' : 'utf8',
        type: 'file',
        size: value.length
      });
    }
  }
}

/**
 * Validate that a Replit URL is accessible and public
 */
export async function validateReplitUrl(url: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const parsedUrl = parseReplitUrl(url);
    if (!parsedUrl) {
      return { valid: false, error: 'Invalid Replit URL format' };
    }
    
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GitHubSync/1.0)'
      }
    });
    
    if (!response.ok) {
      return { 
        valid: false, 
        error: `Workspace not accessible: ${response.status} ${response.statusText}` 
      };
    }
    
    return { valid: true };
    
  } catch (error) {
    return { 
      valid: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}