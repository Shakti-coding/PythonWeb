import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Download,
  Video,
  Image,
  FileText,
  Link,
  Search,
  FolderOpen,
  Loader2,
  CheckCircle,
  AlertCircle,
  Calendar,
  Hash,
  Filter,
  Smartphone,
  HardDrive,
  X,
  Pause,
  Play,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { storage } from '@/lib/storage';
import { telegramManager } from '@/lib/telegram';
import { downloadManager } from '@/lib/downloads';
import type { Chat, Message, DownloadItem } from '@shared/schema';

type ContentFilter = 'all' | 'images' | 'videos' | 'files' | 'links';

export function VideoDownloads() {
  const [selectedChat, setSelectedChat] = useState<string>('');
  const [contentFilter, setContentFilter] = useState<ContentFilter>('all');
  const [selectedMessages, setSelectedMessages] = useState<Set<number>>(new Set());
  const [messageIdRange, setMessageIdRange] = useState({ from: '', to: '' });
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [specificDate, setSpecificDate] = useState('');
  const [wordSearch, setWordSearch] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isSelectingFolder, setIsSelectingFolder] = useState(false);
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [wordSearchResults, setWordSearchResults] = useState<Message[]>([]);
  const [downloadMode, setDownloadMode] = useState<'id_range' | 'date_range' | 'specific_date' | 'word_search'>('id_range');
  const [searchInWholeMessage, setSearchInWholeMessage] = useState(true);
  const [streamingVideo, setStreamingVideo] = useState<Message | null>(null);
  const [streamingUrl, setStreamingUrl] = useState<string | null>(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch chats
  const { data: chats = [] } = useQuery<Chat[]>({
    queryKey: ['chats'],
    queryFn: async () => {
      return await storage.getChats();
    },
  });

  // Fetch download history
  const { data: downloads = [] } = useQuery<DownloadItem[]>({
    queryKey: ['downloads'],
    queryFn: async () => {
      return await storage.getDownloads();
    },
    refetchInterval: 1000,
  });

  const searchDownloadableContent = useMutation({
    mutationFn: async ({ chatId }: { chatId: string }) => {
      setIsSearching(true);
      
      try {
        // Get all messages from the chat
        const messages = await telegramManager.getMessages(chatId, {
          limit: 50000, // Large limit to get everything
        });
        
        // Save to storage
        await storage.saveMessages(messages);
        
        // Filter messages that have downloadable content
        const downloadableMessages = messages.filter(msg => {
          return msg.hasMedia || 
                 msg.text?.includes('http') || 
                 msg.text?.includes('www.') ||
                 msg.text?.includes('t.me/') ||
                 msg.text?.includes('.com') ||
                 msg.text?.includes('.org') ||
                 msg.text?.includes('.net');
        });
        
        return downloadableMessages;
      } finally {
        setIsSearching(false);
      }
    },
    onSuccess: (results) => {
      setSearchResults(results);
      toast({
        title: 'Content search completed',
        description: `Found ${results.length} messages with downloadable content`,
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Search failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const selectDownloadFolder = useMutation({
    mutationFn: async () => {
      setIsSelectingFolder(true);
      
      if (downloadManager.isMobileDevice()) {
        // For mobile, we'll just use the fallback download
        toast({
          title: 'Mobile detected',
          description: 'Files will download to your default download folder',
        });
        return false;
      }
      
      const success = await downloadManager.selectDownloadDirectory();
      return success;
    },
    onSuccess: (success) => {
      if (success) {
        toast({
          title: 'Download folder selected',
          description: 'Files will be downloaded to the selected folder',
        });
      }
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to select folder',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
    onSettled: () => {
      setIsSelectingFolder(false);
    },
  });

  const downloadFile = useMutation({
    mutationFn: async ({ message }: { message: Message }) => {
      const downloadItem: DownloadItem = {
        id: `${message.chatId}-${message.id}-${Date.now()}`,
        messageId: message.id,
        chatId: message.chatId,
        fileName: message.mediaFileName || `${message.mediaType || 'file'}_${message.id}`,
        fileSize: message.mediaSize || 0,
        progress: 0,
        status: 'pending',
      };

      await storage.saveDownload(downloadItem);

      const dataProvider = (onProgress: (progress: number, speed: number) => void) => {
        return telegramManager.downloadFile(message.id, message.chatId, onProgress);
      };

      const fileName = await downloadManager.downloadWithProgress(
        downloadItem,
        dataProvider,
        (progress, speed) => {
          queryClient.invalidateQueries({ queryKey: ['downloads'] });
        }
      );

      return fileName;
    },
    onSuccess: (fileName) => {
      const downloadMethod = downloadManager.isDownloadDirectorySelected() 
        ? 'saved to your selected folder' 
        : 'downloaded to your default location';
      
      toast({
        title: 'Download completed',
        description: `${fileName} has been ${downloadMethod}`,
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Download failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const downloadByRange = useMutation({
    mutationFn: async ({ fromId, toId }: { fromId: number; toId: number }) => {
      const messagesInRange = filteredResults.filter(
        msg => msg.id >= fromId && msg.id <= toId
      );

      if (messagesInRange.length === 0) {
        throw new Error('No downloadable content found in the specified ID range');
      }

      let successCount = 0;
      for (const message of messagesInRange) {
        try {
          await downloadFile.mutateAsync({ message });
          successCount++;
        } catch (error) {
          console.error(`Failed to download message ${message.id}:`, error);
        }
      }

      return { total: messagesInRange.length, successful: successCount };
    },
    onSuccess: ({ total, successful }) => {
      toast({
        title: 'Bulk download completed',
        description: `Downloaded ${successful} out of ${total} files`,
      });
      setSelectedMessages(new Set());
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Bulk download failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const downloadByDateRange = useMutation({
    mutationFn: async ({ fromDate, toDate }: { fromDate: string; toDate: string }) => {
      const startDate = new Date(fromDate);
      const endDate = new Date(toDate);
      endDate.setHours(23, 59, 59, 999); // Include the entire end date

      const messagesInDateRange = filteredResults.filter(msg => {
        const messageDate = new Date(msg.date);
        return messageDate >= startDate && messageDate <= endDate;
      });

      if (messagesInDateRange.length === 0) {
        throw new Error('No downloadable content found in the specified date range');
      }

      let successCount = 0;
      for (const message of messagesInDateRange) {
        try {
          await downloadFile.mutateAsync({ message });
          successCount++;
        } catch (error) {
          console.error(`Failed to download message ${message.id}:`, error);
        }
      }

      return { total: messagesInDateRange.length, successful: successCount };
    },
    onSuccess: ({ total, successful }) => {
      toast({
        title: 'Date range download completed',
        description: `Downloaded ${successful} out of ${total} files`,
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Date range download failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const downloadBySpecificDate = useMutation({
    mutationFn: async ({ targetDate }: { targetDate: string }) => {
      const searchDate = new Date(targetDate);
      const nextDay = new Date(searchDate);
      nextDay.setDate(nextDay.getDate() + 1);

      const messagesOnDate = filteredResults.filter(msg => {
        const messageDate = new Date(msg.date);
        return messageDate >= searchDate && messageDate < nextDay;
      });

      if (messagesOnDate.length === 0) {
        throw new Error('No downloadable content found on the specified date');
      }

      let successCount = 0;
      for (const message of messagesOnDate) {
        try {
          await downloadFile.mutateAsync({ message });
          successCount++;
        } catch (error) {
          console.error(`Failed to download message ${message.id}:`, error);
        }
      }

      return { total: messagesOnDate.length, successful: successCount };
    },
    onSuccess: ({ total, successful }) => {
      toast({
        title: 'Date download completed',
        description: `Downloaded ${successful} out of ${total} files`,
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Date download failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const searchByWords = useMutation({
    mutationFn: async ({ query }: { query: string }) => {
      // Search using Telegram-like search functionality
      const words = query.toLowerCase().split(' ').filter(word => word.length > 0);
      
      const matchingMessages = filteredResults.filter(msg => {
        let searchText: string;
        
        if (searchInWholeMessage) {
          // Search in whole message (text + filename + sender)
          searchText = (
            (msg.text || '') + ' ' + 
            (msg.mediaFileName || '') + ' ' + 
            (msg.senderName || '')
          ).toLowerCase();
        } else {
          // Search only in title/filename
          searchText = (msg.mediaFileName || msg.text?.split('\n')[0] || '').toLowerCase();
        }
        
        // All words must be found (AND logic like Telegram)
        return words.every(word => searchText.includes(word));
      });

      return matchingMessages;
    },
    onSuccess: (results) => {
      setWordSearchResults(results);
      toast({
        title: 'Word search completed',
        description: `Found ${results.length} messages matching your search`,
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Search failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const downloadSelectedMessages = useMutation({
    mutationFn: async () => {
      const messagesToDownload = wordSearchResults.filter(msg => 
        selectedMessages.has(msg.id)
      );

      if (messagesToDownload.length === 0) {
        throw new Error('No messages selected for download');
      }

      let successCount = 0;
      for (const message of messagesToDownload) {
        try {
          await downloadFile.mutateAsync({ message });
          successCount++;
        } catch (error) {
          console.error(`Failed to download message ${message.id}:`, error);
        }
      }

      return { total: messagesToDownload.length, successful: successCount };
    },
    onSuccess: ({ total, successful }) => {
      toast({
        title: 'Selected downloads completed',
        description: `Downloaded ${successful} out of ${total} selected files`,
      });
      setSelectedMessages(new Set());
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Selected downloads failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  // Handle video streaming
  const handleStreamVideo = async (message: Message) => {
    try {
      setStreamingVideo(message);
      setStreamingUrl(null);
      
      // Check if Telegram client is connected
      if (!telegramManager.isConnected()) {
        toast({
          variant: 'destructive',
          title: 'Not connected',
          description: 'Please connect to Telegram first to stream videos.',
        });
        setStreamingVideo(null);
        return;
      }
      
      toast({
        title: 'Loading video',
        description: `Downloading ${message.mediaFileName || 'video'} for streaming...`,
      });
      
      console.log('Starting video download for streaming:', {
        messageId: message.id,
        chatId: message.chatId,
        fileName: message.mediaFileName,
        mediaType: message.mediaType
      });
      
      // Download video data from Telegram with better progress tracking
      const videoData = await telegramManager.downloadFile(
        message.id, 
        message.chatId,
        (progress, speed) => {
          console.log(`Download progress: ${progress}%, Speed: ${(speed / 1024 / 1024).toFixed(2)} MB/s`);
          // Show progress in toast every 25%
          if (progress > 0 && progress % 25 === 0) {
            toast({
              title: 'Loading video',
              description: `Progress: ${Math.round(progress)}% (${(speed / 1024 / 1024).toFixed(1)} MB/s)`,
            });
          }
        }
      );
      
      console.log('Video download completed, size:', videoData.length, 'bytes');
      
      // Determine video type based on file extension or media type
      let mimeType = 'video/mp4'; // default
      if (message.mediaFileName) {
        const extension = message.mediaFileName.split('.').pop()?.toLowerCase();
        switch (extension) {
          case 'webm':
            mimeType = 'video/webm';
            break;
          case 'ogg':
          case 'ogv':
            mimeType = 'video/ogg';
            break;
          case 'mov':
            mimeType = 'video/quicktime';
            break;
          case 'avi':
            mimeType = 'video/x-msvideo';
            break;
          case 'mkv':
            mimeType = 'video/x-matroska';
            break;
          default:
            mimeType = 'video/mp4';
        }
      }
      
      // Create blob URL for streaming
      const videoBlob = new Blob([videoData], { type: mimeType });
      const blobUrl = URL.createObjectURL(videoBlob);
      setStreamingUrl(blobUrl);
      
      console.log('Video blob created:', {
        size: videoBlob.size,
        type: videoBlob.type,
        blobUrl: blobUrl
      });
      
      toast({
        title: 'Video ready',
        description: 'Video is ready to stream!',
      });
    } catch (error) {
      console.error('Video streaming error:', error);
      toast({
        variant: 'destructive',
        title: 'Streaming failed',
        description: error instanceof Error ? error.message : 'Failed to load video for streaming',
      });
      setStreamingVideo(null);
    }
  };

  const getContentIcon = (message: Message) => {
    if (message.hasMedia) {
      switch (message.mediaType) {
        case 'video':
          return <Video className="w-4 h-4 text-red-500" />;
        case 'photo':
        case 'image':
          return <Image className="w-4 h-4 text-blue-500" />;
        case 'document':
          return <FileText className="w-4 h-4 text-green-500" />;
        default:
          return <FileText className="w-4 h-4 text-gray-500" />;
      }
    } else if (message.text && (
      message.text.includes('http') || 
      message.text.includes('www.') ||
      message.text.includes('t.me/')
    )) {
      return <Link className="w-4 h-4 text-purple-500" />;
    }
    return <FileText className="w-4 h-4 text-gray-500" />;
  };

  const getContentType = (message: Message): ContentFilter => {
    if (message.hasMedia) {
      switch (message.mediaType) {
        case 'video':
          return 'videos';
        case 'photo':
        case 'image':
          return 'images';
        case 'document':
        default:
          return 'files';
      }
    } else if (message.text && (
      message.text.includes('http') || 
      message.text.includes('www.') ||
      message.text.includes('t.me/')
    )) {
      return 'links';
    }
    return 'files';
  };

  const filteredResults = searchResults.filter(message => {
    if (contentFilter === 'all') return true;
    return getContentType(message) === contentFilter;
  });

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const selectedChat_info = chats.find(chat => chat.id === selectedChat);
  const isMobile = downloadManager.isMobileDevice();

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2">Smart Downloads</h2>
        <p className="text-muted-foreground">
          Search and download all types of content from your chats
        </p>
      </div>

      {/* Download Options */}
      <Card className="mb-6 border-blue-500/30 bg-blue-500/5">
        <CardContent className="p-6">
          <div className="flex items-start space-x-4">
            {isMobile ? (
              <Smartphone className="w-8 h-8 text-blue-500 mt-1" />
            ) : (
              <HardDrive className="w-8 h-8 text-blue-500 mt-1" />
            )}
            <div className="flex-1">
              <h3 className="font-semibold text-blue-700 dark:text-blue-400 mb-2">
                {isMobile ? 'Mobile Download' : 'Download Options'}
              </h3>
              {isMobile ? (
                <p className="text-sm text-blue-600 dark:text-blue-300 mb-4">
                  📱 Mobile detected! Files will download to your browser's default download folder.
                </p>
              ) : (
                <>
                  <p className="text-sm text-blue-600 dark:text-blue-300 mb-4">
                    {downloadManager.isDownloadDirectorySelected() 
                      ? '✅ Custom download folder selected' 
                      : 'Select a specific folder or use your default download location'}
                  </p>
                  <div className="flex space-x-3">
                    {!downloadManager.isDownloadDirectorySelected() && (
                      <Button
                        onClick={() => selectDownloadFolder.mutate()}
                        disabled={isSelectingFolder}
                        className="bg-blue-500 hover:bg-blue-600 text-white"
                        data-testid="button-setup-folder"
                      >
                        {isSelectingFolder && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <FolderOpen className="mr-2 h-4 w-4" />
                        Choose Download Folder
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => {
                        downloadManager.setUseDefaultDownload(true);
                        toast({
                          title: 'Default download enabled',
                          description: 'Files will download to your browser default location',
                        });
                      }}
                      className="bg-green-50 hover:bg-green-100 text-green-700 border-green-300"
                      data-testid="button-default-download"
                    >
                      Default
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Search Controls */}
        <div className="lg:col-span-1 space-y-6">
          {/* Chat Selection */}
          <Card>
            <CardHeader>
              <CardTitle>1. Select Chat</CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={selectedChat}
                onValueChange={setSelectedChat}
                data-testid="select-chat"
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a chat..." />
                </SelectTrigger>
                <SelectContent>
                  {chats.map((chat) => (
                    <SelectItem key={chat.id} value={chat.id}>
                      {chat.title} ({chat.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedChat && (
                <div className="mt-4">
                  <Button
                    onClick={() => searchDownloadableContent.mutate({ chatId: selectedChat })}
                    disabled={isSearching}
                    className="w-full"
                    data-testid="button-search-content"
                  >
                    {isSearching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Search className="mr-2 h-4 w-4" />
                    Search All Downloadable Content
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Content Filters */}
          {searchResults.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>2. Filter Content</CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs value={contentFilter} onValueChange={(value) => setContentFilter(value as ContentFilter)}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="all">All ({searchResults.length})</TabsTrigger>
                    <TabsTrigger value="videos">Videos</TabsTrigger>
                  </TabsList>
                  <TabsList className="grid w-full grid-cols-2 mt-2">
                    <TabsTrigger value="images">Images</TabsTrigger>
                    <TabsTrigger value="files">Files</TabsTrigger>
                  </TabsList>
                  <TabsList className="grid w-full grid-cols-1 mt-2">
                    <TabsTrigger value="links">Links</TabsTrigger>
                  </TabsList>
                </Tabs>
              </CardContent>
            </Card>
          )}

          {/* Download Options */}
          {filteredResults.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>3. Download Options</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Tabs value={downloadMode} onValueChange={(value) => setDownloadMode(value as typeof downloadMode)}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="id_range">ID Range</TabsTrigger>
                    <TabsTrigger value="date_range">Date Range</TabsTrigger>
                  </TabsList>
                  <TabsList className="grid w-full grid-cols-2 mt-1">
                    <TabsTrigger value="specific_date">Specific Date</TabsTrigger>
                    <TabsTrigger value="word_search">Word Search</TabsTrigger>
                  </TabsList>
                </Tabs>

                {/* Message ID Range */}
                {downloadMode === 'id_range' && (
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Message ID Range</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        placeholder="From ID"
                        value={messageIdRange.from}
                        onChange={(e) => setMessageIdRange(prev => ({ ...prev, from: e.target.value }))}
                        data-testid="input-range-from"
                      />
                      <Input
                        type="number"
                        placeholder="To ID"
                        value={messageIdRange.to}
                        onChange={(e) => setMessageIdRange(prev => ({ ...prev, to: e.target.value }))}
                        data-testid="input-range-to"
                      />
                    </div>
                    <Button
                      onClick={() => {
                        const fromId = parseInt(messageIdRange.from);
                        const toId = parseInt(messageIdRange.to);
                        if (fromId && toId) {
                          downloadByRange.mutate({ fromId, toId });
                        }
                      }}
                      disabled={!messageIdRange.from || !messageIdRange.to || downloadByRange.isPending}
                      className="w-full"
                      data-testid="button-download-range"
                    >
                      {downloadByRange.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      <Hash className="mr-2 h-4 w-4" />
                      Download ID Range
                    </Button>
                  </div>
                )}

                {/* Date Range */}
                {downloadMode === 'date_range' && (
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Date Range</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="date"
                        value={dateRange.from}
                        onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                        data-testid="input-date-from"
                      />
                      <Input
                        type="date"
                        value={dateRange.to}
                        onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                        data-testid="input-date-to"
                      />
                    </div>
                    <Button
                      onClick={() => {
                        if (dateRange.from && dateRange.to) {
                          downloadByDateRange.mutate({ fromDate: dateRange.from, toDate: dateRange.to });
                        }
                      }}
                      disabled={!dateRange.from || !dateRange.to || downloadByDateRange.isPending}
                      className="w-full"
                      data-testid="button-download-date-range"
                    >
                      {downloadByDateRange.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      <Calendar className="mr-2 h-4 w-4" />
                      Download Date Range
                    </Button>
                  </div>
                )}

                {/* Specific Date */}
                {downloadMode === 'specific_date' && (
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Specific Date</Label>
                    <Input
                      type="date"
                      value={specificDate}
                      onChange={(e) => setSpecificDate(e.target.value)}
                      data-testid="input-specific-date"
                    />
                    <Button
                      onClick={() => {
                        if (specificDate) {
                          downloadBySpecificDate.mutate({ targetDate: specificDate });
                        }
                      }}
                      disabled={!specificDate || downloadBySpecificDate.isPending}
                      className="w-full"
                      data-testid="button-download-specific-date"
                    >
                      {downloadBySpecificDate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      <Calendar className="mr-2 h-4 w-4" />
                      Download Specific Date
                    </Button>
                  </div>
                )}

                {/* Word Search */}
                {downloadMode === 'word_search' && (
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Search Words (Telegram-like search)</Label>
                    
                    {/* Search Scope Toggle */}
                    <div className="flex items-center space-x-2 p-3 bg-muted/30 rounded-lg">
                      <Checkbox
                        id="search-scope"
                        checked={searchInWholeMessage}
                        onCheckedChange={(checked) => setSearchInWholeMessage(checked === true)}
                        data-testid="checkbox-search-scope"
                      />
                      <Label htmlFor="search-scope" className="text-sm cursor-pointer">
                        Search in whole message (unchecked = search only in title/filename)
                      </Label>
                    </div>
                    
                    <div className="flex space-x-2">
                      <Input
                        placeholder={searchInWholeMessage ? "Search in messages and filenames..." : "Search only in titles/filenames..."}
                        value={wordSearch}
                        onChange={(e) => setWordSearch(e.target.value)}
                        data-testid="input-word-search"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && wordSearch.trim()) {
                            searchByWords.mutate({ query: wordSearch.trim() });
                          }
                        }}
                      />
                      <Button
                        onClick={() => {
                          if (wordSearch.trim()) {
                            searchByWords.mutate({ query: wordSearch.trim() });
                          }
                        }}
                        disabled={!wordSearch.trim() || searchByWords.isPending}
                        data-testid="button-search-words"
                      >
                        {searchByWords.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <Search className="w-4 h-4" />
                      </Button>
                    </div>
                    
                    {wordSearchResults.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium">
                            Found {wordSearchResults.length} results
                          </Label>
                          <div className="flex space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const allIds = new Set(wordSearchResults.map(msg => msg.id));
                                setSelectedMessages(allIds);
                              }}
                              data-testid="button-select-all"
                            >
                              Select All
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedMessages(new Set())}
                              data-testid="button-deselect-all"
                            >
                              Deselect All
                            </Button>
                          </div>
                        </div>
                        
                        <div className="max-h-48 overflow-y-auto space-y-2 border rounded p-2">
                          {wordSearchResults.map((message) => (
                            <div key={message.id} className="flex items-center space-x-2 p-2 hover:bg-muted/50 rounded">
                              <Checkbox
                                checked={selectedMessages.has(message.id)}
                                onCheckedChange={(checked) => {
                                  const newSelected = new Set(selectedMessages);
                                  if (checked) {
                                    newSelected.add(message.id);
                                  } else {
                                    newSelected.delete(message.id);
                                  }
                                  setSelectedMessages(newSelected);
                                }}
                                data-testid={`checkbox-${message.id}`}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {message.mediaFileName || `Message ${message.id}`}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {message.text ? message.text.substring(0, 60) + '...' : 'Media file'}
                                </p>
                              </div>
                              <Badge variant="secondary" className="text-xs">
                                {getContentType(message)}
                              </Badge>
                            </div>
                          ))}
                        </div>
                        
                        <Button
                          onClick={() => downloadSelectedMessages.mutate()}
                          disabled={selectedMessages.size === 0 || downloadSelectedMessages.isPending}
                          className="w-full"
                          data-testid="button-download-selected"
                        >
                          {downloadSelectedMessages.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          <Download className="mr-2 h-4 w-4" />
                          Download Selected ({selectedMessages.size})
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Search Results */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Downloadable Content
                <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                  <span data-testid="content-results-count">
                    {filteredResults.length} items found
                  </span>
                  {selectedChat_info && (
                    <span>in {selectedChat_info.title}</span>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isSearching ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin mb-3" />
                  <span className="text-sm font-medium">Searching for downloadable content...</span>
                  <span className="text-xs text-muted-foreground mt-1">
                    Scanning entire chat history for files, videos, images, and links
                  </span>
                </div>
              ) : filteredResults.length > 0 ? (
                <div className="space-y-4 max-h-[600px] overflow-y-auto">
                  {filteredResults.map((message) => (
                    <div
                      key={`${message.chatId}-${message.id}`}
                      className="content-card bg-muted/30 p-4 rounded-lg border border-border hover:shadow-lg transition-all duration-200"
                      data-testid={`content-${message.id}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          {getContentIcon(message)}
                          <div>
                            <p className="text-sm font-medium">
                              {message.senderName || 'Unknown'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(message.date).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge variant="secondary" className="text-xs">
                            {getContentType(message)}
                          </Badge>
                          {message.hasMedia && message.mediaType === 'video' && (
                            <Button
                              onClick={() => handleStreamVideo(message)}
                              variant="outline"
                              size="sm"
                              data-testid={`stream-${message.id}`}
                            >
                              <Play className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            onClick={() => downloadFile.mutate({ message })}
                            disabled={downloadFile.isPending}
                            size="sm"
                            data-testid={`download-${message.id}`}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      {message.text && (
                        <p className="text-sm text-foreground mb-3 line-clamp-2">
                          {message.text}
                        </p>
                      )}

                      {message.hasMedia && (
                        <div className="flex items-center space-x-2 mb-3">
                          <Badge variant="outline" className="text-xs">
                            {message.mediaType?.toUpperCase() || 'MEDIA'}
                          </Badge>
                          {message.mediaSize && (
                            <span className="text-xs text-muted-foreground">
                              {formatFileSize(message.mediaSize)}
                            </span>
                          )}
                          {message.mediaFileName && (
                            <span className="text-xs text-muted-foreground truncate">
                              {message.mediaFileName}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>ID: {message.id}</span>
                        <span>{new Date(message.date).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : searchResults.length === 0 && selectedChat ? (
                <div className="text-center py-8">
                  <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    Click "Search All Downloadable Content" to find files, videos, images, and links in this chat.
                  </p>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Filter className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    Select a chat first to search for downloadable content.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Active Downloads */}
      {downloads.filter(d => d.status === 'downloading' || d.status === 'paused').length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Active Downloads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {downloads
                .filter(d => d.status === 'downloading' || d.status === 'paused')
                .map((download) => (
                  <div key={download.id} className="flex items-center space-x-4">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{download.fileName}</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-muted-foreground">
                            {download.progress}% {download.status === 'paused' ? '(Paused)' : ''}
                          </span>
                          {download.status === 'downloading' ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                await downloadManager.pauseDownload(download.id);
                                queryClient.invalidateQueries({ queryKey: ['downloads'] });
                                toast({
                                  title: 'Download paused',
                                  description: 'The download has been paused instantly',
                                });
                              }}
                              className="h-6 w-6 p-0 text-yellow-500 hover:text-yellow-700 hover:bg-yellow-50 dark:hover:bg-yellow-950"
                              data-testid={`pause-${download.id}`}
                            >
                              <Pause className="w-4 h-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                // Resume download - you might need to implement proper resume logic
                                // For now, we'll update status back to downloading
                                const downloads = await storage.getDownloads();
                                const downloadToResume = downloads.find(d => d.id === download.id);
                                if (downloadToResume) {
                                  downloadToResume.status = 'downloading';
                                  await storage.saveDownload(downloadToResume);
                                  queryClient.invalidateQueries({ queryKey: ['downloads'] });
                                  toast({
                                    title: 'Download resumed',
                                    description: 'The download has been resumed',
                                  });
                                }
                              }}
                              className="h-6 w-6 p-0 text-green-500 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
                              data-testid={`resume-${download.id}`}
                            >
                              <Play className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              await downloadManager.cancelDownload(download.id);
                              // Remove from storage immediately
                              const allDownloads = await storage.getDownloads();
                              const filteredDownloads = allDownloads.filter(d => d.id !== download.id);
                              for (const dl of filteredDownloads) {
                                await storage.saveDownload(dl);
                              }
                              queryClient.invalidateQueries({ queryKey: ['downloads'] });
                              toast({
                                title: 'Download cancelled',
                                description: 'The download has been stopped and deleted instantly',
                              });
                            }}
                            className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                            data-testid={`cancel-${download.id}`}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      <Progress value={download.progress} className="h-2" />
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Video Player Modal */}
      <Dialog open={!!streamingVideo} onOpenChange={(open) => {
        if (!open) {
          // Clean up blob URL to prevent memory leaks
          if (streamingUrl && streamingUrl.startsWith('blob:')) {
            URL.revokeObjectURL(streamingUrl);
          }
          setStreamingVideo(null);
          setStreamingUrl(null);
        }
      }}>
        <DialogContent className="max-w-4xl w-[90vw] h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              Video Player - {streamingVideo?.mediaFileName || `Video ${streamingVideo?.id}`}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 flex items-center justify-center bg-black rounded-lg overflow-hidden">
            {!streamingUrl && streamingVideo && (
              <div className="flex flex-col items-center justify-center text-white space-y-4">
                <Loader2 className="w-8 h-8 animate-spin" />
                <p className="text-sm">Loading video for streaming...</p>
              </div>
            )}
            {streamingUrl && (
              <video
                key={streamingUrl}
                controls
                autoPlay
                preload="metadata"
                className="w-full h-full object-contain"
                data-testid="video-player"
                style={{ maxHeight: '70vh' }}
                onError={(e) => {
                  console.error('Video playback error:', e);
                  const target = e.target as HTMLVideoElement;
                  const errorCode = target.error?.code;
                  let errorMessage = 'Unable to play this video.';
                  
                  switch (errorCode) {
                    case MediaError.MEDIA_ERR_ABORTED:
                      errorMessage = 'Video playback was aborted.';
                      break;
                    case MediaError.MEDIA_ERR_NETWORK:
                      errorMessage = 'Network error occurred while loading video.';
                      break;
                    case MediaError.MEDIA_ERR_DECODE:
                      errorMessage = 'Video format is not supported or corrupted.';
                      break;
                    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                      errorMessage = 'Video format is not supported by your browser.';
                      break;
                    default:
                      errorMessage = 'Unknown video playback error occurred.';
                  }
                  
                  toast({
                    variant: 'destructive',
                    title: 'Video playback failed',
                    description: errorMessage,
                  });
                }}
                onLoadStart={() => {
                  console.log('Video loading started');
                }}
                onLoadedMetadata={() => {
                  console.log('Video metadata loaded');
                }}
                onCanPlay={() => {
                  console.log('Video can start playing');
                }}
                onLoadedData={() => {
                  console.log('Video data loaded');
                }}
              >
                <source src={streamingUrl} />
                Your browser does not support the video tag.
              </video>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}