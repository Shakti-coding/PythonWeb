import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Settings as SettingsIcon,
  Key,
  HardDrive,
  Download,
  Trash2,
  RefreshCw,
  FolderOpen,
  Database,
  Loader2,
  AlertCircle,
  CheckCircle,
  Palette,
  Sun,
  Moon,
  Copy,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { storage } from '@/lib/storage';
import { downloadManager } from '@/lib/downloads';
import { telegramManager } from '@/lib/telegram';
import { useUILayout } from '@/contexts/ui-layout-context';
import type { TelegramSession } from '@shared/schema';

interface SettingsData {
  downloadQuality: 'auto' | 'high' | 'medium' | 'low';
  maxConcurrentDownloads: number;
  autoRetryFailed: boolean;
  deleteFailedDownloads: boolean;
  showDownloadNotifications: boolean;
  uiLayout: 'default' | 'compact' | 'modern' | 'classic' | 'minimal' | 'gaming';
  darkMode: boolean;
}

const uiLayouts = [
  { 
    id: 'current', 
    name: 'Current Design', 
    description: 'The current app design you are using right now'
  },
  { 
    id: 'compact', 
    name: 'Compact Pro', 
    description: 'Dense layout with rounded corners and tight spacing'
  },
  { 
    id: 'glass', 
    name: 'Modern Glass', 
    description: 'Glass morphism with blur effects and floating elements'
  },
  { 
    id: 'classic', 
    name: 'Classic Box', 
    description: 'Traditional rectangular design with sharp corners'
  },
  { 
    id: 'minimal', 
    name: 'Ultra Minimal', 
    description: 'Clean lines, maximum whitespace, minimal borders'
  },
  { 
    id: 'gaming', 
    name: 'Gaming RGB', 
    description: 'Futuristic design with neon accents and animations'
  },
];

