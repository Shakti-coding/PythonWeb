import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Github,
  Link,
  Upload,
  Loader2,
  CheckCircle,
  AlertCircle,
  User,
  GitFork,
  ExternalLink,
  LogOut,
  Plus,
  Code,
  Terminal,
  FileText,
  Folder,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

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

interface SyncProgress {
  status: 'idle' | 'fetching' | 'uploading' | 'completed' | 'error';
  message: string;
  progress: number;
  filesProcessed: number;
  totalFiles: number;
  errors: string[];
  currentFile?: string;
  canCancel?: boolean;
}

// File size constants (in bytes) - Increased for better large file support
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB per file
const MAX_TOTAL_SIZE = 5 * 1024 * 1024 * 1024; // 5GB total
const CHUNK_SIZE = 50 * 1024 * 1024; // 50MB chunks for processing

// Utility functions for file processing
const validateFiles = (files: File[]): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  // Check individual file sizes
  const oversizedFiles = files.filter(file => file.size > MAX_FILE_SIZE);
  if (oversizedFiles.length > 0) {
    errors.push(`${oversizedFiles.length} files exceed 500MB limit: ${oversizedFiles.map(f => f.name).join(', ')}`);
  }
  
  // Check total size
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  if (totalSize > MAX_TOTAL_SIZE) {
    errors.push(`Total size ${Math.round(totalSize / (1024 * 1024))}MB exceeds 5GB limit`);
  }
  
  return { valid: errors.length === 0, errors };
};

const processFileChunked = async (file: File): Promise<{path: string, content: string, encoding: string}> => {
  const path = file.webkitRelativePath || file.name;
  const MAX_MEMORY_SIZE = 50 * 1024 * 1024; // 50MB max in memory at once
  
  // Check if file is likely binary based on extension or MIME type
  const isBinary = file.type.startsWith('image/') || 
                 file.type.startsWith('video/') || 
                 file.type.startsWith('audio/') || 
                 file.type.startsWith('application/') ||
                 Boolean(file.name.match(/\.(jpg|jpeg|png|gif|bmp|ico|svg|pdf|zip|tar|gz|exe|bin|dll|so|woff|woff2|ttf|otf)$/i));
  
  // For very large files, read in chunks to prevent memory overflow
  if (file.size > MAX_MEMORY_SIZE) {
    return processLargeFileInChunks(file, path, isBinary);
  }
  
  // For smaller files, use the original method but with better error handling
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      try {
        const result = reader.result;
        
        if (isBinary && typeof result === 'string') {
          // For binary files, use base64 encoding and remove data URL prefix
          const base64Content = result.includes(',') ? result.split(',')[1] : result;
          resolve({
            path,
            content: base64Content,
            encoding: 'base64'
          });
        } else {
          // For text files, use utf8 encoding
          resolve({
            path,
            content: result?.toString() || '',
            encoding: 'utf8'
          });
        }
      } catch (error) {
        reject(new Error(`Failed to process file content: ${file.name} - ${error}`));
      }
    };
    
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    
    reader.onabort = () => reject(new Error(`File reading aborted: ${file.name}`));
    
    try {
      if (isBinary) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file, 'utf-8');
      }
    } catch (error) {
      reject(new Error(`Failed to start reading file: ${file.name} - ${error}`));
    }
  });
};

// New function to handle large files by reading them in chunks
const processLargeFileInChunks = async (
  file: File, 
  path: string, 
  isBinary: boolean
): Promise<{path: string, content: string, encoding: string}> => {
  const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks
  const chunks: string[] = [];
  let offset = 0;
  
  while (offset < file.size) {
    const chunk = file.slice(offset, offset + CHUNK_SIZE);
    
    try {
      const chunkContent = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = () => {
          const result = reader.result;
          if (isBinary && typeof result === 'string') {
            // For binary chunks, extract base64 content
            const base64Content = result.includes(',') ? result.split(',')[1] : result;
            resolve(base64Content);
          } else {
            resolve(result?.toString() || '');
          }
        };
        
        reader.onerror = () => reject(new Error(`Failed to read chunk at offset ${offset}`));
        
        if (isBinary) {
          reader.readAsDataURL(chunk);
        } else {
          reader.readAsText(chunk, 'utf-8');
        }
      });
      
      chunks.push(chunkContent);
      offset += CHUNK_SIZE;
      
      // Add small delay and memory cleanup between chunks
      if (chunks.length % 5 === 0) { // Every 5 chunks (50MB)
        await new Promise(resolve => setTimeout(resolve, 50));
        if (typeof (window as any).gc === 'function') {
          (window as any).gc();
        }
      }
      
    } catch (error) {
      throw new Error(`Failed to process large file ${file.name}: ${error}`);
    }
  }
  
  // Combine all chunks
  const content = chunks.join('');
  
  // Clear chunks array to free memory
  chunks.length = 0;
  
  return {
    path,
    content,
    encoding: isBinary ? 'base64' : 'utf8'
  };
};

