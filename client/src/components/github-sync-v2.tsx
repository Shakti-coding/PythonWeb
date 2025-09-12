import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Github,
  Upload,
  Loader2,
  CheckCircle,
  AlertCircle,
  User,
  ExternalLink,
  FolderOpen,
  FileText,
  Pause,
  Play,
  X
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface GitHubUser {
  login: string;
  name: string;
  avatar_url: string;
  public_repos: number;
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  description: string;
  html_url: string;
  updated_at: string;
}

interface FileItem {
  path: string;
  content: string | ArrayBuffer;
  size: number;
  type: string;
  isText: boolean;
}

interface SyncState {
  status: 'idle' | 'authenticating' | 'scanning' | 'uploading' | 'completed' | 'error' | 'paused';
  progress: number;
  filesProcessed: number;
  totalFiles: number;
  currentFile: string;
  errors: string[];
  canCancel: boolean;
  uploadedFiles: string[];
  skippedFiles: string[];
}

const CHUNK_SIZE = 3; // Process 3 files at a time to prevent rate limiting
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB per file
const RETRY_ATTEMPTS = 5;
const RETRY_DELAY = 1000;

export function GitHubSyncV2() {
  const [pat, setPat] = useState('');
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>('');
  const [newRepoName, setNewRepoName] = useState('');
  const [syncState, setSyncState] = useState<SyncState>({
    status: 'idle',
    progress: 0,
    filesProcessed: 0,
    totalFiles: 0,
    currentFile: '',
    errors: [],
    canCancel: false,
    uploadedFiles: [],
    skippedFiles: []
  });

  const [files, setFiles] = useState<FileItem[]>([]);
  const abortController = useRef<AbortController | null>(null);
  const { toast } = useToast();

  // Authentication
  const authenticateWithGitHub = async (token: string) => {
    setSyncState(prev => ({ ...prev, status: 'authenticating' }));
    
    try {
      const response = await fetch('/api/github/user', {
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Invalid GitHub token');
      }

      const data = await response.json();
      setUser(data.user);
      setPat(token);
      
      // Fetch repositories
      await fetchRepositories(token);
      
      setSyncState(prev => ({ ...prev, status: 'idle' }));
      toast({
        title: 'Authentication successful',
        description: `Welcome ${data.user.name || data.user.login}!`,
      });
    } catch (error) {
      setSyncState(prev => ({ 
        ...prev, 
        status: 'error',
        errors: [error instanceof Error ? error.message : 'Authentication failed']
      }));
      toast({
        title: 'Authentication failed',
        description: error instanceof Error ? error.message : 'Please check your token',
        variant: 'destructive',
      });
    }
  };

  const fetchRepositories = async (token: string) => {
    try {
      const response = await fetch('/api/github/repos', {
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setRepos(data.repos || []);
      }
    } catch (error) {
      console.error('Failed to fetch repositories:', error);
    }
  };

  // Memory-efficient file processing - process files one by one
  const processFilesOneByOne = async (): Promise<void> => {
    setSyncState(prev => ({ ...prev, status: 'scanning', currentFile: 'Selecting project files...' }));
    
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.webkitdirectory = true;
      input.multiple = true;

      input.onchange = async (event) => {
        const target = event.target as HTMLInputElement;
        if (!target.files) {
          reject(new Error('No files selected'));
          return;
        }

        const fileArray = Array.from(target.files);
        
        setSyncState(prev => ({ 
          ...prev, 
          status: 'uploading',
          canCancel: true,
          totalFiles: fileArray.length,
          filesProcessed: 0
        }));

        abortController.current = new AbortController();
        const uploaded: string[] = [];
        const errors: string[] = [];
        const skipped: string[] = [];

        try {
          // Process files one by one to minimize memory usage
          for (let i = 0; i < fileArray.length; i++) {
            if (abortController.current.signal.aborted) {
              setSyncState(prev => ({ ...prev, status: 'paused' }));
              return;
            }

            const file = fileArray[i];
            const filePath = file.webkitRelativePath || file.name;
            
            // Skip large files
            if (file.size > MAX_FILE_SIZE) {
              skipped.push(`${filePath} (too large: ${Math.round(file.size / 1024 / 1024)}MB)`);
              continue;
            }

            setSyncState(prev => ({ 
              ...prev,
              currentFile: filePath,
              filesProcessed: i + 1,
              progress: Math.round(((i + 1) / fileArray.length) * 100)
            }));

            try {
              await processAndUploadSingleFile(file, selectedRepo, pat);
              uploaded.push(filePath);
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : 'Upload failed';
              errors.push(`${filePath}: ${errorMsg}`);
            }

            // Small delay between files to prevent overwhelming
            await new Promise(resolve => setTimeout(resolve, 50));
          }

          setSyncState(prev => ({
            ...prev,
            status: 'completed',
            canCancel: false,
            uploadedFiles: uploaded,
            errors,
            skippedFiles: skipped,
            progress: 100,
            filesProcessed: fileArray.length
          }));

          toast({
            title: 'Sync completed!',
            description: `${uploaded.length} files uploaded successfully`,
          });

          resolve();
        } catch (error) {
          setSyncState(prev => ({
            ...prev,
            status: 'error',
            errors: [...errors, error instanceof Error ? error.message : 'Sync failed']
          }));
          reject(error);
        }
      };

      input.onerror = () => reject(new Error('File selection cancelled'));
      input.click();
    });
  };

  // Process and upload a single file without storing in memory
  const processAndUploadSingleFile = async (file: File, repoFullName: string, token: string): Promise<void> => {
    const isText = await isTextFile(file);
    let content: string | ArrayBuffer;

    if (isText && file.size < 1024 * 1024) { // 1MB limit for text files
      content = await readFileAsText(file);
    } else {
      content = await readFileAsArrayBuffer(file);
    }

    const fileItem: FileItem = {
      path: file.webkitRelativePath || file.name,
      content,
      size: file.size,
      type: file.type || 'application/octet-stream',
      isText,
    };

    await uploadSingleFileWithRetry(fileItem, repoFullName, token);
  };

  // Helper functions
  const isTextFile = (file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      const textExtensions = ['.txt', '.md', '.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.json', '.xml', '.yaml', '.yml', '.py', '.java', '.cpp', '.c', '.h', '.php', '.rb', '.go', '.rs'];
      const extension = '.' + file.name.split('.').pop()?.toLowerCase();
      
      if (textExtensions.includes(extension) || file.type.startsWith('text/')) {
        resolve(true);
        return;
      }

      // Sample the file to check if it's text
      const reader = new FileReader();
      const blob = file.slice(0, 1024); // Check first 1KB
      
      reader.onload = () => {
        const text = reader.result as string;
        const isAscii = /^[\x00-\x7F]*$/.test(text);
        resolve(isAscii && !text.includes('\0'));
      };
      
      reader.onerror = () => resolve(false);
      reader.readAsText(blob);
    });
  };

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  };

  const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  // Legacy upload function - removed in favor of memory-efficient processFilesOneByOne

  const uploadSingleFileWithRetry = async (file: FileItem, repoFullName: string, token: string) => {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
      try {
        await uploadSingleFile(file, repoFullName, token);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Upload failed');
        
        // Check if it's a rate limit error (403) or server error (5xx)
        const errorMessage = lastError.message.toLowerCase();
        const isRateLimit = errorMessage.includes('403') || errorMessage.includes('rate limit');
        const isServerError = errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503');
        
        // Don't retry on certain errors (400, 401, 404)
        const shouldNotRetry = errorMessage.includes('400') || errorMessage.includes('401') || errorMessage.includes('404');
        
        if (shouldNotRetry) {
          throw lastError;
        }
        
        if (attempt < RETRY_ATTEMPTS) {
          // Exponential backoff with jitter
          let delay = RETRY_DELAY * Math.pow(2, attempt - 1);
          
          // Special handling for rate limits - longer delay
          if (isRateLimit) {
            delay = Math.max(delay, 60000); // At least 1 minute for rate limits
          }
          
          // Add jitter to prevent thundering herd
          const jitter = Math.random() * 1000;
          delay += jitter;
          
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  };

  // Helper function for safe base64 conversion using FileReader
  const arrayBufferToBase64 = (buffer: ArrayBuffer): Promise<string> => {
    return new Promise((resolve, reject) => {
      const blob = new Blob([buffer]);
      const reader = new FileReader();
      
      reader.onload = () => {
        const dataUrl = reader.result as string;
        // Remove data URL prefix (data:application/octet-stream;base64,)
        const base64 = dataUrl.split(',')[1];
        resolve(base64);
      };
      
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Helper function to properly encode file paths for GitHub API
  const encodeGitHubPath = (path: string): string => {
    return path.split('/').map(part => encodeURIComponent(part)).join('/');
  };

  // Check if file exists and get SHA for updates
  const getFileInfo = async (filePath: string, repoFullName: string, token: string) => {
    const [owner, repo] = repoFullName.split('/');
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeGitHubPath(filePath)}`;

    try {
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': 'Bearer ' + token,
          'User-Agent': 'TelegramManager-GitHubSync-V2',
        },
      });

      if (response.ok) {
        const data = await response.json();
        return { exists: true, sha: data.sha };
      }
      return { exists: false, sha: null };
    } catch (error) {
      return { exists: false, sha: null };
    }
  };

  const uploadSingleFile = async (file: FileItem, repoFullName: string, token: string) => {
    const [owner, repo] = repoFullName.split('/');
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeGitHubPath(file.path)}`;

    // Check if file exists to get SHA for updates
    const fileInfo = await getFileInfo(file.path, repoFullName, token);

    let content: string;
    if (file.isText && typeof file.content === 'string') {
      content = btoa(unescape(encodeURIComponent(file.content)));
    } else {
      content = await arrayBufferToBase64(file.content as ArrayBuffer);
    }

    const requestBody: any = {
      message: fileInfo.exists ? `Update ${file.path}` : `Add ${file.path}`,
      content,
      branch: 'main',
    };

    // Include SHA for updates
    if (fileInfo.exists && fileInfo.sha) {
      requestBody.sha = fileInfo.sha;
    }

    const response = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'User-Agent': 'TelegramManager-GitHubSync-V2',
      },
      body: JSON.stringify(requestBody),
      signal: abortController.current?.signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `HTTP ${response.status}`);
    }
  };

  // Create new repository
  const createRepository = async () => {
    if (!newRepoName.trim()) {
      toast({
        title: 'Repository name required',
        description: 'Please enter a name for the new repository',
        variant: 'destructive',
      });
      return;
    }

    try {
      const response = await fetch('/api/github/repos', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + pat,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newRepoName,
          private: false,
          description: `Created via Telegram Manager - ${new Date().toISOString()}`,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        await fetchRepositories(pat);
        setSelectedRepo(data.repo.full_name);
        setNewRepoName('');
        
        toast({
          title: 'Repository created!',
          description: `${data.repo.full_name} has been created successfully`,
        });
      } else {
        throw new Error('Failed to create repository');
      }
    } catch (error) {
      toast({
        title: 'Creation failed',
        description: error instanceof Error ? error.message : 'Failed to create repository',
        variant: 'destructive',
      });
    }
  };

  // Start sync process with memory-efficient approach
  const handleStartSync = async () => {
    if (!selectedRepo) {
      toast({
        title: 'Select repository',
        description: 'Please select a repository to sync to',
        variant: 'destructive',
      });
      return;
    }

    try {
      await processFilesOneByOne();
    } catch (error) {
      setSyncState(prev => ({
        ...prev,
        status: 'error',
        errors: [error instanceof Error ? error.message : 'Sync failed']
      }));
    }
  };

  const handleCancel = () => {
    if (abortController.current) {
      abortController.current.abort();
    }
    setSyncState(prev => ({ ...prev, status: 'idle', canCancel: false }));
  };

  const handleReset = () => {
    setSyncState({
      status: 'idle',
      progress: 0,
      filesProcessed: 0,
      totalFiles: 0,
      currentFile: '',
      errors: [],
      canCancel: false,
      uploadedFiles: [],
      skippedFiles: []
    });
    setFiles([]);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Github className="w-5 h-5" />
            <span>GitHub Sync V2</span>
            <Badge variant="outline">Enhanced</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!user ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="github-pat">GitHub Personal Access Token</Label>
                <Input
                  id="github-pat"
                  type="password"
                  placeholder="ghp_..."
                  value={pat}
                  onChange={(e) => setPat(e.target.value)}
                  data-testid="input-github-pat"
                />
              </div>
              <Button 
                onClick={() => authenticateWithGitHub(pat)} 
                disabled={!pat || syncState.status === 'authenticating'}
                className="w-full"
                data-testid="button-authenticate"
              >
                {syncState.status === 'authenticating' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Connect to GitHub
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <img 
                    src={user.avatar_url} 
                    alt={user.login} 
                    className="w-8 h-8 rounded-full"
                  />
                  <div>
                    <p className="font-medium">{user.name || user.login}</p>
                    <p className="text-sm text-muted-foreground">{user.public_repos} repositories</p>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setUser(null);
                    setPat('');
                    setRepos([]);
                    setSelectedRepo('');
                    handleReset();
                  }}
                  data-testid="button-logout"
                >
                  Sign Out
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Select Repository</Label>
                  <Select value={selectedRepo} onValueChange={setSelectedRepo}>
                    <SelectTrigger data-testid="select-repository">
                      <SelectValue placeholder="Choose repository..." />
                    </SelectTrigger>
                    <SelectContent>
                      {repos.map((repo) => (
                        <SelectItem key={repo.id} value={repo.full_name}>
                          {repo.name}
                          {repo.private && <Badge variant="secondary" className="ml-2">Private</Badge>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Or Create New Repository</Label>
                  <div className="flex space-x-2">
                    <Input
                      placeholder="repository-name"
                      value={newRepoName}
                      onChange={(e) => setNewRepoName(e.target.value)}
                      data-testid="input-new-repo-name"
                    />
                    <Button 
                      onClick={createRepository} 
                      disabled={!newRepoName.trim()}
                      size="sm"
                      data-testid="button-create-repo"
                    >
                      Create
                    </Button>
                  </div>
                </div>
              </div>

              {syncState.status !== 'idle' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between text-lg">
                      <span>Sync Progress</span>
                      {syncState.canCancel && (
                        <Button variant="destructive" size="sm" onClick={handleCancel}>
                          <X className="w-4 h-4 mr-1" />
                          Cancel
                        </Button>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>{syncState.status.charAt(0).toUpperCase() + syncState.status.slice(1)}</span>
                        <span>{syncState.filesProcessed} / {syncState.totalFiles}</span>
                      </div>
                      <Progress value={syncState.progress} />
                    </div>

                    {syncState.currentFile && (
                      <p className="text-sm text-muted-foreground truncate">
                        {syncState.currentFile}
                      </p>
                    )}

                    {syncState.errors.length > 0 && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          {syncState.errors.length} error(s) occurred. First error: {syncState.errors[0]}
                        </AlertDescription>
                      </Alert>
                    )}

                    {syncState.status === 'completed' && (
                      <Alert>
                        <CheckCircle className="h-4 w-4" />
                        <AlertDescription>
                          Sync completed! {syncState.uploadedFiles.length} files uploaded successfully.
                          {syncState.skippedFiles.length > 0 && ` ${syncState.skippedFiles.length} files skipped.`}
                        </AlertDescription>
                      </Alert>
                    )}

                    {(syncState.status === 'completed' || syncState.status === 'error') && (
                      <div className="flex space-x-2">
                        <Button onClick={handleReset} variant="outline" size="sm">
                          Reset
                        </Button>
                        {selectedRepo && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => window.open(`https://github.com/${selectedRepo}`, '_blank')}
                          >
                            <ExternalLink className="w-4 h-4 mr-1" />
                            View Repository
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {syncState.status === 'idle' && (
                <Button 
                  onClick={handleStartSync} 
                  disabled={!selectedRepo}
                  className="w-full"
                  data-testid="button-start-sync"
                >
                  <FolderOpen className="mr-2 h-4 w-4" />
                  Select Project Folder & Start Sync
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}