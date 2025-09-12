import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  Download,
  Play,
  FileText,
  Image as ImageIcon,
  Music,
  Video,
  Trash2,
  Search,
  Filter,
  RefreshCw,
  ExternalLink,
  FolderOpen
} from 'lucide-react';

interface DownloadItem {
  id: string;
  fileName: string;
  folder: string;
  type: 'video' | 'audio' | 'image' | 'pdf' | 'document';
  size: number;
  downloadedAt: string;
  status: string;
  url: string;
  uploader?: string;
}

interface DownloadHistory {
  downloads: DownloadItem[];
  totalFiles: number;
  totalSize: number;
  lastUpdated: string;
}

export default function DownloadsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: history, isLoading, refetch } = useQuery<DownloadHistory>({
    queryKey: ['download-history'],
    queryFn: async () => {
      const response = await fetch('/api/downloads');
      if (!response.ok) {
        throw new Error('Failed to fetch downloads');
      }
      return response.json();
    },
    refetchInterval: 5000,
  });

  const filteredDownloads = history?.downloads.filter(download => {
    const matchesSearch = download.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (download.uploader && download.uploader.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesFilter = filterType === 'all' || download.type === filterType;
    return matchesSearch && matchesFilter;
  }) || [];

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'video': return <Video className="w-4 h-4" />;
      case 'audio': return <Music className="w-4 h-4" />;
      case 'image': return <ImageIcon className="w-4 h-4" />;
      case 'pdf': return <FileText className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'video': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'audio': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'image': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'pdf': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  const openFile = (download: DownloadItem) => {
    window.open(download.url, '_blank');
  };

  const deleteFile = async (download: DownloadItem) => {
    try {
      const response = await fetch(`/api/downloads/file/${encodeURIComponent(download.folder)}/${encodeURIComponent(download.fileName)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete file');
      }

      toast({
        title: 'File deleted',
        description: `${download.fileName} has been deleted successfully`,
      });

      refetch();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const downloadFile = (download: DownloadItem) => {
    const link = document.createElement('a');
    link.href = download.url;
    link.download = download.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin" />
        <span className="ml-2">Loading downloads...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Downloads</h1>
          <p className="text-muted-foreground">
            Manage and view your downloaded files
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <FolderOpen className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{history?.totalFiles || 0}</p>
                <p className="text-xs text-muted-foreground">Total Files</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <Download className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{formatFileSize(history?.totalSize || 0)}</p>
                <p className="text-xs text-muted-foreground">Total Size</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Last Updated</p>
                <p className="text-xs text-muted-foreground">
                  {history?.lastUpdated ? formatDate(history.lastUpdated) : 'Never'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filter Downloads</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search files..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <div className="flex gap-2">
              {['all', 'video', 'audio', 'image', 'pdf', 'document'].map((type) => (
                <Button
                  key={type}
                  variant={filterType === type ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterType(type)}
                >
                  {type === 'all' ? <Filter className="w-4 h-4 mr-1" /> : getFileIcon(type)}
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Downloads List */}
      <Card>
        <CardHeader>
          <CardTitle>Downloaded Files ({filteredDownloads.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredDownloads.length === 0 ? (
            <div className="text-center py-8">
              <Download className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No downloads found</h3>
              <p className="text-muted-foreground">
                {searchTerm || filterType !== 'all' 
                  ? 'Try adjusting your search or filter criteria.'
                  : 'Start downloading files through the Telegram bot to see them here.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDownloads.map((download) => (
                <div
                  key={download.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center space-x-4 flex-1 min-w-0">
                    <div className="flex-shrink-0">
                      {getFileIcon(download.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <p className="text-sm font-medium truncate">{download.fileName}</p>
                        <Badge className={getTypeColor(download.type)}>
                          {download.type}
                        </Badge>
                      </div>
                      <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                        <span>{formatFileSize(download.size)}</span>
                        <span>{formatDate(download.downloadedAt)}</span>
                        {download.uploader && (
                          <span className="flex items-center">
                            <ExternalLink className="w-3 h-3 mr-1" />
                            {download.uploader}
                          </span>
                        )}
                        <span className="truncate">{download.folder}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 flex-shrink-0">
                    {(download.type === 'video' || download.type === 'audio' || download.type === 'image' || download.type === 'pdf') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openFile(download)}
                        title="Open/Play file"
                      >
                        <Play className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => downloadFile(download)}
                      title="Download file"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteFile(download)}
                      title="Delete file"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}