const processFilesInBatches = async (
  files: File[], 
  batchSize: number = 1, // Process one file at a time for maximum stability
  onProgress?: (processed: number, total: number, currentFile: string) => void
): Promise<{path: string, content: string, encoding: string}[]> => {
  const results: {path: string, content: string, encoding: string}[] = [];
  
  // Sort files by size to process smaller files first
  const sortedFiles = [...files].sort((a, b) => a.size - b.size);
  
  for (let i = 0; i < sortedFiles.length; i++) {
    const file = sortedFiles[i];
    onProgress?.(i, sortedFiles.length, file.name);
    
    try {
      console.log(`Processing file ${i + 1}/${sortedFiles.length}: ${file.name} (${Math.round(file.size / 1024 / 1024 * 100) / 100}MB)`);
      
      const result = await processFileChunked(file);
      results.push(result);
      
      // Aggressive memory management after each file
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Force garbage collection if available
      if (typeof (window as any).gc === 'function') {
        (window as any).gc();
      }
      
      // For very large files, add extra delay
      if (file.size > 100 * 1024 * 1024) { // > 100MB
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
    } catch (error) {
      console.error(`Failed to process file ${file.name}:`, error);
      throw new Error(`Failed to process file ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  return results;
};

interface GitHubSettings {
  id: number;
  userId: string;
  personalAccessToken: string;
  isDefault: boolean;
  updatedAt: Date;
}

export function GitHubSync() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedRepo, setSelectedRepo] = useState('');
  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoPrivate, setNewRepoPrivate] = useState(false);
  const [targetPath, setTargetPath] = useState('');
  const [activeTab, setActiveTab] = useState('nodejs');
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({
    status: 'idle',
    message: '',
    progress: 0,
    filesProcessed: 0,
    totalFiles: 0,
    errors: [],
  });

  // PAT settings state
  const [personalAccessToken, setPersonalAccessToken] = useState('');
  const [showPATSettings, setShowPATSettings] = useState(false);
  const [isTestingPAT, setIsTestingPAT] = useState(false);
  
  // Cancel functionality state
  const [cancelController, setCancelController] = useState<AbortController | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Check GitHub authentication status using PAT
  const { data: githubUser, isLoading: userLoading, error: userError } = useQuery<GitHubUser>({
    queryKey: ['github-user'],
    queryFn: async () => {
      const headers: HeadersInit = {};
      
      // Add custom PAT if available
      if (personalAccessToken && personalAccessToken.trim()) {
        headers['X-GitHub-PAT'] = personalAccessToken.trim();
      }
      
      const response = await fetch('/api/github/user', { headers });
      if (!response.ok) {
        throw new Error('Not authenticated');
      }
      return response.json().then(data => data.user);
    },
    retry: false,
  });

  // Fetch user repositories
  const { data: repos = [], isLoading: reposLoading } = useQuery<GitHubRepo[]>({
    queryKey: ['github-repos'],
    queryFn: async () => {
      const headers: HeadersInit = {};
      
      // Add custom PAT if available
      if (personalAccessToken && personalAccessToken.trim()) {
        headers['X-GitHub-PAT'] = personalAccessToken.trim();
      }
      
      const response = await fetch('/api/github/repos', { headers });
      if (!response.ok) {
        throw new Error('Failed to fetch repositories');
      }
      return response.json().then(data => data.repos);
    },
    enabled: !!githubUser,
  });

  // Fetch GitHub PAT settings
  const { data: githubSettingsData, isLoading: settingsLoading } = useQuery({
    queryKey: ['github-settings'],
    queryFn: async () => {
      const response = await fetch('/api/github/settings');
      if (!response.ok) {
        throw new Error('Failed to fetch GitHub settings');
      }
      return response.json();
    },
  });

  // Load PAT settings into state when fetched
  useEffect(() => {
    if (githubSettingsData) {
      const settings = githubSettingsData.settings;
      if (settings) {
        setPersonalAccessToken(settings.personalAccessToken || '');
      }
    }
  }, [githubSettingsData]);

  // Test GitHub PAT
  const testPATMutation = useMutation({
    mutationFn: async (pat: string) => {
      const response = await apiRequest('POST', '/api/github/test-pat', { personalAccessToken: pat });
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'PAT validated',
        description: `Connected as ${data.user.login}`,
      });
      // Update GitHub user data
      queryClient.setQueryData(['github-user'], data.user);
      queryClient.invalidateQueries({ queryKey: ['github-repos'] });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Invalid PAT',
        description: error instanceof Error ? error.message : 'Failed to validate Personal Access Token',
      });
    },
  });

  // GitHub logout
  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/github/logout');
      return await response.json();
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['github-user'] });
      queryClient.removeQueries({ queryKey: ['github-repos'] });
      toast({
        title: 'Logged out',
        description: 'Successfully logged out from GitHub',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Logout failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  // Create new repository
  const createRepoMutation = useMutation({
    mutationFn: async (repoData: { name: string; private: boolean }) => {
      const response = await apiRequest('POST', '/api/github/repos', repoData);
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['github-repos'] });
      setSelectedRepo(data.repo.full_name);
      toast({
        title: 'Repository created',
        description: `Successfully created ${data.repo.full_name}`,
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to create repository',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  // Upload files to GitHub (Node.js method)
  const syncMutation = useMutation({
    mutationFn: async (syncData: { files: {path: string, content: string, encoding: string}[]; repoFullName: string; targetPath?: string }) => {
      const response = await apiRequest('POST', '/api/github/sync', syncData);
      return await response.json();
    },
    onSuccess: () => {
      setCancelController(null);
      setSyncProgress({
        status: 'completed',
        message: 'Sync completed successfully!',
        progress: 100,
        filesProcessed: syncProgress.totalFiles,
        totalFiles: syncProgress.totalFiles,
        errors: [],
        canCancel: false
      });
      toast({
        title: 'Sync completed',
        description: 'Successfully synced workspace to GitHub',
      });
    },
    onError: (error) => {
      setCancelController(null);
      setSyncProgress(prev => ({
        ...prev,
        status: 'error',
        message: error instanceof Error ? error.message : 'Sync failed',
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        canCancel: false
      }));
      toast({
        variant: 'destructive',
        title: 'Sync failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  // Python sync mutation
  const pythonSyncMutation = useMutation({
    mutationFn: async (syncData: { files: {path: string, content: string, encoding: string}[]; repoFullName: string; targetPath?: string }) => {
      const response = await apiRequest('POST', '/api/github/python-sync', syncData);
      return await response.json();
    },
    onSuccess: (data) => {
      setCancelController(null);
      setSyncProgress({
        status: 'completed',
        message: 'Python sync completed successfully!',
        progress: 100,
        filesProcessed: data.filesProcessed || 0,
        totalFiles: data.totalFiles || 0,
        errors: data.errors || [],
        canCancel: false
      });
      toast({
        title: 'Python sync completed',
        description: 'Successfully executed Python script and uploaded to GitHub',
      });
    },
    onError: (error) => {
      setCancelController(null);
      setSyncProgress(prev => ({
        ...prev,
        status: 'error',
        message: error instanceof Error ? error.message : 'Python sync failed',
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        canCancel: false
      }));
      toast({
        variant: 'destructive',
        title: 'Python sync failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  // Save GitHub PAT settings
  const savePATMutation = useMutation({
    mutationFn: async (settingsData: { personalAccessToken: string }) => {
      const response = await apiRequest('POST', '/api/github/settings', settingsData);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['github-settings'] });
      queryClient.invalidateQueries({ queryKey: ['github-user'] });
      queryClient.invalidateQueries({ queryKey: ['github-repos'] });
      toast({
        title: 'Settings saved',
        description: 'Personal Access Token updated successfully',
      });
      setShowPATSettings(false);
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to save settings',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const handleCreateNewRepo = () => {
    if (!newRepoName.trim()) {
      toast({
        variant: 'destructive',
        title: 'Invalid input',
        description: 'Repository name is required',
      });
      return;
    }

    createRepoMutation.mutate({
      name: newRepoName.trim(),
      private: newRepoPrivate,
    });
  };

  const handleSavePATSettings = () => {
    if (!personalAccessToken.trim()) {
      toast({
        variant: 'destructive',
        title: 'Invalid input',
        description: 'Personal Access Token is required',
      });
      return;
    }

    savePATMutation.mutate({
      personalAccessToken: personalAccessToken.trim(),
    });
  };

  const handleTestPAT = () => {
    if (!personalAccessToken.trim()) {
      toast({
        variant: 'destructive',
        title: 'Invalid input',
        description: 'Personal Access Token is required',
      });
      return;
    }

    testPATMutation.mutate(personalAccessToken.trim());
  };

  const handleCancelSync = () => {
    if (cancelController) {
      setIsCancelling(true);
      cancelController.abort();
      setSyncProgress(prev => ({
        ...prev,
        status: 'error',
        message: 'Upload cancelled by user',
        canCancel: false
      }));
      setCancelController(null);
      toast({
        title: 'Upload cancelled',
        description: 'The sync process has been cancelled',
      });
    }
  };

  const handlePythonSync = async () => {
    if (selectedFiles.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No files selected',
        description: 'Please select files or folders to upload using Python',
      });
      return;
    }

    if (!selectedRepo && !newRepoName.trim()) {
      toast({
        variant: 'destructive',
        title: 'Invalid input',
        description: 'Please select a repository or create a new one',
      });
      return;
    }

    // Validate files before processing (Python can handle larger files)
    const validation = validateFiles(selectedFiles.map(file => ({
      ...file,
      size: Math.min(file.size, MAX_FILE_SIZE * 10) // Python allows 10x larger files
    })));
    if (!validation.valid) {
      toast({
        variant: 'destructive',
        title: 'File validation failed',
        description: validation.errors.join('. '),
      });
      return;
    }

    let targetRepo = selectedRepo;

    // If creating new repo, do that first
    if (selectedRepo === 'create-new' && newRepoName.trim()) {
      createRepoMutation.mutate({
        name: newRepoName.trim(),
        private: newRepoPrivate,
      });
      targetRepo = `${githubUser?.login}/${newRepoName.trim()}`;
    }

    if (!targetRepo) return;

    // Create abort controller for cancellation
    const controller = new AbortController();
    setCancelController(controller);
    setIsCancelling(false);

    setSyncProgress({
      status: 'uploading',
      message: 'Processing files with Python backend...',
      progress: 0,
      filesProcessed: 0,
      totalFiles: selectedFiles.length,
      errors: [],
      canCancel: true,
      currentFile: 'Initializing Python sync...'
    });

    try {
      // Process files one by one for Python sync to prevent crashes
      const filesData = await processFilesInBatches(
        selectedFiles,
        1, // Always process one file at a time
        (processed, total, currentFile) => {
          if (controller.signal.aborted) {
            throw new Error('Upload cancelled');
          }
          
          setSyncProgress(prev => ({
            ...prev,
            message: `Processing files for Python... (${processed + 1}/${total})`,
            progress: Math.round(((processed + 1) / total) * 50), // First 50% for processing
            currentFile,
            filesProcessed: processed + 1
          }));
        }
      );

      if (controller.signal.aborted) {
        return;
      }

      setSyncProgress(prev => ({
        ...prev,
        message: 'Executing Python script...',
        progress: 50,
        currentFile: 'Running Python upload script...'
      }));

      pythonSyncMutation.mutate({
        files: filesData,
        repoFullName: targetRepo,
        targetPath: targetPath.trim(),
      });
      
    } catch (error) {
      if (error instanceof Error && error.message === 'Upload cancelled') {
        return; // Already handled in cancel function
      }
      
      toast({
        variant: 'destructive',
        title: 'File processing failed',
        description: error instanceof Error ? error.message : 'Failed to process files',
      });
      setSyncProgress(prev => ({
        ...prev,
        status: 'error',
        message: 'Failed to process files',
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        canCancel: false
      }));
    }
  };

  const handleChunkedUpload = async (
    filesData: {path: string, content: string, encoding: string}[],
    targetRepo: string,
    targetPath: string,
    controller: AbortController
  ) => {
    const CHUNK_SIZE = 2; // Files per chunk - very conservative for stability
    const chunks = [];
    
    // Split files into chunks
    for (let i = 0; i < filesData.length; i += CHUNK_SIZE) {
      chunks.push(filesData.slice(i, i + CHUNK_SIZE));
    }
    
    let totalFilesUploaded = 0;
    let totalErrors: string[] = [];
    
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      if (controller.signal.aborted) {
        throw new Error('Upload cancelled');
      }
      
      const chunk = chunks[chunkIndex];
      
      setSyncProgress(prev => ({
        ...prev,
        message: `Uploading chunk ${chunkIndex + 1} of ${chunks.length}...`,
        progress: 50 + Math.round((chunkIndex / chunks.length) * 50), // 50-100% for upload
        currentFile: `Chunk ${chunkIndex + 1}: ${chunk.length} files`
      }));
      
      try {
        const response = await fetch('/api/github/sync-chunked', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            files: chunk,
            repoFullName: targetRepo,
            targetPath,
            chunkIndex,
            totalChunks: chunks.length
          })
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || `Chunk ${chunkIndex + 1} failed`);
        }
        
        const result = await response.json();
        totalFilesUploaded += result.filesUploaded || 0;
        if (result.errors) {
          totalErrors.push(...result.errors);
        }
        
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        totalErrors.push(`Chunk ${chunkIndex + 1}: ${errorMsg}`);
      }
    }
    
    // Final update
    setCancelController(null);
    setSyncProgress({
      status: totalErrors.length === 0 ? 'completed' : 'error',
      message: totalErrors.length === 0 ? 'All chunks uploaded successfully!' : `Upload completed with errors`,
      progress: 100,
      filesProcessed: totalFilesUploaded,
      totalFiles: filesData.length,
      errors: totalErrors,
      canCancel: false
    });
    
    if (totalErrors.length === 0) {
      toast({
        title: 'Chunked sync completed',
        description: `Successfully uploaded ${totalFilesUploaded} files in ${chunks.length} chunks`,
      });
    } else {
      toast({
        variant: 'destructive',
        title: 'Sync completed with errors',
        description: `${totalFilesUploaded} files uploaded, ${totalErrors.length} errors occurred`,
      });
    }
  };

  const handleSync = async () => {
    if (selectedFiles.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No files selected',
        description: 'Please select files or folders to upload',
      });
      return;
    }

    if (!selectedRepo && !newRepoName.trim()) {
      toast({
        variant: 'destructive',
        title: 'Invalid input',
        description: 'Please select a repository or create a new one',
      });
      return;
    }

    // Validate files before processing
    const validation = validateFiles(selectedFiles);
    if (!validation.valid) {
      toast({
        variant: 'destructive',
        title: 'File validation failed',
        description: validation.errors.join('. '),
      });
      return;
    }

    let targetRepo = selectedRepo;

    // If creating new repo, do that first
    if (selectedRepo === 'create-new' && newRepoName.trim()) {
      createRepoMutation.mutate({
        name: newRepoName.trim(),
        private: newRepoPrivate,
      });
      targetRepo = `${githubUser?.login}/${newRepoName.trim()}`;
    }

    if (!targetRepo) return;

    // Create abort controller for cancellation
    const controller = new AbortController();
    setCancelController(controller);
    setIsCancelling(false);

    setSyncProgress({
      status: 'uploading',
      message: 'Processing files for upload...',
      progress: 0,
      filesProcessed: 0,
      totalFiles: selectedFiles.length,
      errors: [],
      canCancel: true,
      currentFile: 'Initializing...'
    });

    try {
      // Process files sequentially to prevent browser crashes
      const filesData = await processFilesInBatches(
        selectedFiles,
        1, // Process one file at a time for maximum stability
        (processed, total, currentFile) => {
          if (controller.signal.aborted) {
            throw new Error('Upload cancelled');
          }
          
          setSyncProgress(prev => ({
            ...prev,
            message: `Processing files... (${processed + 1}/${total})`,
            progress: Math.round(((processed + 1) / total) * 50), // First 50% for processing
            currentFile,
            filesProcessed: processed + 1
          }));
        }
      );

      if (controller.signal.aborted) {
        return;
      }

      setSyncProgress(prev => ({
        ...prev,
        message: 'Uploading to GitHub...',
        progress: 50,
        currentFile: 'Starting upload...'
      }));

      // Use chunked upload for large file sets to prevent timeouts and memory issues
      const shouldUseChunkedUpload = filesData.length > 2 || filesData.some(f => f.content.length > 1024 * 1024); // > 1MB content
      
      if (shouldUseChunkedUpload) {
        await handleChunkedUpload(filesData, targetRepo, targetPath.trim(), controller);
      } else {
        syncMutation.mutate({
          files: filesData,
          repoFullName: targetRepo,
          targetPath: targetPath.trim(),
        });
      }
      
    } catch (error) {
      if (error instanceof Error && error.message === 'Upload cancelled') {
        return; // Already handled in cancel function
      }
      
      toast({
        variant: 'destructive',
        title: 'File processing failed',
        description: error instanceof Error ? error.message : 'Failed to process files',
      });
      setSyncProgress(prev => ({
        ...prev,
        status: 'error',
        message: 'Failed to process files',
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        canCancel: false
      }));
    }
  };

  const isAuthenticated = !!githubUser && !userError;

  // Not authenticated view
  if (!isAuthenticated) {
    return (
      <div className="h-full overflow-y-auto p-6">
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-2">GitHub Sync</h2>
          <p className="text-muted-foreground">
            Upload files and folders to your GitHub repositories
          </p>
        </div>

        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center space-x-2">
              <Github className="w-6 h-6" />
              <span>GitHub Authentication</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center text-muted-foreground text-sm">
              <p>Enter your GitHub Personal Access Token to connect to your repositories. A default token is available if you don't have one.</p>
            </div>
            
            <div>
              <Label htmlFor="auth-pat-token" className="text-sm font-medium mb-2 block">
                Personal Access Token (Optional)
              </Label>
              <Input
                id="auth-pat-token"
                type="password"
                placeholder="github_pat_... or ghp_... (leave empty for default)"
                value={personalAccessToken}
                onChange={(e) => setPersonalAccessToken(e.target.value)}
                data-testid="input-auth-pat-token"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Leave empty to use the default token, or enter your own PAT for custom access
              </p>
            </div>

            <div className="flex space-x-2">
              <Button
                onClick={handleTestPAT}
                disabled={testPATMutation.isPending || !personalAccessToken.trim()}
                variant="outline"
                className="flex-1"
                data-testid="button-auth-test-pat"
              >
                {testPATMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="mr-2 h-4 w-4" />
                )}
                Test Token
              </Button>

              <Button
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ['github-user'] });
                  queryClient.invalidateQueries({ queryKey: ['github-repos'] });
                }}
                disabled={userLoading}
                className="flex-1"
                data-testid="button-auth-try-default"
              >
                {userLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Github className="mr-2 h-4 w-4" />
                )}
                Try Default
              </Button>
            </div>

            <div className="text-center text-xs text-muted-foreground bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
              <p className="font-medium text-blue-700 dark:text-blue-300">Default Authentication Available</p>
              <p className="mt-1">Click "Try Default" to use the provided GitHub token, or enter your own PAT above for custom access.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Authenticated view
  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2">GitHub Sync</h2>
            <p className="text-muted-foreground">
              Upload files and folders to your GitHub repositories
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            data-testid="button-github-logout"
          >
            {logoutMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="mr-2 h-4 w-4" />
            )}
            Logout
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* Account Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <User className="w-5 h-5" />
              <span>GitHub Account</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-3">
              <img 
                src={githubUser.avatar_url} 
                alt={githubUser.name} 
                className="w-12 h-12 rounded-full"
              />
              <div>
                <p className="font-medium">{githubUser.name || githubUser.login}</p>
                <p className="text-sm text-muted-foreground">@{githubUser.login}</p>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Public repositories</span>
              <Badge variant="secondary">
                <GitFork className="w-3 h-3 mr-1" />
                {githubUser.public_repos}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Sync Configuration with Tabs */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Upload className="w-5 h-5" />
              <span>Sync Configuration</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="nodejs" className="flex items-center space-x-2">
                  <Code className="w-4 h-4" />
                  <span>Node.js Upload</span>
                </TabsTrigger>
                <TabsTrigger value="python" className="flex items-center space-x-2">
                  <Terminal className="w-4 h-4" />
                  <span>Python Script</span>
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="nodejs" className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">Select Files or Folders</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <input
                    type="file"
                    multiple
                    onChange={(e) => {
                      if (e.target.files) {
                        setSelectedFiles(Array.from(e.target.files));
                      }
                    }}
                    className="hidden"
                    id="nodejs-file-input"
                    data-testid="input-nodejs-files"
                    accept="*/*"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById('nodejs-file-input')?.click()}
                    className="w-full h-20 border-dashed"
                    data-testid="button-nodejs-select-files"
                  >
                    <div className="flex flex-col items-center space-y-2">
                      <FileText className="w-6 h-6" />
                      <span className="text-sm">Select Files</span>
                    </div>
                  </Button>
                </div>
                
                <div>
                  <input
                    type="file"
                    {...({ webkitdirectory: "" } as any)}
                    multiple
                    onChange={(e) => {
                      if (e.target.files) {
                        setSelectedFiles(Array.from(e.target.files));
                      }
                    }}
                    className="hidden"
                    id="nodejs-folder-input"
                    data-testid="input-nodejs-folder"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById('nodejs-folder-input')?.click()}
                    className="w-full h-20 border-dashed"
                    data-testid="button-nodejs-select-folder"
                  >
                    <div className="flex flex-col items-center space-y-2">
                      <Folder className="w-6 h-6" />
                      <span className="text-sm">Select Folder</span>
                    </div>
                  </Button>
                </div>
              </div>
              
              {selectedFiles.length > 0 && (
                <div className="mt-3 p-3 bg-muted rounded-lg">
                  <p className="text-sm font-medium mb-2">Selected files ({selectedFiles.length}):</p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {selectedFiles.slice(0, 10).map((file, index) => (
                      <div key={index} className="text-xs text-muted-foreground flex items-center">
                        <FileText className="w-3 h-3 mr-1" />
                        {file.webkitRelativePath || file.name} ({Math.round(file.size / 1024)} KB)
                      </div>
                    ))}
                    {selectedFiles.length > 10 && (
                      <div className="text-xs text-muted-foreground">... and {selectedFiles.length - 10} more files</div>
                    )}
                  </div>
                  
                  {/* File size warnings */}
                  <div className="mt-2 text-xs">
                    {selectedFiles.some(f => f.size > MAX_FILE_SIZE) && (
                      <div className="text-amber-600 dark:text-amber-400 mb-1">
                        ⚠️ Some files exceed 500MB - they may fail to upload
                      </div>
                    )}
                    {selectedFiles.reduce((sum, f) => sum + f.size, 0) > MAX_TOTAL_SIZE && (
                      <div className="text-red-600 dark:text-red-400 mb-1">
                        🚫 Total size exceeds 5GB limit - upload will fail
                      </div>
                    )}
                    {selectedFiles.length > 20 && (
                      <div className="text-blue-600 dark:text-blue-400">
                        📦 Large file count - will use chunked upload for better reliability
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center space-x-2 mb-2">
                <Upload className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-medium text-blue-700 dark:text-blue-300">Node.js Upload Limits</h3>
              </div>
              <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                <li>• Max file size: 500MB per file</li>
                <li>• Max total size: 5GB per upload</li>
                <li>• Large uploads use chunked processing for stability</li>
                <li>• Browser-based processing - optimized for large files</li>
              </ul>
            </div>

            <div>
              <Label htmlFor="target-path" className="text-sm font-medium mb-2 block">
                Target Folder in Repository (Optional)
              </Label>
              <Input
                id="target-path"
                placeholder="e.g., src/components, docs, etc. (leave empty for root)"
                value={targetPath}
                onChange={(e) => setTargetPath(e.target.value)}
                data-testid="input-target-path"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Specify where in the repository to upload your files. Leave empty to upload to the root.
              </p>
            </div>

            <div>
              <Label className="text-sm font-medium mb-2 block">Target Repository</Label>
              <Select value={selectedRepo} onValueChange={setSelectedRepo} data-testid="select-target-repo">
                <SelectTrigger>
                  <SelectValue placeholder="Select a repository" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="create-new">
                    <div className="flex items-center space-x-2">
                      <Plus className="w-4 h-4" />
                      <span>Create new repository</span>
                    </div>
                  </SelectItem>
                  {repos.map((repo) => (
                    <SelectItem key={repo.id} value={repo.full_name}>
                      <div className="flex items-center justify-between w-full">
                        <span>{repo.name}</span>
                        {repo.private && (
                          <Badge variant="secondary" className="ml-2 text-xs">Private</Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedRepo === 'create-new' && (
              <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                <div>
                  <Label htmlFor="new-repo-name" className="text-sm font-medium mb-1 block">
                    New Repository Name
                  </Label>
                  <Input
                    id="new-repo-name"
                    placeholder="my-replit-project"
                    value={newRepoName}
                    onChange={(e) => setNewRepoName(e.target.value)}
                    data-testid="input-new-repo-name"
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <Label htmlFor="new-repo-private" className="text-sm font-medium">
                    Private Repository
                  </Label>
                  <Switch
                    id="new-repo-private"
                    checked={newRepoPrivate}
                    onCheckedChange={setNewRepoPrivate}
                    data-testid="switch-new-repo-private"
                  />
                </div>
              </div>
            )}

            <Separator />

                <Button
                  onClick={handleSync}
                  disabled={syncMutation.isPending || createRepoMutation.isPending || selectedFiles.length === 0}
                  className="w-full"
                  size="lg"
                  data-testid="button-start-upload"
                >
                  {(syncMutation.isPending || createRepoMutation.isPending) ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  Upload Files
                </Button>
              </TabsContent>

              <TabsContent value="python" className="space-y-4">
                <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
                  <div className="flex items-center space-x-2 mb-2">
                    <Terminal className="w-5 h-5 text-green-600" />
                    <h3 className="font-medium text-green-700 dark:text-green-300">Python-Powered Upload</h3>
                  </div>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    Upload files and folders using Python backend. No size limits - handle projects of any size (1GB+). 
                    Uses advanced chunking and Git LFS for large files automatically.
                  </p>
                </div>

                <div>
                  <Label className="text-sm font-medium mb-2 block">Select Files or Folders</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <input
                        type="file"
                        multiple
                        onChange={(e) => {
                          if (e.target.files) {
                            setSelectedFiles(Array.from(e.target.files));
                          }
                        }}
                        className="hidden"
                        id="python-file-input"
                        data-testid="input-python-files"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => document.getElementById('python-file-input')?.click()}
                        className="w-full h-20 border-dashed"
                        data-testid="button-python-select-files"
                      >
                        <div className="flex flex-col items-center space-y-2">
                          <FileText className="w-6 h-6" />
                          <span className="text-sm">Select Files</span>
                        </div>
                      </Button>
                    </div>
                    
                    <div>
                      <input
                        type="file"
                        {...({ webkitdirectory: "" } as any)}
                        multiple
                        onChange={(e) => {
                          if (e.target.files) {
                            setSelectedFiles(Array.from(e.target.files));
                          }
                        }}
                        className="hidden"
                        id="python-folder-input"
                        data-testid="input-python-folder"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => document.getElementById('python-folder-input')?.click()}
                        className="w-full h-20 border-dashed"
                        data-testid="button-python-select-folder"
                      >
                        <div className="flex flex-col items-center space-y-2">
                          <Folder className="w-6 h-6" />
                          <span className="text-sm">Select Folder</span>
                        </div>
                      </Button>
                    </div>
                  </div>
                  
                  {selectedFiles.length > 0 && (
                    <div className="mt-3 p-3 bg-muted rounded-lg">
                      <p className="text-sm font-medium mb-2">Selected files ({selectedFiles.length}):</p>
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {selectedFiles.slice(0, 10).map((file, index) => (
                          <div key={index} className="text-xs text-muted-foreground flex items-center">
                            <FileText className="w-3 h-3 mr-1" />
                            {file.webkitRelativePath || file.name} ({Math.round(file.size / 1024)} KB)
                          </div>
                        ))}
                        {selectedFiles.length > 10 && (
                          <div className="text-xs text-muted-foreground">... and {selectedFiles.length - 10} more files</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <Label htmlFor="target-path-python" className="text-sm font-medium mb-2 block">
                    Target Folder in Repository (Optional)
                  </Label>
                  <Input
                    id="target-path-python"
                    placeholder="e.g., src/components, docs, etc. (leave empty for root)"
                    value={targetPath}
                    onChange={(e) => setTargetPath(e.target.value)}
                    data-testid="input-target-path-python"
                  />
                </div>

                <div>
                  <Label className="text-sm font-medium mb-2 block">Target Repository</Label>
                  <Select value={selectedRepo} onValueChange={setSelectedRepo} data-testid="select-target-repo-python">
                    <SelectTrigger>
                      <SelectValue placeholder="Select a repository" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="create-new">
                        <div className="flex items-center space-x-2">
                          <Plus className="w-4 h-4" />
                          <span>Create new repository</span>
                        </div>
                      </SelectItem>
                      {repos.map((repo) => (
                        <SelectItem key={repo.id} value={repo.full_name}>
                          <div className="flex items-center justify-between w-full">
                            <span>{repo.name}</span>
                            {repo.private && (
                              <Badge variant="secondary" className="ml-2 text-xs">Private</Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedRepo === 'create-new' && (
                  <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                    <div>
                      <Label htmlFor="new-repo-name-python" className="text-sm font-medium mb-1 block">
                        New Repository Name
                      </Label>
                      <Input
                        id="new-repo-name-python"
                        placeholder="my-python-project"
                        value={newRepoName}
                        onChange={(e) => setNewRepoName(e.target.value)}
                        data-testid="input-new-repo-name-python"
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <Label htmlFor="new-repo-private-python" className="text-sm font-medium">
                        Private Repository
                      </Label>
                      <Switch
                        id="new-repo-private-python"
                        checked={newRepoPrivate}
                        onCheckedChange={setNewRepoPrivate}
                        data-testid="switch-new-repo-private-python"
                      />
                    </div>
                  </div>
                )}

                <Button
                  onClick={handlePythonSync}
                  disabled={pythonSyncMutation.isPending || createRepoMutation.isPending || selectedFiles.length === 0}
                  className="w-full"
                  size="lg"
                  data-testid="button-start-python-sync"
                >
                  {(pythonSyncMutation.isPending || createRepoMutation.isPending) ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Terminal className="mr-2 h-4 w-4" />
                  )}
                  Upload with Python
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* GitHub PAT Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Github className="w-5 h-5" />
                <span>GitHub Authentication</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPATSettings(!showPATSettings)}
                data-testid="button-toggle-pat-settings"
              >
                {showPATSettings ? 'Hide' : 'Configure'}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <p>Configure GitHub Personal Access Token for authentication. Default token is provided but you can add your own.</p>
            </div>

            {/* Current status */}
            {githubSettingsData && (
              <div className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                {githubSettingsData.isDefaultActive ? (
                  <p className="font-medium text-blue-700 dark:text-blue-300">
                    ✓ Using default GitHub token
                  </p>
                ) : (
                  <p className="font-medium text-green-700 dark:text-green-300">
                    ✓ Using custom Personal Access Token
                  </p>
                )}
              </div>
            )}

            {showPATSettings && (
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <div>
                  <Label htmlFor="pat-token" className="text-sm font-medium mb-2 block">
                    Personal Access Token
                  </Label>
                  <Input
                    id="pat-token"
                    type="password"
                    placeholder="github_pat_... or ghp_..."
                    value={personalAccessToken}
                    onChange={(e) => setPersonalAccessToken(e.target.value)}
                    data-testid="input-pat-token"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Enter your GitHub PAT with repo permissions, or leave empty to use default
                  </p>
                </div>

                <div className="flex space-x-2">
                  <Button
                    onClick={handleTestPAT}
                    disabled={testPATMutation.isPending || !personalAccessToken.trim()}
                    variant="outline"
                    className="flex-1"
                    data-testid="button-test-pat"
                  >
                    {testPATMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="mr-2 h-4 w-4" />
                    )}
                    Test Token
                  </Button>

                  <Button
                    onClick={handleSavePATSettings}
                    disabled={savePATMutation.isPending || !personalAccessToken.trim()}
                    className="flex-1"
                    data-testid="button-save-pat-settings"
                  >
                    {savePATMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Github className="mr-2 h-4 w-4" />
                    )}
                    Save Token
                  </Button>
                </div>

                <div className="text-xs text-muted-foreground bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg">
                  <p className="font-medium text-yellow-700 dark:text-yellow-300">How to create a GitHub PAT:</p>
                  <ol className="mt-2 space-y-1 list-decimal list-inside">
                    <li>Go to GitHub Settings → Developer settings → Personal access tokens</li>
                    <li>Generate new token (classic or fine-grained)</li>
                    <li>Select "repo" scope for repository access</li>
                    <li>Copy the token and paste it above</li>
                  </ol>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sync Progress */}
      {syncProgress.status !== 'idle' && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              {syncProgress.status === 'completed' && <CheckCircle className="w-5 h-5 text-green-600" />}
              {syncProgress.status === 'error' && <AlertCircle className="w-5 h-5 text-red-600" />}
              {(syncProgress.status === 'fetching' || syncProgress.status === 'uploading') && (
                <Loader2 className="w-5 h-5 animate-spin" />
              )}
              <span>Sync Progress</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between items-center text-sm mb-2">
                <span>{syncProgress.message}</span>
                <div className="flex items-center space-x-2">
                  <span>{Math.round(syncProgress.progress)}%</span>
                  {syncProgress.canCancel && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCancelSync}
                      disabled={isCancelling}
                      data-testid="button-cancel-sync"
                    >
                      {isCancelling ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        'Cancel'
                      )}
                    </Button>
                  )}
                </div>
              </div>
              <Progress value={syncProgress.progress} className="w-full" />
            </div>

            {syncProgress.currentFile && syncProgress.status === 'uploading' && (
              <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                <span className="font-medium">Current:</span> {syncProgress.currentFile}
              </div>
            )}

            {syncProgress.totalFiles > 0 && (
              <div className="text-sm text-muted-foreground">
                Processed {syncProgress.filesProcessed} of {syncProgress.totalFiles} files
              </div>
            )}

            {syncProgress.errors.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-red-600">Errors:</p>
                <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg space-y-1">
                  {syncProgress.errors.map((error, index) => (
                    <p key={index} className="text-xs text-red-700 dark:text-red-300">
                      {error}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {syncProgress.status === 'completed' && selectedRepo && (
              <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-green-700 dark:text-green-300">
                    Successfully synced to {selectedRepo}
                  </span>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => window.open(`https://github.com/${selectedRepo}`, '_blank')}
                  data-testid="button-view-repo"
                >
                  <ExternalLink className="w-3 h-3 mr-1" />
                  View Repo
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}