export function Settings() {
  const [settings, setSettings] = useState<SettingsData>({
    downloadQuality: 'auto',
    maxConcurrentDownloads: 3,
    autoRetryFailed: true,
    deleteFailedDownloads: false,
    showDownloadNotifications: true,
    uiLayout: 'default',
    darkMode: false,
  });

  const [storageInfo, setStorageInfo] = useState({
    totalDownloads: 0,
    totalSize: 0,
    storageQuota: 0,
    storageUsed: 0,
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { layout, setLayout } = useUILayout();

  // Load settings from localStorage
  useEffect(() => {
    const savedSettings = localStorage.getItem('telegram-manager-settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings({ ...settings, ...parsed });
      } catch (error) {
        console.error('Failed to parse saved settings:', error);
      }
    }
  }, []);

  // Save settings to localStorage
  const saveSettings = (newSettings: SettingsData) => {
    setSettings(newSettings);
    localStorage.setItem('telegram-manager-settings', JSON.stringify(newSettings));
    toast({
      title: 'Settings saved',
      description: 'Your preferences have been updated',
    });
  };

  // No theme application that breaks the UI

  // Fetch current session
  const { data: sessions = [] } = useQuery<TelegramSession[]>({
    queryKey: ['sessions'],
    queryFn: async () => {
      return await storage.getAllSessions();
    },
  });

  // Fetch bot statuses
  const { data: mainBotStatus } = useQuery({
    queryKey: ['bot-status', 'main'],
    queryFn: async () => {
      const response = await fetch('/api/bot/status');
      return response.json();
    },
    refetchInterval: 5000,
  });

  const { data: pythonBotStatus } = useQuery({
    queryKey: ['bot-status', 'python'],
    queryFn: async () => {
      const response = await fetch('/api/python-bot/status');
      return response.json();
    },
    refetchInterval: 5000,
  });

  const { data: nodeBotStatus } = useQuery({
    queryKey: ['bot-status', 'node'],
    queryFn: async () => {
      const response = await fetch('/api/node-bot/status');
      return response.json();
    },
    refetchInterval: 5000,
  });

  // Fetch storage information
  useEffect(() => {
    const updateStorageInfo = async () => {
      try {
        const downloads = await storage.getDownloads();
        const completedDownloads = downloads.filter(d => d.status === 'completed');
        const totalSize = completedDownloads.reduce((sum, d) => sum + d.fileSize, 0);

        // Get browser storage quota if available
        let quota = 0;
        let used = 0;
        if ('storage' in navigator && 'estimate' in navigator.storage) {
          const estimate = await navigator.storage.estimate();
          quota = estimate.quota || 0;
          used = estimate.usage || 0;
        }

        setStorageInfo({
          totalDownloads: completedDownloads.length,
          totalSize,
          storageQuota: quota,
          storageUsed: used,
        });
      } catch (error) {
        console.error('Failed to get storage info:', error);
      }
    };

    updateStorageInfo();
  }, []);

  const clearAllData = useMutation({
    mutationFn: async () => {
      await storage.clearAll();
      await telegramManager.disconnect();
      localStorage.clear();
    },
    onSuccess: () => {
      queryClient.clear();
      toast({
        title: 'Data cleared',
        description: 'All application data has been removed',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to clear data',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const clearDownloads = useMutation({
    mutationFn: async () => {
      const downloads = await storage.getDownloads();
      for (const download of downloads) {
        await storage.deleteDownload(download.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
      toast({
        title: 'Downloads cleared',
        description: 'Download history has been removed',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to clear downloads',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const refreshSession = useMutation({
    mutationFn: async () => {
      const currentSession = sessions[0];
      if (!currentSession) {
        throw new Error('No active session found');
      }

      await telegramManager.loadSession(currentSession);
      const chats = await telegramManager.getChats();
      await storage.saveChats(chats);
      
      return chats.length;
    },
    onSuccess: (chatCount) => {
      queryClient.invalidateQueries({ queryKey: ['chats'] });
      toast({
        title: 'Session refreshed',
        description: `Loaded ${chatCount} chats`,
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to refresh session',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const currentSession = sessions[0];

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2">Settings</h2>
        <p className="text-muted-foreground">
          Manage your application preferences and account settings
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Account Settings */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Key className="w-5 h-5" />
                <span>Account Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {currentSession ? (
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Name</Label>
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-medium flex-1">
                        {currentSession.firstName || 'N/A'} {currentSession.lastName || ''}
                      </p>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 w-8 p-0"
                        onClick={() => {
                          navigator.clipboard.writeText(`${currentSession.firstName} ${currentSession.lastName || ''}`);
                          toast({
                            title: 'Copied',
                            description: 'Name copied to clipboard',
                          });
                        }}
                        data-testid="button-copy-name"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Phone Number</Label>
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-medium flex-1">{currentSession.phoneNumber}</p>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 w-8 p-0"
                        onClick={() => {
                          navigator.clipboard.writeText(currentSession.phoneNumber);
                          toast({
                            title: 'Copied',
                            description: 'Phone number copied to clipboard',
                          });
                        }}
                        data-testid="button-copy-phone"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">User ID</Label>
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-mono bg-muted/50 p-2 rounded flex-1">
                        {currentSession.userId || 'N/A'}
                      </p>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 w-8 p-0"
                        onClick={() => {
                          navigator.clipboard.writeText(currentSession.userId || '');
                          toast({
                            title: 'Copied',
                            description: 'User ID copied to clipboard',
                          });
                        }}
                        data-testid="button-copy-user-id"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">API ID</Label>
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-mono bg-muted/50 p-2 rounded flex-1">
                        {currentSession.apiId}
                      </p>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 w-8 p-0"
                        onClick={() => {
                          navigator.clipboard.writeText(currentSession.apiId.toString());
                          toast({
                            title: 'Copied',
                            description: 'API ID copied to clipboard',
                          });
                        }}
                        data-testid="button-copy-api-id"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">API Hash</Label>
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-mono bg-muted/50 p-2 rounded flex-1">
                        {currentSession.apiHash.substring(0, 8)}...{currentSession.apiHash.substring(-4)}
                      </p>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 w-8 p-0"
                        onClick={() => {
                          navigator.clipboard.writeText(currentSession.apiHash);
                          toast({
                            title: 'Copied',
                            description: 'API Hash copied to clipboard',
                          });
                        }}
                        data-testid="button-copy-api-hash"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Session String</Label>
                    <div className="bg-muted/50 p-2 rounded">
                      <p className="text-xs font-mono break-all">
                        {currentSession.sessionString.substring(0, 50)}...
                      </p>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="mt-2 h-6 px-2 text-xs"
                        onClick={() => {
                          navigator.clipboard.writeText(currentSession.sessionString);
                          toast({
                            title: 'Copied',
                            description: 'Session string copied to clipboard',
                          });
                        }}
                        data-testid="button-copy-session"
                      >
                        Copy Full Session
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <Label className="text-sm font-medium text-muted-foreground mb-3 block">Bot Tokens</Label>
                    <div className="space-y-2">
                      {mainBotStatus?.status?.token && (
                        <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
                          <div className="flex-1">
                            <span className="text-xs font-medium">Main Bot</span>
                            <div className="text-xs text-muted-foreground">
                              {mainBotStatus.status.token}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-6 w-6 p-0"
                              onClick={() => {
                                navigator.clipboard.writeText(mainBotStatus.status.token);
                                toast({
                                  title: 'Copied',
                                  description: 'Main bot token copied to clipboard',
                                });
                              }}
                              data-testid="button-copy-main-bot-token"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                            <Badge variant={mainBotStatus.status.running ? "default" : "secondary"}>
                              {mainBotStatus.status.running ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                        </div>
                      )}
                      
                      {pythonBotStatus?.status?.api_id && (
                        <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
                          <div className="flex-1">
                            <span className="text-xs font-medium">Python Bot</span>
                            <div className="text-xs text-muted-foreground">
                              API ID: {pythonBotStatus.status.api_id}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-6 w-6 p-0"
                              onClick={() => {
                                navigator.clipboard.writeText(pythonBotStatus.status.api_id.toString());
                                toast({
                                  title: 'Copied',
                                  description: 'Python bot API ID copied to clipboard',
                                });
                              }}
                              data-testid="button-copy-python-bot-api-id"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                            <Badge variant={pythonBotStatus.status.running ? "default" : "secondary"}>
                              {pythonBotStatus.status.running ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                        </div>
                      )}
                      
                      {nodeBotStatus?.status?.config && (
                        <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
                          <div className="flex-1">
                            <span className="text-xs font-medium">Node Bot</span>
                            <div className="text-xs text-muted-foreground">
                              API ID: {nodeBotStatus.status.config.api_id}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-6 w-6 p-0"
                              onClick={() => {
                                navigator.clipboard.writeText(nodeBotStatus.status.config.api_id.toString());
                                toast({
                                  title: 'Copied',
                                  description: 'Node bot API ID copied to clipboard',
                                });
                              }}
                              data-testid="button-copy-node-bot-api-id"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                            <Badge variant={nodeBotStatus.status.running ? "default" : "secondary"}>
                              {nodeBotStatus.status.running ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                        </div>
                      )}

                      {!mainBotStatus?.status?.token && !pythonBotStatus?.status?.api_id && !nodeBotStatus?.status?.config && (
                        <div className="text-center py-2">
                          <p className="text-xs text-muted-foreground">No bot tokens configured</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <Separator />

                  <Button
                    onClick={() => refreshSession.mutate()}
                    disabled={refreshSession.isPending}
                    className="w-full"
                    data-testid="button-refresh-session"
                  >
                    {refreshSession.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh Session
                  </Button>
                </div>
              ) : (
                <div className="text-center py-4">
                  <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No active session</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Download className="w-5 h-5" />
                <span>Download Settings</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm font-medium mb-2 block">Download Quality</Label>
                <Select
                  value={settings.downloadQuality}
                  onValueChange={(value) => saveSettings({ ...settings, downloadQuality: value as any })}
                  data-testid="select-download-quality"
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto (Recommended)</SelectItem>
                    <SelectItem value="high">High Quality</SelectItem>
                    <SelectItem value="medium">Medium Quality</SelectItem>
                    <SelectItem value="low">Low Quality</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-medium mb-2 block">
                  Max Concurrent Downloads: {settings.maxConcurrentDownloads}
                </Label>
                <Input
                  type="range"
                  min="1"
                  max="10"
                  value={settings.maxConcurrentDownloads}
                  onChange={(e) => saveSettings({ 
                    ...settings, 
                    maxConcurrentDownloads: parseInt(e.target.value) 
                  })}
                  className="w-full"
                  data-testid="slider-concurrent-downloads"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Auto-retry failed downloads</Label>
                  <Switch
                    checked={settings.autoRetryFailed}
                    onCheckedChange={(checked) => saveSettings({ ...settings, autoRetryFailed: checked })}
                    data-testid="switch-auto-retry"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Delete failed downloads</Label>
                  <Switch
                    checked={settings.deleteFailedDownloads}
                    onCheckedChange={(checked) => saveSettings({ ...settings, deleteFailedDownloads: checked })}
                    data-testid="switch-delete-failed"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Show download notifications</Label>
                  <Switch
                    checked={settings.showDownloadNotifications}
                    onCheckedChange={(checked) => saveSettings({ ...settings, showDownloadNotifications: checked })}
                    data-testid="switch-notifications"
                  />
                </div>
              </div>

              <Separator />

              <div>
                <Label className="text-sm font-medium mb-2 block">Download Folder</Label>
                <Button
                  variant="outline"
                  onClick={() => downloadManager.selectDownloadDirectory()}
                  className="w-full justify-start"
                  data-testid="button-change-download-folder"
                >
                  <FolderOpen className="mr-2 h-4 w-4" />
                  {downloadManager.isDownloadDirectorySelected() 
                    ? 'Change Download Folder'
                    : 'Select Download Folder'
                  }
                </Button>
                {downloadManager.hasFileSystemSupport() ? (
                  <p className="text-xs text-muted-foreground mt-1">
                    Using File System Access API for direct folder access
                  </p>
                ) : (
                  <p className="text-xs text-amber-600 mt-1">
                    File System Access API not supported. Files will download to default folder.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Theme Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Palette className="w-5 h-5" />
                <span>Appearance</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm font-medium mb-3 block">UI Layout Style</Label>
                <div className="grid grid-cols-1 gap-3">
                  {uiLayouts.map((layoutOption) => (
                    <div
                      key={layoutOption.id}
                      className={`border rounded-lg p-3 cursor-pointer transition-all hover:bg-muted/50 ${
                        layout === layoutOption.id ? 'border-primary bg-primary/10' : 'border-border'
                      }`}
                      onClick={() => {
                        setLayout(layoutOption.id as any);
                        saveSettings({ ...settings, uiLayout: layoutOption.id as any });
                      }}
                      data-testid={`layout-${layoutOption.id}`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="flex-1">
                          <p className="text-sm font-medium">{layoutOption.name}</p>
                          <p className="text-xs text-muted-foreground">{layoutOption.description}</p>
                        </div>
                        {layout === layoutOption.id && (
                          <CheckCircle className="w-5 h-5 text-primary" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {settings.darkMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                  <Label className="text-sm font-medium">Dark Mode</Label>
                </div>
                <Switch
                  checked={settings.darkMode}
                  onCheckedChange={(checked) => saveSettings({ ...settings, darkMode: checked })}
                  data-testid="switch-dark-mode"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Storage & Data Management */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <HardDrive className="w-5 h-5" />
                <span>Storage Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/30 p-4 rounded-lg">
                  <p className="text-sm font-medium text-muted-foreground">Total Downloads</p>
                  <p className="text-2xl font-bold">{storageInfo.totalDownloads}</p>
                </div>
                
                <div className="bg-muted/30 p-4 rounded-lg">
                  <p className="text-sm font-medium text-muted-foreground">Downloaded Size</p>
                  <p className="text-2xl font-bold">{formatFileSize(storageInfo.totalSize)}</p>
                </div>
              </div>

              {storageInfo.storageQuota > 0 && (
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Browser Storage</span>
                    <span>{formatFileSize(storageInfo.storageUsed)} / {formatFileSize(storageInfo.storageQuota)}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div 
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(storageInfo.storageUsed / storageInfo.storageQuota) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {((storageInfo.storageUsed / storageInfo.storageQuota) * 100).toFixed(1)}% used
                  </p>
                </div>
              )}

              <Separator />

              <div className="space-y-2">
                <Button
                  variant="outline"
                  onClick={() => clearDownloads.mutate()}
                  disabled={clearDownloads.isPending}
                  className="w-full justify-start"
                  data-testid="button-clear-downloads"
                >
                  {clearDownloads.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Database className="mr-2 h-4 w-4" />
                  Clear Download History
                </Button>

                <Button
                  variant="destructive"
                  onClick={() => clearAllData.mutate()}
                  disabled={clearAllData.isPending}
                  className="w-full justify-start"
                  data-testid="button-clear-all-data"
                >
                  {clearAllData.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear All Data
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Application Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">File System Access API</span>
                  <Badge variant={downloadManager.hasFileSystemSupport() ? 'default' : 'secondary'}>
                    {downloadManager.hasFileSystemSupport() ? (
                      <>
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Supported
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Not Supported
                      </>
                    )}
                  </Badge>
                </div>

                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">IndexedDB</span>
                  <Badge variant="default">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Available
                  </Badge>
                </div>

                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Active Downloads</span>
                  <Badge variant="secondary">
                    {downloadManager.getActiveDownloadCount()}
                  </Badge>
                </div>
              </div>

              <Separator />

              <div className="text-center">
                <p className="text-xs text-muted-foreground">
                  Telegram Manager v1.0.0
                </p>
                <p className="text-xs text-muted-foreground">
                  Built with gramjs and React
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
