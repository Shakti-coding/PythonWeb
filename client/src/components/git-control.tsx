import { useState, useEffect } from 'react';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { 
  Github, 
  Settings, 
  Key, 
  Users, 
  Webhook, 
  GitPullRequest, 
  Activity,
  Plus,
  MoreHorizontal,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Clock,
  Database,
  Search,
  Filter,
  Download,
  Upload,
  Edit,
  Trash2,
  Copy,
  ExternalLink,
  GitBranch,
  FileText,
  Folder,
  FolderOpen,
  Star,
  GitFork,
  Eye,
  Lock,
  Unlock,
  Globe,
  Shield,
  Package,
  Zap,
  Code,
  Terminal,
  BookOpen,
  Users2,
  Mail,
  HelpCircle,
  ArrowLeft,
  Archive,
  Bell,
  Building,
  Fingerprint,
  Server,
  Network,
  GitCommit,
  Layers,
  Cloud,
  Box,
  Briefcase,
  MessageSquare,
  FileQuestion,
  Cpu,
  MonitorSpeaker
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

// Types for GitHub API responses
interface Repository {
  id: number;
  name: string;
  full_name: string;
  owner: { 
    login: string; 
    avatar_url: string;
    type: string;
  };
  private: boolean;
  description: string | null;
  default_branch: string;
  updated_at: string;
  created_at: string;
  pushed_at: string;
  html_url: string;
  clone_url: string;
  ssh_url: string;
  size: number;
  stargazers_count: number;
  watchers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  topics: string[];
  archived: boolean;
  disabled: boolean;
  has_issues: boolean;
  has_projects: boolean;
  has_wiki: boolean;
  has_pages: boolean;
  has_downloads: boolean;
  visibility: string;
}

interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  name: string;
  email: string;
  bio: string;
  location: string;
  blog: string;
  company: string;
  public_repos: number;
  public_gists: number;
  followers: number;
  following: number;
  created_at: string;
}

interface GitHubFile {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  git_url: string;
  download_url: string | null;
  type: 'file' | 'dir';
  content?: string;
  encoding?: string;
}

interface GitHubCommit {
  sha: string;
  commit: {
    author: {
      name: string;
      email: string;
      date: string;
    };
    committer: {
      name: string;
      email: string;
      date: string;
    };
    message: string;
  };
  author: {
    login: string;
    avatar_url: string;
  } | null;
  html_url: string;
}

interface GitHubBranch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
}

interface PATSettings {
  personalAccessToken?: string;
  hasDefaultPAT: boolean;
  isDefaultActive: boolean;
}

