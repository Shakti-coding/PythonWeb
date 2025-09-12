import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  MessageCircle,
  Download,
  HardDrive,
  RefreshCw,
  Video,
  CheckCircle,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { storage } from '@/lib/storage';
import { downloadManager } from '@/lib/downloads';
import type { Chat, DownloadItem } from '@shared/schema';

interface DashboardProps {
  onViewChange: (view: string) => void;
}

interface DashboardStats {
  totalChats: number;
  downloadedVideos: number;
  storageUsed: string;
  lastSync: string;
}

export function Dashboard({ onViewChange }: DashboardProps) {
  const [stats, setStats] = useState<DashboardStats>({
    totalChats: 0,
    downloadedVideos: 0,
    storageUsed: '0 GB',
    lastSync: 'Never',
  });

  // Fetch chats
  const { data: chats = [] } = useQuery<Chat[]>({
    queryKey: ['chats'],
    queryFn: async () => {
      return await storage.getChats();
    },
  });

  // Fetch downloads
  const { data: downloads = [] } = useQuery<DownloadItem[]>({
    queryKey: ['downloads'],
    queryFn: async () => {
      return await storage.getDownloads();
    },
    refetchInterval: 1000, // Refresh every second for progress updates
  });

  useEffect(() => {
    // Calculate stats
    const completedDownloads = downloads.filter(d => d.status === 'completed');
    const totalSize = completedDownloads.reduce((sum, d) => sum + d.fileSize, 0);
    
    setStats({
      totalChats: chats.length,
      downloadedVideos: completedDownloads.length,
      storageUsed: formatFileSize(totalSize),
      lastSync: new Date().toLocaleString(),
    });
  }, [chats, downloads]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getStatusIcon = (status: DownloadItem['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'downloading':
        return <Clock className="w-4 h-4 text-blue-500" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const recentDownloads = downloads
    .sort((a, b) => b.id.localeCompare(a.id))
    .slice(0, 5);

  const activeDownloads = downloads.filter(d => d.status === 'downloading');

  const activeChats = chats.slice(0, 5);

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2">Dashboard</h2>
        <p className="text-muted-foreground">
          Overview of your Telegram data and recent activity
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Chats</p>
                <p className="text-2xl font-bold" data-testid="stat-total-chats">
                  {stats.totalChats}
                </p>
              </div>
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <MessageCircle className="w-6 h-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Downloaded Videos</p>
                <p className="text-2xl font-bold" data-testid="stat-downloaded-videos">
                  {stats.downloadedVideos}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center">
                <Download className="w-6 h-6 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Storage Used</p>
                <p className="text-2xl font-bold" data-testid="stat-storage-used">
                  {stats.storageUsed}
                </p>
              </div>
              <div className="w-12 h-12 bg-yellow-500/10 rounded-lg flex items-center justify-center">
                <HardDrive className="w-6 h-6 text-yellow-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Last Sync</p>
                <p className="text-sm font-bold" data-testid="stat-last-sync">
                  {stats.lastSync}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center">
                <RefreshCw className="w-6 h-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Downloads */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Downloads</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onViewChange('downloads')}
              data-testid="button-view-all-downloads"
            >
              View All
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentDownloads.length > 0 ? (
                recentDownloads.map((download) => (
                  <div
                    key={download.id}
                    className="flex items-center space-x-3 p-3 bg-muted/30 rounded-md"
                    data-testid={`download-item-${download.id}`}
                  >
                    <div className="w-10 h-10 bg-primary/20 rounded-md flex items-center justify-center">
                      <Video className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{download.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(download.fileSize)} • {download.status}
                      </p>
                    </div>
                    {getStatusIcon(download.status)}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No downloads yet
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Active Chats */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Active Chats</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onViewChange('chats')}
              data-testid="button-view-all-chats"
            >
              View All
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activeChats.length > 0 ? (
                activeChats.map((chat) => (
                  <div
                    key={chat.id}
                    className="flex items-center space-x-3 p-3 bg-muted/30 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => onViewChange('messages')}
                    data-testid={`chat-item-${chat.id}`}
                  >
                    <Avatar className="w-10 h-10">
                      <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-sm font-medium">
                        {chat.title.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{chat.title}</p>
                        <Badge variant="secondary" className="text-xs">
                          {chat.type}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {chat.participantCount
                          ? `${chat.participantCount} members`
                          : 'Private chat'
                        }
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No chats available
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Download Progress Section */}
      {activeDownloads.length > 0 && (
        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Download Progress
                <Badge variant="secondary" className="text-xs">
                  {activeDownloads.length} active
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activeDownloads.map((download) => (
                  <div
                    key={download.id}
                    className="border border-border rounded-lg p-4"
                    data-testid={`active-download-${download.id}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-primary/20 rounded-md flex items-center justify-center">
                          <Video className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{download.fileName}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(download.fileSize)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{Math.round(download.progress)}%</p>
                        {download.speed && (
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(download.speed)}/s
                          </p>
                        )}
                      </div>
                    </div>
                    <Progress
                      value={download.progress}
                      className="h-2"
                      data-testid={`progress-${download.id}`}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