export default function GitControl() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State management
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [currentView, setCurrentView] = useState<'dashboard' | 'repo-detail'>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [showPATDialog, setShowPATDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState<Repository | null>(null);
  const [showCreateRepoDialog, setShowCreateRepoDialog] = useState(false);
  const [patForm, setPATForm] = useState({ pat: '' });
  const [repoForm, setRepoForm] = useState({
    name: '',
    description: '',
    private: false
  });
  const [currentPath, setCurrentPath] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [repoActiveTab, setRepoActiveTab] = useState('files');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    fileName: '',
    content: '',
    commitMessage: '',
    selectedFiles: null as FileList | null
  });

  // API Queries
  const { data: patSettings, isLoading: isLoadingPAT } = useQuery({
    queryKey: ['/api/github/settings'],
    refetchInterval: 30000,
  }) as { data: PATSettings | undefined; isLoading: boolean };

  const { data: userInfo } = useQuery({
    queryKey: ['/api/github/user'],
    enabled: !!patSettings?.hasDefaultPAT || !!patSettings?.personalAccessToken,
    refetchInterval: 60000,
  }) as { data: { user: GitHubUser } | undefined };

  const { data: repositoriesData, isLoading: isLoadingRepos, error: reposError } = useQuery({
    queryKey: ['/api/github/repos'],
    enabled: !!patSettings?.hasDefaultPAT || !!patSettings?.personalAccessToken,
    refetchInterval: 60000,
  }) as { data: { repos: Repository[] } | undefined; isLoading: boolean; error: any };

  const repositories = repositoriesData?.repos || [];

  // Repository detail queries
  const { data: repoFiles } = useQuery({
    queryKey: ['/api/git-control/repos', selectedRepo?.owner.login, selectedRepo?.name, 'contents', currentPath],
    enabled: !!selectedRepo && currentView === 'repo-detail',
  }) as { data: GitHubFile[] | undefined };

  const { data: repoCommitsData } = useQuery({
    queryKey: ['/api/git-control/repos', selectedRepo?.owner.login, selectedRepo?.name, 'commits'],
    enabled: !!selectedRepo && currentView === 'repo-detail',
  }) as { data: { commits?: GitHubCommit[] } | undefined };

  const repoCommits = repoCommitsData?.commits || [];

  const { data: repoBranches } = useQuery({
    queryKey: ['/api/git-control/repos', selectedRepo?.owner.login, selectedRepo?.name, 'branches'],
    enabled: !!selectedRepo && currentView === 'repo-detail',
  }) as { data: GitHubBranch[] | undefined };

  // Mutations
  const savePATMutation = useMutation({
    mutationFn: async (data: { personalAccessToken: string }) => 
      apiRequest('/api/github/settings', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/github/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/github/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/github/repos'] });
      setShowPATDialog(false);
      setPATForm({ pat: '' });
      toast({
        title: 'Success',
        description: 'GitHub Personal Access Token saved successfully',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || 'Failed to save PAT',
      });
    },
  });

  const createRepoMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; private?: boolean }) => 
      apiRequest('/api/github/repos', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/github/repos'] });
      setShowCreateRepoDialog(false);
      setRepoForm({ name: '', description: '', private: false });
      toast({
        title: 'Success',
        description: 'Repository created successfully',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || 'Failed to create repository',
      });
    },
  });

  const starRepoMutation = useMutation({
    mutationFn: async ({ owner, repo, starred }: { owner: string; repo: string; starred: boolean }) => {
      const method = starred ? 'DELETE' : 'PUT';
      return apiRequest(`/api/git-control/repos/${owner}/${repo}/star`, method);
    },
    onSuccess: (_, { starred }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/github/repos'] });
      toast({
        title: 'Success',
        description: starred ? 'Repository unstarred' : 'Repository starred',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || 'Failed to update star status',
      });
    },
  });

  const forkRepoMutation = useMutation({
    mutationFn: async ({ owner, repo }: { owner: string; repo: string }) =>
      apiRequest(`/api/git-control/repos/${owner}/${repo}/fork`, 'POST'),
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/github/repos'] });
      toast({
        title: 'Success',
        description: 'Repository forked successfully',
      });
      // The response should contain the forked repository data
      if (response?.html_url) {
        window.open(response.html_url, '_blank');
      }
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || 'Failed to fork repository',
      });
    },
  });

  const deleteRepoMutation = useMutation({
    mutationFn: async ({ owner, repo }: { owner: string; repo: string }) =>
      apiRequest(`/api/git-control/repos/${owner}/${repo}`, 'DELETE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/github/repos'] });
      setShowDeleteDialog(null);
      toast({
        title: 'Success',
        description: 'Repository deleted successfully',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || 'Failed to delete repository',
      });
    },
  });

  const uploadFileMutation = useMutation({
    mutationFn: async ({ owner, repo, path, content, message }: { 
      owner: string; 
      repo: string; 
      path: string; 
      content: string; 
      message: string; 
    }) => {
      const encodedPath = encodePath(path);
      const defaultBranch = selectedRepo?.default_branch || 'main';
      return apiRequest(`/api/git-control/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`, 'PUT', {
        message,
        content,
        branch: selectedBranch || defaultBranch
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ['/api/git-control/repos', selectedRepo?.owner.login, selectedRepo?.name, 'contents', currentPath] 
      });
      setShowUploadDialog(false);
      setUploadForm({ fileName: '', content: '', commitMessage: '', selectedFiles: null });
      toast({
        title: 'Success',
        description: 'File uploaded successfully',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || 'Failed to upload file',
      });
    },
  });

  // Helper functions
  const isBinaryFile = (file: File): boolean => {
    const textExtensions = [
      '.txt', '.md', '.js', '.ts', '.jsx', '.tsx', '.json', '.xml', '.html', '.css',
      '.scss', '.sass', '.less', '.yml', '.yaml', '.toml', '.ini', '.cfg', '.conf',
      '.py', '.rb', '.php', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.go',
      '.rs', '.sh', '.bat', '.ps1', '.sql', '.r', '.swift', '.kt', '.scala',
      '.clj', '.elm', '.ex', '.exs', '.fs', '.fsx', '.hs', '.jl', '.lua', '.pl',
      '.ps', '.r', '.rmd', '.tcl', '.vb', '.vim', '.zsh', '.fish'
    ];
    
    const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    return !textExtensions.includes(extension);
  };

  const readFileContent = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (isBinaryFile(file)) {
          // For binary files, convert to base64
          const base64 = (result as string).split(',')[1];
          resolve(base64);
        } else {
          // For text files, use as-is
          resolve(result as string);
        }
      };
      reader.onerror = reject;
      
      if (isBinaryFile(file)) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });
  };

  const encodePath = (path: string): string => {
    return path.split('/').map(segment => encodeURIComponent(segment)).join('/');
  };

  const handleFolderUpload = async (files: FileList) => {
    if (!selectedRepo) return;
    
    const fileArray = Array.from(files);
    let uploadCount = 0;
    let errorCount = 0;

    for (const file of fileArray) {
      try {
        const content = await readFileContent(file);

        // Use the file's webkitRelativePath to maintain folder structure
        const filePath = file.webkitRelativePath || file.name;
        
        await uploadFileMutation.mutateAsync({
          owner: selectedRepo.owner.login,
          repo: selectedRepo.name,
          path: filePath,
          content,
          message: `Upload folder: ${file.webkitRelativePath?.split('/')[0] || 'files'}`
        });
        
        uploadCount++;
      } catch (error) {
        console.error(`Error uploading ${file.name}:`, error);
        errorCount++;
      }
    }

    toast({
      title: uploadCount > 0 ? 'Success' : 'Error',
      description: `Uploaded ${uploadCount} files${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
      variant: errorCount > 0 && uploadCount === 0 ? 'destructive' : 'default'
    });
  };

  const handleFileAction = async (action: string, file: any) => {
    if (!selectedRepo) return;

    switch (action) {
      case 'download':
        window.open(file.download_url, '_blank');
        break;
      case 'copy':
        navigator.clipboard.writeText(file.html_url);
        toast({ title: 'Copied', description: 'File URL copied to clipboard' });
        break;
      case 'edit':
        window.open(file.html_url, '_blank');
        break;
      case 'delete':
        const confirmed = window.confirm(`Are you sure you want to delete "${file.name}"?`);
        if (confirmed) {
          try {
            await apiRequest(`/api/git-control/repos/${selectedRepo.owner.login}/${selectedRepo.name}/contents/${encodePath(currentPath ? `${currentPath}/${file.name}` : file.name)}`, 'DELETE', {
              message: `Delete ${file.name}`,
              sha: file.sha,
              branch: selectedBranch || selectedRepo.default_branch
            });
            
            // Refresh the file list
            queryClient.invalidateQueries({ 
              queryKey: ['/api/git-control/repos', selectedRepo.owner.login, selectedRepo.name, 'contents', currentPath] 
            });
            
            toast({
              title: 'Success',
              description: `File "${file.name}" deleted successfully`,
            });
          } catch (error: any) {
            toast({
              variant: 'destructive',
              title: 'Error',
              description: error.response?.data?.error || 'Failed to delete file',
            });
          }
        }
        break;
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 30) return `${Math.floor(diffDays / 30)}mo ago`;
    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    return 'Recently';
  };

  const handleFunctionalAction = async (action: string, repo: Repository) => {
    try {
      switch (action) {
        case 'packages':
          try {
            const packagesData = await apiRequest(`/api/github/repos/${repo.owner.login}/${repo.name}/packages`, 'GET') as unknown as any[];
            if (packagesData && packagesData.length > 0) {
              toast({ title: 'Packages', description: `Found ${packagesData.length} packages. Managing through interface.` });
              // Show packages in a dialog or interface here
            } else {
              toast({ title: 'Packages', description: 'No packages found for this repository.' });
            }
          } catch (error: any) {
            toast({ 
              variant: 'destructive',
              title: 'Error', 
              description: error.response?.data?.error || 'Failed to fetch packages' 
            });
          }
          break;
        case 'releases':
          try {
            const releasesData = await apiRequest(`/api/github/repos/${repo.owner.login}/${repo.name}/releases`, 'GET') as unknown as any[];
            if (releasesData && releasesData.length > 0) {
              toast({ title: 'Releases', description: `Found ${releasesData.length} releases. Managing through interface.` });
              // Show releases management interface here
            } else {
              toast({ title: 'Releases', description: 'No releases found. You can create a new release.' });
            }
          } catch (error: any) {
            toast({ 
              variant: 'destructive',
              title: 'Error', 
              description: error.response?.data?.error || 'Failed to fetch releases' 
            });
          }
          break;
        case 'deployments':
          try {
            const deploymentsData = await apiRequest(`/api/github/repos/${repo.owner.login}/${repo.name}/deployments`, 'GET') as unknown as any[];
            if (deploymentsData && deploymentsData.length > 0) {
              toast({ title: 'Deployments', description: `Found ${deploymentsData.length} deployments. Managing through interface.` });
            } else {
              toast({ title: 'Deployments', description: 'No deployments found for this repository.' });
            }
          } catch (error: any) {
            toast({ 
              variant: 'destructive',
              title: 'Error', 
              description: error.response?.data?.error || 'Failed to fetch deployments' 
            });
          }
          break;
        case 'environments':
          try {
            const environmentsData = await apiRequest(`/api/github/repos/${repo.owner.login}/${repo.name}/environments`, 'GET') as unknown as any[];
            if (environmentsData && environmentsData.length > 0) {
              toast({ title: 'Environments', description: `Found ${environmentsData.length} environments. Managing through interface.` });
            } else {
              toast({ title: 'Environments', description: 'No environments configured for this repository.' });
            }
          } catch (error: any) {
            toast({ 
              variant: 'destructive',
              title: 'Error', 
              description: error.response?.data?.error || 'Failed to fetch environments' 
            });
          }
          break;
        case 'discussions':
          try {
            const discussionsData = await apiRequest(`/api/github/repos/${repo.owner.login}/${repo.name}/discussions`, 'GET') as unknown as any[];
            if (discussionsData && discussionsData.length > 0) {
              toast({ title: 'Discussions', description: `Found ${discussionsData.length} discussions. Managing through interface.` });
            } else {
              toast({ title: 'Discussions', description: 'No discussions found. You can start a new discussion.' });
            }
          } catch (error: any) {
            toast({ 
              variant: 'destructive',
              title: 'Error', 
              description: error.response?.data?.error || 'Failed to fetch discussions' 
            });
          }
          break;
        case 'projects':
          try {
            const projectsData = await apiRequest(`/api/github/repos/${repo.owner.login}/${repo.name}/projects`, 'GET') as unknown as any[];
            if (projectsData && projectsData.length > 0) {
              toast({ title: 'Projects', description: `Found ${projectsData.length} projects. Managing through interface.` });
            } else {
              toast({ title: 'Projects', description: 'No projects found. You can create a new project.' });
            }
          } catch (error: any) {
            toast({ 
              variant: 'destructive',
              title: 'Error', 
              description: error.response?.data?.error || 'Failed to fetch projects' 
            });
          }
          break;
        case 'wiki':
          try {
            // Check if wiki exists and manage it through API
            toast({ title: 'Wiki', description: 'Wiki management through interface - feature in development' });
          } catch (error: any) {
            toast({ 
              variant: 'destructive',
              title: 'Error', 
              description: 'Failed to access wiki' 
            });
          }
          break;
        case 'notifications':
          try {
            const notificationsData = await apiRequest(`/api/github/notifications`, 'GET') as unknown as any[];
            if (notificationsData && notificationsData.length > 0) {
              toast({ title: 'Notifications', description: `You have ${notificationsData.length} notifications. Managing through interface.` });
            } else {
              toast({ title: 'Notifications', description: 'No new notifications.' });
            }
          } catch (error: any) {
            toast({ 
              variant: 'destructive',
              title: 'Error', 
              description: error.response?.data?.error || 'Failed to fetch notifications' 
            });
          }
          break;
        default:
          window.open(`${repo.html_url}/${action}`, '_blank');
      }
    } catch (error: any) {
      // Fallback to opening GitHub page if API call fails
      window.open(`${repo.html_url}/${action}`, '_blank');
      console.error(`Failed to get ${action} data:`, error);
    }
  };

  const handleArchiveRepo = async (repo: Repository) => {
    try {
      const confirmed = window.confirm(`Are you sure you want to archive the repository "${repo.name}"? This action cannot be undone.`);
      if (!confirmed) return;

      await apiRequest(`/api/github/repos/${repo.owner.login}/${repo.name}/archive`, 'POST');
      
      queryClient.invalidateQueries({ queryKey: ['/api/github/repos'] });
      toast({
        title: 'Success',
        description: `Repository "${repo.name}" has been archived successfully`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || 'Failed to archive repository',
      });
    }
  };

  const handleFolderUploadToNewRepo = async (files: FileList) => {
    try {
      const fileArray = Array.from(files);
      if (fileArray.length === 0) return;

      // Get the folder name from the first file's path
      const firstFile = fileArray[0];
      const folderName = firstFile.webkitRelativePath?.split('/')[0] || 'uploaded-folder';
      
      const repoName = prompt(`Enter repository name:`, folderName);
      if (!repoName) return;

      // Create the repository first
      const newRepoResponse = await apiRequest('/api/github/repos', 'POST', {
        name: repoName,
        description: `Repository created from folder upload: ${folderName}`,
        private: false
      }) as any;

      const newRepo = newRepoResponse.repo || newRepoResponse;
      if (!newRepo) {
        throw new Error('Failed to create repository');
      }

      // Upload all files to the new repository
      let uploadCount = 0;
      let errorCount = 0;

      for (const file of fileArray) {
        try {
          const content = await readFileContent(file);
          const filePath = file.webkitRelativePath || file.name;
          
          await uploadFileMutation.mutateAsync({
            owner: newRepo.owner.login,
            repo: newRepo.name,
            path: filePath,
            content,
            message: `Upload folder: ${folderName}`
          });
          
          uploadCount++;
        } catch (error) {
          console.error(`Error uploading ${file.name}:`, error);
          errorCount++;
        }
      }

      // Refresh the repositories list
      queryClient.invalidateQueries({ queryKey: ['/api/github/repos'] });

      toast({
        title: 'Success',
        description: `Created repository "${repoName}" with ${uploadCount} files${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
      });

    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || error.message || 'Failed to create repository',
      });
    }
  };

  const handleCreateRepoWithFiles = async (repoData: typeof repoForm, files: FileList) => {
    try {
      // Create the repository first
      const newRepoResponse = await apiRequest('/api/github/repos', 'POST', {
        name: repoData.name,
        description: repoData.description,
        private: repoData.private
      }) as any;

      const newRepo = newRepoResponse.repo || newRepoResponse;
      if (!newRepo) {
        throw new Error('Failed to create repository');
      }

      // Upload all files to the new repository
      let uploadCount = 0;
      let errorCount = 0;

      const fileArray = Array.from(files);
      for (const file of fileArray) {
        try {
          const content = await readFileContent(file);
          const filePath = file.webkitRelativePath || file.name;
          
          await uploadFileMutation.mutateAsync({
            owner: newRepo.owner.login,
            repo: newRepo.name,
            path: filePath,
            content,
            message: `Upload files during repository creation`
          });
          
          uploadCount++;
        } catch (error) {
          console.error(`Error uploading ${file.name}:`, error);
          errorCount++;
        }
      }

      // Close dialog and refresh
      setShowCreateRepoDialog(false);
      setRepoForm({ name: '', description: '', private: false });
      setUploadForm({ fileName: '', content: '', commitMessage: '', selectedFiles: null });
      queryClient.invalidateQueries({ queryKey: ['/api/github/repos'] });

      toast({
        title: 'Success',
        description: `Created repository "${repoData.name}" with ${uploadCount} files${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
      });

    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || error.message || 'Failed to create repository',
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const filteredRepos = repositories.filter((repo) =>
    repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    repo.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    repo.owner.login.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Repository Action Handlers
  const handleRepoAction = (action: string, repo: Repository) => {
    switch (action) {
      case 'view':
        setSelectedRepo(repo);
        setCurrentView('repo-detail');
        setCurrentPath('');
        setSelectedBranch(repo.default_branch);
        break;
      case 'clone':
        navigator.clipboard.writeText(repo.clone_url);
        toast({ title: 'Copied', description: 'Clone URL copied to clipboard' });
        break;
      case 'download':
        window.open(`${repo.html_url}/archive/refs/heads/${repo.default_branch}.zip`, '_blank');
        break;
      case 'fork':
        forkRepoMutation.mutate({ owner: repo.owner.login, repo: repo.name });
        break;
      case 'star':
        starRepoMutation.mutate({ 
          owner: repo.owner.login, 
          repo: repo.name, 
          starred: false // Assuming not starred for now, would need to check status
        });
        break;
      case 'settings':
        window.open(`${repo.html_url}/settings`, '_blank');
        break;
      case 'issues':
        window.open(`${repo.html_url}/issues`, '_blank');
        break;
      case 'pulls':
        window.open(`${repo.html_url}/pulls`, '_blank');
        break;
      case 'actions':
        window.open(`${repo.html_url}/actions`, '_blank');
        break;
      case 'security':
        window.open(`${repo.html_url}/security`, '_blank');
        break;
      case 'insights':
        window.open(`${repo.html_url}/pulse`, '_blank');
        break;
      case 'packages':
        handleFunctionalAction('packages', repo);
        break;
      case 'releases':
        handleFunctionalAction('releases', repo);
        break;
      case 'deployments':
        handleFunctionalAction('deployments', repo);
        break;
      case 'environments':
        handleFunctionalAction('environments', repo);
        break;
      case 'discussions':
        handleFunctionalAction('discussions', repo);
        break;
      case 'projects':
        handleFunctionalAction('projects', repo);
        break;
      case 'wiki':
        handleFunctionalAction('wiki', repo);
        break;
      case 'notifications':
        handleFunctionalAction('notifications', repo);
        break;
      case 'transfer':
        window.open(`${repo.html_url}/settings/options`, '_blank');
        break;
      case 'archive':
        handleArchiveRepo(repo);
        break;
      case 'delete':
        setShowDeleteDialog(repo);
        break;
      default:
        break;
    }
  };

  // File browser functions
  const handleFileClick = (file: GitHubFile) => {
    if (file.type === 'dir') {
      setCurrentPath(file.path);
    } else {
      // Handle file view/edit
      window.open(file.html_url, '_blank');
    }
  };

  const navigateUp = () => {
    const pathParts = currentPath.split('/');
    pathParts.pop();
    setCurrentPath(pathParts.join('/'));
  };

  if (currentView === 'repo-detail' && selectedRepo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800" data-testid="git-control-repo-detail">
        <div className="container mx-auto p-6 space-y-6">
          {/* Repository Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button 
                variant="outline" 
                onClick={() => setCurrentView('dashboard')}
                data-testid="button-back-to-dashboard"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
              <div className="flex items-center space-x-3">
                <img 
                  src={selectedRepo.owner.avatar_url} 
                  alt={selectedRepo.owner.login}
                  className="w-8 h-8 rounded-full"
                />
                <div>
                  <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-repo-name">
                    <span className="text-muted-foreground">{selectedRepo.owner.login}/</span>
                    {selectedRepo.name}
                    {selectedRepo.private && <Lock className="h-5 w-5 text-yellow-600" />}
                  </h1>
                  {selectedRepo.description && (
                    <p className="text-muted-foreground">{selectedRepo.description}</p>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Badge variant={selectedRepo.private ? "secondary" : "outline"}>
                {selectedRepo.private ? 'Private' : 'Public'}
              </Badge>
              <Button variant="outline" size="sm" data-testid="button-star-repo">
                <Star className="h-4 w-4 mr-1" />
                {selectedRepo.stargazers_count}
              </Button>
              <Button variant="outline" size="sm" data-testid="button-fork-repo">
                <GitFork className="h-4 w-4 mr-1" />
                {selectedRepo.forks_count}
              </Button>
            </div>
          </div>

          {/* Repository Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-blue-600">{selectedRepo.stargazers_count}</div>
                <div className="text-sm text-muted-foreground">Stars</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-green-600">{selectedRepo.forks_count}</div>
                <div className="text-sm text-muted-foreground">Forks</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-yellow-600">{selectedRepo.open_issues_count}</div>
                <div className="text-sm text-muted-foreground">Issues</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-purple-600">{formatFileSize(selectedRepo.size * 1024)}</div>
                <div className="text-sm text-muted-foreground">Size</div>
              </CardContent>
            </Card>
          </div>

          {/* Repository Tabs */}
          <Tabs value={repoActiveTab} onValueChange={setRepoActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="files" data-testid="tab-files">
                <FileText className="h-4 w-4 mr-2" />
                Files
              </TabsTrigger>
              <TabsTrigger value="commits" data-testid="tab-commits">
                <Activity className="h-4 w-4 mr-2" />
                Commits
              </TabsTrigger>
              <TabsTrigger value="branches" data-testid="tab-branches">
                <GitBranch className="h-4 w-4 mr-2" />
                Branches
              </TabsTrigger>
              <TabsTrigger value="pulls" data-testid="tab-pulls">
                <GitPullRequest className="h-4 w-4 mr-2" />
                Pull Requests
              </TabsTrigger>
              <TabsTrigger value="issues" data-testid="tab-issues">
                <AlertCircle className="h-4 w-4 mr-2" />
                Issues
              </TabsTrigger>
              <TabsTrigger value="actions" data-testid="tab-actions">
                <Zap className="h-4 w-4 mr-2" />
                Actions
              </TabsTrigger>
            </TabsList>

            {/* Files Tab */}
            <TabsContent value="files" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Folder className="h-5 w-5" />
                      Repository Files
                    </CardTitle>
                    <div className="flex items-center space-x-2">
                      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" data-testid="button-upload-file">
                            <Upload className="h-4 w-4 mr-2" />
                            Upload File
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-lg">
                          <DialogHeader>
                            <DialogTitle>Upload File to Repository</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor="fileName">File Name</Label>
                              <Input
                                id="fileName"
                                placeholder="example.txt"
                                value={uploadForm.fileName}
                                onChange={(e) => setUploadForm({ ...uploadForm, fileName: e.target.value })}
                                data-testid="input-file-name"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="fileContent">File Content</Label>
                              <Textarea
                                id="fileContent"
                                placeholder="Enter your file content here..."
                                value={uploadForm.content}
                                onChange={(e) => setUploadForm({ ...uploadForm, content: e.target.value })}
                                rows={10}
                                data-testid="textarea-file-content"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="commitMessage">Commit Message</Label>
                              <Input
                                id="commitMessage"
                                placeholder="Add new file"
                                value={uploadForm.commitMessage}
                                onChange={(e) => setUploadForm({ ...uploadForm, commitMessage: e.target.value })}
                                data-testid="input-commit-message"
                              />
                            </div>
                            <div className="flex justify-end space-x-2">
                              <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
                                Cancel
                              </Button>
                              <Button 
                                onClick={async () => {
                                  if (selectedRepo && uploadForm.fileName && uploadForm.content && uploadForm.commitMessage) {
                                    const filePath = currentPath ? `${currentPath}/${uploadForm.fileName}` : uploadForm.fileName;
                                    
                                    // Create a temporary file to determine if it should be base64 encoded
                                    const tempFile = new File([uploadForm.content], uploadForm.fileName);
                                    const shouldEncode = isBinaryFile(tempFile);
                                    const content = shouldEncode ? btoa(uploadForm.content) : uploadForm.content;
                                    
                                    uploadFileMutation.mutate({
                                      owner: selectedRepo.owner.login,
                                      repo: selectedRepo.name,
                                      path: filePath,
                                      content,
                                      message: uploadForm.commitMessage
                                    });
                                  }
                                }}
                                disabled={uploadFileMutation.isPending || !uploadForm.fileName.trim() || !uploadForm.content.trim() || !uploadForm.commitMessage.trim()}
                                data-testid="button-upload-file-submit"
                              >
                                {uploadFileMutation.isPending && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
                                Upload File
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                      
                      <input
                        type="file"
                        id="folderUploadToRepo"
                        {...({webkitdirectory: true} as any)}
                        multiple
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const files = e.target.files;
                          if (files && files.length > 0) {
                            handleFolderUploadToNewRepo(files);
                          }
                        }}
                      />
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => document.getElementById('folderUploadToRepo')?.click()}
                        data-testid="button-upload-folder-new-repo"
                      >
                        <FolderOpen className="h-4 w-4 mr-2" />
                        Upload Folder as New Repo
                      </Button>
                      
                      <input
                        type="file"
                        id="folderUpload"
                        {...({webkitdirectory: true} as any)}
                        multiple
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const files = e.target.files;
                          if (files && files.length > 0) {
                            handleFolderUpload(files);
                          }
                        }}
                      />
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => document.getElementById('folderUpload')?.click()}
                        data-testid="button-upload-folder"
                      >
                        <FolderOpen className="h-4 w-4 mr-2" />
                        Upload Folder to This Repo
                      </Button>
                      
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => {
                          if (selectedRepo) {
                            window.open(`${selectedRepo.html_url}/archive/refs/heads/${selectedBranch || selectedRepo.default_branch}.zip`, '_blank');
                          }
                        }}
                        data-testid="button-download-repo"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download Repository
                      </Button>
                    </div>
                  </div>
                  {currentPath && (
                    <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                      <Button variant="ghost" size="sm" onClick={navigateUp}>
                        <ArrowLeft className="h-3 w-3 mr-1" />
                        Back
                      </Button>
                      <span>/{currentPath}</span>
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {repoFiles?.map((file) => (
                      <div 
                        key={file.path}
                        className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => handleFileClick(file)}
                        data-testid={`file-${file.name}`}
                      >
                        <div className="flex items-center space-x-3">
                          {file.type === 'dir' ? (
                            <Folder className="h-4 w-4 text-blue-600" />
                          ) : (
                            <FileText className="h-4 w-4 text-gray-600" />
                          )}
                          <span className="font-medium">{file.name}</span>
                        </div>
                        <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                          {file.type === 'file' && <span>{formatFileSize(file.size)}</span>}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem onClick={() => window.open(file.html_url, '_blank')}>
                                <ExternalLink className="h-4 w-4 mr-2" />
                                View on GitHub
                              </DropdownMenuItem>
                              {file.download_url && (
                                <DropdownMenuItem onClick={() => window.open(file.download_url!, '_blank')}>
                                  <Download className="h-4 w-4 mr-2" />
                                  Download
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem>
                                <Copy className="h-4 w-4 mr-2" />
                                Copy Path
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="text-red-600" 
                                onClick={() => handleFileAction('delete', file)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Commits Tab */}
            <TabsContent value="commits" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Commit History
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {repoCommits.slice(0, 10).map((commit) => (
                      <div key={commit.sha} className="flex items-start space-x-4 p-4 rounded-lg border">
                        {commit.author && (
                          <img 
                            src={commit.author.avatar_url} 
                            alt={commit.author.login}
                            className="w-8 h-8 rounded-full"
                          />
                        )}
                        <div className="flex-1 space-y-1">
                          <p className="font-medium">{commit.commit.message}</p>
                          <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                            {commit.author && <span>{commit.author.login}</span>}
                            <span>{formatTimeAgo(commit.commit.author.date)}</span>
                            <span className="font-mono text-xs bg-muted px-2 py-1 rounded">
                              {commit.sha.slice(0, 7)}
                            </span>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => window.open(commit.html_url, '_blank')}>
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Branches Tab */}
            <TabsContent value="branches" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <GitBranch className="h-5 w-5" />
                    Branches
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {repoBranches?.map((branch) => (
                      <div 
                        key={branch.name}
                        className="flex items-center justify-between p-3 rounded-lg border"
                        data-testid={`branch-${branch.name}`}
                      >
                        <div className="flex items-center space-x-3">
                          <GitBranch className="h-4 w-4" />
                          <span className="font-medium">{branch.name}</span>
                          {branch.name === selectedRepo.default_branch && (
                            <Badge variant="outline">Default</Badge>
                          )}
                          {branch.protected && (
                            <Badge variant="secondary">Protected</Badge>
                          )}
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-muted-foreground font-mono">
                            {branch.commit.sha.slice(0, 7)}
                          </span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem onClick={() => setSelectedBranch(branch.name)}>
                                <Eye className="h-4 w-4 mr-2" />
                                Switch to Branch
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Copy className="h-4 w-4 mr-2" />
                                Copy Branch Name
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem>
                                <GitPullRequest className="h-4 w-4 mr-2" />
                                New Pull Request
                              </DropdownMenuItem>
                              {branch.name !== selectedRepo.default_branch && (
                                <DropdownMenuItem className="text-red-600">
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete Branch
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Other tabs can be implemented similarly */}
            <TabsContent value="pulls">
              <Card>
                <CardContent className="p-8 text-center">
                  <GitPullRequest className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Pull requests functionality coming soon</p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="issues">
              <Card>
                <CardContent className="p-8 text-center">
                  <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Issues functionality coming soon</p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="actions">
              <Card>
                <CardContent className="p-8 text-center">
                  <Zap className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">GitHub Actions functionality coming soon</p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800" data-testid="git-control-dashboard">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header Section */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight flex items-center gap-3" data-testid="title-git-control">
              <div className="p-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl shadow-lg">
                <Github className="h-8 w-8" />
              </div>
              GitHub Control Center
            </h1>
            <p className="text-muted-foreground text-lg">
              Complete GitHub repository management with enterprise-grade controls
            </p>
          </div>
          
          {userInfo && (
            <Card className="border-0 shadow-lg">
              <CardContent className="p-4">
                <div className="flex items-center space-x-4">
                  <img 
                    src={userInfo.user.avatar_url} 
                    alt={userInfo.user.login}
                    className="w-12 h-12 rounded-full"
                  />
                  <div>
                    <div className="font-semibold">{userInfo.user.name || userInfo.user.login}</div>
                    <div className="text-sm text-muted-foreground">{userInfo.user.login}</div>
                    <div className="text-xs text-muted-foreground">
                      {userInfo.user.public_repos} repos • {userInfo.user.followers} followers
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* PAT Configuration */}
        {(!patSettings?.hasDefaultPAT && !patSettings?.personalAccessToken) && (
          <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Key className="h-6 w-6 text-yellow-600" />
                  <div>
                    <h3 className="font-semibold text-yellow-800 dark:text-yellow-200">
                      GitHub Personal Access Token Required
                    </h3>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">
                      Configure your GitHub PAT to access repositories and manage GitHub resources
                    </p>
                  </div>
                </div>
                <Dialog open={showPATDialog} onOpenChange={setShowPATDialog}>
                  <DialogTrigger asChild>
                    <Button className="bg-yellow-600 hover:bg-yellow-700" data-testid="button-configure-pat">
                      <Settings className="h-4 w-4 mr-2" />
                      Configure PAT
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Configure GitHub Personal Access Token</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="pat">Personal Access Token</Label>
                        <Input
                          id="pat"
                          type="password"
                          placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                          value={patForm.pat}
                          onChange={(e) => setPATForm({ pat: e.target.value })}
                          data-testid="input-pat-token"
                        />
                        <p className="text-xs text-muted-foreground">
                          Generate a new token at github.com/settings/tokens with full repository permissions
                        </p>
                      </div>
                      <div className="flex justify-end space-x-2">
                        <Button variant="outline" onClick={() => setShowPATDialog(false)}>
                          Cancel
                        </Button>
                        <Button 
                          onClick={() => savePATMutation.mutate({ personalAccessToken: patForm.pat })}
                          disabled={savePATMutation.isPending || !patForm.pat}
                          data-testid="button-save-pat"
                        >
                          {savePATMutation.isPending && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
                          Save Token
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Dashboard */}
        {(patSettings?.hasDefaultPAT || patSettings?.personalAccessToken) && (
          <>
            {/* Search and Actions Bar */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 relative max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search repositories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-repos"
                />
              </div>
              
              <div className="flex items-center space-x-2">
                <Dialog open={showPATDialog} onOpenChange={setShowPATDialog}>
                  <DialogTrigger asChild>
                    <Button variant="outline" data-testid="button-manage-pat">
                      <Key className="h-4 w-4 mr-2" />
                      Manage PAT
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Update GitHub Personal Access Token</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="pat">Personal Access Token</Label>
                        <Input
                          id="pat"
                          type="password"
                          placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                          value={patForm.pat}
                          onChange={(e) => setPATForm({ pat: e.target.value })}
                          data-testid="input-update-pat-token"
                        />
                      </div>
                      <div className="flex justify-end space-x-2">
                        <Button variant="outline" onClick={() => setShowPATDialog(false)}>
                          Cancel
                        </Button>
                        <Button 
                          onClick={() => savePATMutation.mutate({ personalAccessToken: patForm.pat })}
                          disabled={savePATMutation.isPending || !patForm.pat}
                          data-testid="button-update-pat"
                        >
                          {savePATMutation.isPending && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
                          Update Token
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                
                <Dialog open={showCreateRepoDialog} onOpenChange={setShowCreateRepoDialog}>
                  <DialogTrigger asChild>
                    <Button className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700" data-testid="button-create-repo">
                      <Plus className="h-4 w-4 mr-2" />
                      New Repository
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Create New Repository</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="repoName">Repository Name</Label>
                        <Input
                          id="repoName"
                          placeholder="my-awesome-repo"
                          value={repoForm.name}
                          onChange={(e) => setRepoForm({ ...repoForm, name: e.target.value })}
                          data-testid="input-repo-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="repoDescription">Description (optional)</Label>
                        <Textarea
                          id="repoDescription"
                          placeholder="A brief description of your repository"
                          value={repoForm.description}
                          onChange={(e) => setRepoForm({ ...repoForm, description: e.target.value })}
                          data-testid="input-repo-description"
                        />
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="repoPrivate"
                          checked={repoForm.private}
                          onChange={(e) => setRepoForm({ ...repoForm, private: e.target.checked })}
                          className="rounded"
                          data-testid="checkbox-repo-private"
                        />
                        <Label htmlFor="repoPrivate">Make repository private</Label>
                      </div>
                      
                      <div className="space-y-3">
                        <Label>Upload Files (Optional)</Label>
                        <div className="flex flex-col space-y-2">
                          <input
                            type="file"
                            id="createRepoFolderUpload"
                            {...({webkitdirectory: true} as any)}
                            multiple
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              const files = e.target.files;
                              if (files && files.length > 0) {
                                setUploadForm(prev => ({ ...prev, selectedFiles: files }));
                              }
                            }}
                          />
                          <Button 
                            type="button"
                            variant="outline" 
                            onClick={() => document.getElementById('createRepoFolderUpload')?.click()}
                            data-testid="button-select-folder"
                          >
                            <FolderOpen className="h-4 w-4 mr-2" />
                            Select Folder to Upload
                          </Button>
                          {uploadForm.selectedFiles && (
                            <p className="text-sm text-muted-foreground">
                              {uploadForm.selectedFiles.length} files selected
                            </p>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex justify-end space-x-2">
                        <Button variant="outline" onClick={() => {
                          setShowCreateRepoDialog(false);
                          setUploadForm(prev => ({ ...prev, selectedFiles: null }));
                        }}>
                          Cancel
                        </Button>
                        <Button 
                          onClick={() => {
                            if (uploadForm.selectedFiles && uploadForm.selectedFiles.length > 0) {
                              handleCreateRepoWithFiles(repoForm, uploadForm.selectedFiles);
                            } else {
                              createRepoMutation.mutate(repoForm);
                            }
                          }}
                          disabled={createRepoMutation.isPending || !repoForm.name.trim()}
                          data-testid="button-create-repo-submit"
                        >
                          {createRepoMutation.isPending && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
                          Create Repository
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {/* Repository Grid */}
            <div className="space-y-4">
              {isLoadingRepos ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[...Array(6)].map((_, i) => (
                    <Card key={i} className="animate-pulse">
                      <CardContent className="p-6">
                        <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                        <div className="h-3 bg-muted rounded w-1/2 mb-4"></div>
                        <div className="space-y-2">
                          <div className="h-3 bg-muted rounded w-full"></div>
                          <div className="h-3 bg-muted rounded w-2/3"></div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : reposError ? (
                <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
                  <CardContent className="p-8 text-center">
                    <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
                    <h3 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">
                      Failed to load repositories
                    </h3>
                    <p className="text-red-700 dark:text-red-300">
                      Please check your Personal Access Token configuration
                    </p>
                  </CardContent>
                </Card>
              ) : filteredRepos.length === 0 ? (
                <Card>
                  <CardContent className="p-12 text-center">
                    <Database className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-xl font-semibold mb-2">No repositories found</h3>
                    <p className="text-muted-foreground mb-6">
                      {searchQuery ? 'No repositories match your search criteria' : 'Create your first repository to get started'}
                    </p>
                    {!searchQuery && (
                      <Button className="bg-gradient-to-r from-purple-600 to-blue-600">
                        <Plus className="h-4 w-4 mr-2" />
                        Create Repository
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {filteredRepos.map((repo) => (
                    <Card 
                      key={repo.id} 
                      className="group hover:shadow-lg transition-all duration-200 cursor-pointer border-0 shadow-md bg-white/80 backdrop-blur-sm dark:bg-slate-800/80"
                      onClick={() => handleRepoAction('view', repo)}
                      data-testid={`repo-card-${repo.name}`}
                    >
                      <CardContent className="p-6">
                        {/* Repository Header */}
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center space-x-3 flex-1 min-w-0">
                            <img 
                              src={repo.owner.avatar_url} 
                              alt={repo.owner.login}
                              className="w-8 h-8 rounded-full flex-shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <h3 className="font-semibold text-lg truncate" title={repo.name}>
                                {repo.name}
                              </h3>
                              <p className="text-sm text-muted-foreground truncate" title={repo.owner.login}>
                                {repo.owner.login}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center space-x-1 flex-shrink-0">
                            {repo.private ? (
                              <Lock className="h-4 w-4 text-yellow-600" />
                            ) : (
                              <Globe className="h-4 w-4 text-green-600" />
                            )}
                            
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="opacity-100"
                                  data-testid={`button-menu-${repo.name}`}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuItem onClick={() => handleRepoAction('view', repo)}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Repository
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleRepoAction('clone', repo)}>
                                  <Copy className="h-4 w-4 mr-2" />
                                  Copy Clone URL
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleRepoAction('download', repo)}>
                                  <Download className="h-4 w-4 mr-2" />
                                  Download ZIP
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleRepoAction('fork', repo)}>
                                  <GitFork className="h-4 w-4 mr-2" />
                                  Fork Repository
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleRepoAction('star', repo)}>
                                  <Star className="h-4 w-4 mr-2" />
                                  Star Repository
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleRepoAction('issues', repo)}>
                                  <AlertCircle className="h-4 w-4 mr-2" />
                                  Issues ({repo.open_issues_count})
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleRepoAction('pulls', repo)}>
                                  <GitPullRequest className="h-4 w-4 mr-2" />
                                  Pull Requests
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleRepoAction('actions', repo)}>
                                  <Zap className="h-4 w-4 mr-2" />
                                  Actions & Workflows
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleRepoAction('security', repo)}>
                                  <Shield className="h-4 w-4 mr-2" />
                                  Security & Analysis
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleRepoAction('insights', repo)}>
                                  <Activity className="h-4 w-4 mr-2" />
                                  Insights & Analytics
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleRepoAction('packages', repo)}>
                                  <Package className="h-4 w-4 mr-2" />
                                  Packages
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleRepoAction('releases', repo)}>
                                  <Zap className="h-4 w-4 mr-2" />
                                  Releases
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleRepoAction('deployments', repo)}>
                                  <Globe className="h-4 w-4 mr-2" />
                                  Deployments
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleRepoAction('environments', repo)}>
                                  <Shield className="h-4 w-4 mr-2" />
                                  Environments
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleRepoAction('discussions', repo)}>
                                  <Users2 className="h-4 w-4 mr-2" />
                                  Discussions
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleRepoAction('projects', repo)}>
                                  <Terminal className="h-4 w-4 mr-2" />
                                  Projects
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleRepoAction('wiki', repo)}>
                                  <BookOpen className="h-4 w-4 mr-2" />
                                  Wiki
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleRepoAction('notifications', repo)}>
                                  <Mail className="h-4 w-4 mr-2" />
                                  Notifications
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleRepoAction('settings', repo)}>
                                  <Settings className="h-4 w-4 mr-2" />
                                  Repository Settings
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleRepoAction('transfer', repo)}>
                                  <Users className="h-4 w-4 mr-2" />
                                  Transfer Repository
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleRepoAction('archive', repo)}>
                                  <Archive className="h-4 w-4 mr-2" />
                                  Archive Repository
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  onClick={() => handleRepoAction('delete', repo)}
                                  className="text-red-600 focus:text-red-600"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete Repository
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>

                        {/* Repository Description */}
                        {repo.description && (
                          <p className="text-sm text-muted-foreground mb-4 line-clamp-2" title={repo.description}>
                            {repo.description}
                          </p>
                        )}

                        {/* Repository Topics */}
                        {repo.topics && repo.topics.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-4">
                            {repo.topics.slice(0, 3).map((topic) => (
                              <Badge key={topic} variant="secondary" className="text-xs">
                                {topic}
                              </Badge>
                            ))}
                            {repo.topics.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{repo.topics.length - 3}
                              </Badge>
                            )}
                          </div>
                        )}

                        {/* Repository Stats */}
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          <div className="flex items-center space-x-4">
                            {repo.language && (
                              <div className="flex items-center space-x-1">
                                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                                <span>{repo.language}</span>
                              </div>
                            )}
                            <div className="flex items-center space-x-1">
                              <Star className="h-3 w-3" />
                              <span>{repo.stargazers_count}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <GitFork className="h-3 w-3" />
                              <span>{repo.forks_count}</span>
                            </div>
                          </div>
                          <span>{formatTimeAgo(repo.updated_at)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Delete Repository Dialog */}
        <AlertDialog open={!!showDeleteDialog} onOpenChange={() => setShowDeleteDialog(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Repository</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{showDeleteDialog?.name}"? This action cannot be undone.
                This will permanently delete the repository, issues, pull requests, and all associated data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                className="bg-red-600 hover:bg-red-700"
                onClick={() => {
                  if (showDeleteDialog) {
                    deleteRepoMutation.mutate({ 
                      owner: showDeleteDialog.owner.login, 
                      repo: showDeleteDialog.name 
                    });
                  }
                }}
                disabled={deleteRepoMutation.isPending}
              >
                {deleteRepoMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete Repository'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}