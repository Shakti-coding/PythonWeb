import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Users, Hash, User, Video, Calendar, Search as SearchIcon, 
  Download, ArrowRight, Loader2, CheckCircle, AlertCircle,
  FolderOpen, HardDrive, Smartphone, X
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { storage } from '@/lib/storage';
import { telegramManager } from '@/lib/telegram';
import { downloadManager } from '@/lib/downloads';
import { SimilarityMatcher } from '@/lib/similarity';
import type { Chat, Message, DownloadItem } from '@shared/schema';

export function PythonScriptMain() {
  const [currentStep, setCurrentStep] = useState<'select_chat' | 'choose_mode' | 'execute'>('select_chat');
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [selectedMode, setSelectedMode] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [messageId, setMessageId] = useState('');
  const [specificDate, setSpecificDate] = useState('');
  const [downloadRange, setDownloadRange] = useState('');
  const [results, setResults] = useState<any>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [videos, setVideos] = useState<any[]>([]);
  const [isSelectingFolder, setIsSelectingFolder] = useState(false);
  const [searchInWholeMessage, setSearchInWholeMessage] = useState(true);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch chats
  const { data: chats = [], isLoading } = useQuery<Chat[]>({
    queryKey: ['chats'],
    queryFn: async () => {
      const storedChats = await storage.getChats();
      if (storedChats.length === 0) {
        // Fetch fresh chats if none stored
        const freshChats = await telegramManager.getChats();
        await storage.saveChats(freshChats);
        return freshChats;
      }
      return storedChats;
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

  const modes = [
    { id: 'range', title: '📅 Get message info by date range', description: 'Count messages between specific dates' },
    { id: 'total', title: '📈 Get total number of messages', description: 'Count all messages in this chat' },
    { id: 'approx', title: '🧠 Get message ID from approximate message', description: 'Find similar messages with 85% threshold' },
    { id: 'id', title: '🔢 Get message text and date from Message ID', description: 'Lookup specific message by ID' },
    { id: 'day', title: '📆 Get ALL messages on a specific date', description: 'Show messages from a specific date' },
    { id: 'video', title: '🎥 Download videos from last 50 messages', description: 'Download videos by ID or ID range' },
  ];

  const handleChatSelect = (chat: Chat) => {
    setSelectedChat(chat);
    setCurrentStep('choose_mode');
    toast({
      title: 'Chat Selected',
      description: `Selected ${chat.title} (ID: ${chat.id})`,
    });
  };

  const handleModeSelect = (mode: string) => {
    setSelectedMode(mode);
    setCurrentStep('execute');
  };

  const executeMode = useMutation({
    mutationFn: async () => {
      if (!selectedChat || !selectedMode) return;

      setIsExecuting(true);
      
      switch (selectedMode) {
        case 'range':
          return await executeDateRange();
        case 'total':
          return await executeTotalCount();
        case 'approx':
          return await executeApproximateSearch();
        case 'id':
          return await executeMessageById();
        case 'day':
          return await executeMessagesByDate();
        case 'video':
          return await executeVideoDownload();
      }
    },
    onSuccess: (result) => {
      setResults(result);
      setIsExecuting(false);
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Operation failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
      setIsExecuting(false);
    },
  });

  const executeVideoDownload = async () => {
    if (!selectedChat) return;

    // Fetch last 50 messages for videos (exactly like Python script)
    const messages = await telegramManager.getMessages(selectedChat.id, { limit: 50 });
    const videoMessages = messages.filter(msg => 
      msg.hasMedia && msg.mediaType === 'video'
    );

    setVideos(videoMessages);

    if (videoMessages.length === 0) {
      return { type: 'error', message: '❌ No videos found.' };
    }

    return { 
      type: 'video_list', 
      videos: videoMessages.map(msg => ({
        id: msg.id,
        caption: msg.text || 'No caption',
        fileName: msg.mediaFileName || `${msg.id}.mp4`
      }))
    };
  };

  const selectDownloadFolder = useMutation({
    mutationFn: async () => {
      setIsSelectingFolder(true);
      
      if (downloadManager.isMobileDevice()) {
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
          description: 'Videos will be downloaded to the selected folder',
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

  const downloadVideo = useMutation({
    mutationFn: async ({ video }: { video: any }) => {
      const downloadItem: DownloadItem = {
        id: `${selectedChat!.id}-${video.id}-${Date.now()}`,
        messageId: video.id,
        chatId: selectedChat!.id,
        fileName: video.fileName || `video_${video.id}.mp4`,
        fileSize: 0, // We don't have size info in Python script mode
        progress: 0,
        status: 'pending',
      };

      await storage.saveDownload(downloadItem);

      const dataProvider = (onProgress: (progress: number, speed: number) => void) => {
        return telegramManager.downloadFile(video.id, selectedChat!.id, onProgress);
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

  const downloadVideos = async () => {
    if (!downloadRange) {
      toast({
        variant: 'destructive',
        title: 'Enter ID or range',
        description: 'Please enter video ID or range (e.g., 12345 or 12345-12350)',
      });
      return;
    }

    let ids: number[] = [];
    
    if (downloadRange.includes('-')) {
      const [start, end] = downloadRange.split('-').map(n => parseInt(n.trim()));
      ids = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    } else {
      ids = [parseInt(downloadRange.trim())];
    }

    let successCount = 0;
    for (const videoId of ids) {
      const video = videos.find(v => v.id === videoId);
      if (!video) {
        toast({
          variant: 'destructive',
          title: 'Video not found',
          description: `Video with ID ${videoId} not found in last 50 messages.`,
        });
        continue;
      }

      try {
        await downloadVideo.mutateAsync({ video });
        successCount++;
      } catch (error) {
        console.error(`Failed to download video ${videoId}:`, error);
      }
    }

    if (successCount > 0) {
      toast({
        title: 'Download batch completed',
        description: `Successfully downloaded ${successCount} out of ${ids.length} videos`,
      });
    }
  };

  const executeApproximateSearch = async () => {
    if (!searchQuery.trim()) {
      return { type: 'error', message: 'Please enter a message to search for' };
    }

    const messages = await telegramManager.getMessages(selectedChat!.id, { limit: 1000 });
    const matches = SimilarityMatcher.findSimilarMessages(
      searchQuery, 
      messages, 
      85, 
      searchInWholeMessage
    );

    if (matches.length === 0) {
      return { type: 'error', message: '❌ No similar message found.' };
    }

    return {
      type: 'similarity_results',
      matches: matches.slice(0, 5).map((match, index) => ({
        index: index + 1,
        similarity: Math.round(match.similarity),
        id: match.id,
        text: (match.text || '').substring(0, 300).replace(/\n/g, ' '),
      }))
    };
  };

  const executeMessageById = async () => {
    if (!messageId) {
      return { type: 'error', message: 'Please enter a message ID' };
    }

    const message = await telegramManager.getMessageById(selectedChat!.id, parseInt(messageId));
    if (!message) {
      return { type: 'error', message: '❌ No message found with that ID.' };
    }

    return {
      type: 'message_result',
      message: {
        id: message.id,
        text: message.text || 'No text',
        date: new Date(message.date).toLocaleString(),
      }
    };
  };

  const executeMessagesByDate = async () => {
    if (!specificDate) {
      return { type: 'error', message: 'Please enter a date (YYYY-MM-DD)' };
    }

    const targetDate = new Date(specificDate).toDateString();
    const messages = await telegramManager.getMessages(selectedChat!.id, { limit: 1000 });
    const dateMessages = messages.filter(msg => 
      new Date(msg.date).toDateString() === targetDate && msg.text
    );

    if (dateMessages.length === 0) {
      return { type: 'error', message: '❌ No messages found on that date.' };
    }

    return {
      type: 'date_messages',
      messages: dateMessages.map(msg => ({
        id: msg.id,
        text: (msg.text || '').substring(0, 300).replace(/\n/g, ' '),
      }))
    };
  };

  const executeTotalCount = async () => {
    const count = await telegramManager.countMessages(selectedChat!.id);
    return {
      type: 'total_count',
      count,
      chatName: selectedChat!.title
    };
  };

  const executeDateRange = async () => {
    if (!dateFrom || !dateTo) {
      return { type: 'error', message: 'Please enter both start and end dates' };
    }

    const messages = await telegramManager.getMessages(selectedChat!.id, {
      fromDate: new Date(dateFrom),
      toDate: new Date(dateTo),
      limit: 10000
    });

    return {
      type: 'date_range',
      from: dateFrom,
      to: dateTo,
      totalMessages: messages.length,
      firstMessageId: messages[0]?.id || 'None',
      lastMessageId: messages[messages.length - 1]?.id || 'None'
    };
  };

  const resetFlow = () => {
    setCurrentStep('select_chat');
    setSelectedChat(null);
    setSelectedMode(null);
    setResults(null);
    setSearchQuery('');
    setDateFrom('');
    setDateTo('');
    setMessageId('');
    setSpecificDate('');
    setDownloadRange('');
    setVideos([]);
  };

  const getTypeIcon = (type: Chat['type']) => {
    switch (type) {
      case 'channel': return <Hash className="w-4 h-4" />;
      case 'group': return <Users className="w-4 h-4" />;
      case 'private': return <User className="w-4 h-4" />;
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">🐍 Python Script Mode</h1>
          <p className="text-muted-foreground mb-4">
            Exact same workflow as your Telethon script - select chat, choose operation, execute
          </p>
          
          {/* Progress Steps */}
          <div className="flex items-center space-x-4 mb-6">
            <div className={`flex items-center space-x-2 ${currentStep === 'select_chat' ? 'text-primary' : 'text-green-500'}`}>
              <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-medium ${currentStep === 'select_chat' ? 'border-primary bg-primary text-primary-foreground' : 'border-green-500 bg-green-500 text-white'}`}>
                {currentStep === 'select_chat' ? '1' : <CheckCircle className="w-4 h-4" />}
              </div>
              <span className="font-medium">Select Chat</span>
            </div>
            
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
            
            <div className={`flex items-center space-x-2 ${currentStep === 'choose_mode' ? 'text-primary' : currentStep === 'execute' ? 'text-green-500' : 'text-muted-foreground'}`}>
              <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-medium ${currentStep === 'choose_mode' ? 'border-primary bg-primary text-primary-foreground' : currentStep === 'execute' ? 'border-green-500 bg-green-500 text-white' : 'border-muted-foreground'}`}>
                {currentStep === 'execute' ? <CheckCircle className="w-4 h-4" /> : '2'}
              </div>
              <span className="font-medium">Choose Mode</span>
            </div>
            
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
            
            <div className={`flex items-center space-x-2 ${currentStep === 'execute' ? 'text-primary' : 'text-muted-foreground'}`}>
              <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-medium ${currentStep === 'execute' ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground'}`}>
                3
              </div>
              <span className="font-medium">Execute</span>
            </div>
          </div>
        </div>

        {/* Step 1: Select Chat */}
        {currentStep === 'select_chat' && (
          <Card>
            <CardHeader>
              <CardTitle>📋 Select Chat (Just like Python script)</CardTitle>
              <p className="text-sm text-muted-foreground">Choose from your channels/groups/bots with IDs</p>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" />
                  Loading chats...
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {chats.map((chat) => (
                    <div
                      key={chat.id}
                      className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => handleChatSelect(chat)}
                    >
                      <div className="flex items-center space-x-3">
                        {getTypeIcon(chat.type)}
                        <div>
                          <p className="font-medium">{chat.title} (ID: {chat.id})</p>
                          <p className="text-sm text-muted-foreground">
                            {chat.participantCount ? `${chat.participantCount.toLocaleString()} members` : 'Private chat'}
                            {chat.username && ` • @${chat.username}`}
                          </p>
                        </div>
                      </div>
                      <Badge variant="secondary">{chat.type}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 2: Choose Mode */}
        {currentStep === 'choose_mode' && selectedChat && (
          <Card>
            <CardHeader>
              <CardTitle>🎯 Choose Mode for {selectedChat.title}</CardTitle>
              <p className="text-sm text-muted-foreground">What would you like to do? (Exact same options as Python script)</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {modes.map((mode) => (
                  <div
                    key={mode.id}
                    className="p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleModeSelect(mode.id)}
                  >
                    <h3 className="font-medium mb-2">{mode.title}</h3>
                    <p className="text-sm text-muted-foreground">{mode.description}</p>
                  </div>
                ))}
              </div>
              
              <div className="mt-6 pt-4 border-t">
                <Button variant="outline" onClick={resetFlow}>
                  ← Back to Chat Selection
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Execute */}
        {currentStep === 'execute' && selectedChat && selectedMode && (
          <div className="space-y-6">
            {/* Download Options (for video mode) */}
            {selectedMode === 'video' && (
              <Card className="border-blue-500/30 bg-blue-500/5">
                <CardContent className="p-6">
                  <div className="flex items-start space-x-4">
                    {downloadManager.isMobileDevice() ? (
                      <Smartphone className="w-8 h-8 text-blue-500 mt-1" />
                    ) : (
                      <HardDrive className="w-8 h-8 text-blue-500 mt-1" />
                    )}
                    <div className="flex-1">
                      <h3 className="font-semibold text-blue-700 dark:text-blue-400 mb-2">
                        {downloadManager.isMobileDevice() ? 'Mobile Download' : 'Download Options'}
                      </h3>
                      {downloadManager.isMobileDevice() ? (
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
                          {!downloadManager.isDownloadDirectorySelected() && (
                            <Button
                              onClick={() => selectDownloadFolder.mutate()}
                              disabled={isSelectingFolder}
                              className="bg-blue-500 hover:bg-blue-600 text-white"
                              data-testid="button-setup-folder-python"
                            >
                              {isSelectingFolder && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              <FolderOpen className="mr-2 h-4 w-4" />
                              Choose Download Folder
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Input Form */}
            <Card>
              <CardHeader>
                <CardTitle>
                  {modes.find(m => m.id === selectedMode)?.title}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Chat: {selectedChat.title} (ID: {selectedChat.id})
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Date Range Inputs */}
                {selectedMode === 'range' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Start Date (e.g., 2024-02-01)</Label>
                      <Input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        placeholder="2024-02-01"
                      />
                    </div>
                    <div>
                      <Label>End Date (e.g., 2025-07-01)</Label>
                      <Input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        placeholder="2025-07-01"
                      />
                    </div>
                  </div>
                )}

                {/* Similarity Search */}
                {selectedMode === 'approx' && (
                  <div className="space-y-3">
                    <Label>Paste the message to search (85% similarity threshold)</Label>
                    
                    {/* Search Scope Toggle */}
                    <div className="flex items-center space-x-2 p-3 bg-muted/30 rounded-lg">
                      <Checkbox
                        id="search-scope-python"
                        checked={searchInWholeMessage}
                        onCheckedChange={(checked: boolean) => setSearchInWholeMessage(checked === true)}
                        data-testid="checkbox-search-scope-python"
                      />
                      <Label htmlFor="search-scope-python" className="text-sm cursor-pointer">
                        Search in whole message (unchecked = search only in title/filename)
                      </Label>
                    </div>
                    
                    <Textarea
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={searchInWholeMessage ? "Paste the message text you want to find similar matches for..." : "Search only in titles/filenames..."}
                      rows={3}
                    />
                  </div>
                )}

                {/* Message ID */}
                {selectedMode === 'id' && (
                  <div>
                    <Label>Message ID</Label>
                    <Input
                      type="number"
                      value={messageId}
                      onChange={(e) => setMessageId(e.target.value)}
                      placeholder="Enter message ID"
                    />
                  </div>
                )}

                {/* Specific Date */}
                {selectedMode === 'day' && (
                  <div>
                    <Label>Date (YYYY-MM-DD)</Label>
                    <Input
                      type="date"
                      value={specificDate}
                      onChange={(e) => setSpecificDate(e.target.value)}
                    />
                  </div>
                )}

                {/* Video Download Range */}
                {selectedMode === 'video' && results?.type === 'video_list' && (
                  <div>
                    <Label>Enter ID or range (e.g., 12345 or 12345-12350)</Label>
                    <Input
                      value={downloadRange}
                      onChange={(e) => setDownloadRange(e.target.value)}
                      placeholder="12345 or 12345-12350"
                    />
                  </div>
                )}

                <div className="flex space-x-2">
                  <Button
                    onClick={() => executeMode.mutate()}
                    disabled={isExecuting}
                  >
                    {isExecuting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Executing...
                      </>
                    ) : selectedMode === 'video' && results?.type === 'video_list' ? (
                      <>
                        <Download className="w-4 h-4 mr-2" />
                        Download Videos
                      </>
                    ) : (
                      'Execute'
                    )}
                  </Button>
                  
                  {selectedMode === 'video' && results?.type === 'video_list' && (
                    <Button onClick={downloadVideos} variant="outline">
                      <Download className="w-4 h-4 mr-2" />
                      Download Selected
                    </Button>
                  )}
                  
                  <Button variant="outline" onClick={resetFlow}>
                    Start Over
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Results */}
            {results && (
              <Card>
                <CardHeader>
                  <CardTitle>📊 Results</CardTitle>
                </CardHeader>
                <CardContent>
                  {results.type === 'error' && (
                    <div className="flex items-center space-x-2 text-red-500">
                      <AlertCircle className="w-5 h-5" />
                      <span>{results.message}</span>
                    </div>
                  )}

                  {results.type === 'date_range' && (
                    <div className="space-y-2">
                      <h3 className="font-medium">📊 Date Range Report</h3>
                      <p>🗓 From: {results.from} to {results.to}</p>
                      <p>🔢 Total Messages: {results.totalMessages}</p>
                      <p>🆔 First Message ID: {results.firstMessageId}</p>
                      <p>🆔 Last Message ID: {results.lastMessageId}</p>
                    </div>
                  )}

                  {results.type === 'total_count' && (
                    <div>
                      <h3 className="font-medium">📈 Total Messages in {results.chatName}: {results.count}</h3>
                    </div>
                  )}

                  {results.type === 'similarity_results' && (
                    <div className="space-y-4">
                      <h3 className="font-medium">📊 Approximate Matches Found:</h3>
                      {results.matches.map((match: any) => (
                        <div key={match.index} className="p-3 border rounded bg-muted/20">
                          <p className="font-medium">{match.index}. 📈 Similarity: {match.similarity}%</p>
                          <p className="text-sm text-muted-foreground">🆔 Message ID: {match.id}</p>
                          <p className="text-sm mt-1">📝 Message: {match.text}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {results.type === 'message_result' && (
                    <div className="space-y-2">
                      <p>🆔 Message ID: {results.message.id}</p>
                      <p>📝 Message: {results.message.text}</p>
                      <p>📅 Date: {results.message.date}</p>
                    </div>
                  )}

                  {results.type === 'date_messages' && (
                    <div className="space-y-2">
                      <h3 className="font-medium">📆 Messages from {specificDate}:</h3>
                      {results.messages.map((msg: any) => (
                        <div key={msg.id} className="p-2 border-l-2 border-primary pl-3">
                          <p className="text-sm font-medium">🆔 ID: {msg.id}</p>
                          <p className="text-sm">📝 Message: {msg.text}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {results.type === 'video_list' && (
                    <div className="space-y-2">
                      <h3 className="font-medium">📌 Videos found in last 50 messages:</h3>
                      {results.videos.map((video: any) => (
                        <div key={video.id} className="p-2 border rounded text-sm">
                          <span className="font-mono">ID: {video.id} | Caption/Filename: {video.caption.substring(0, 50)}</span>
                        </div>
                      ))}
                      <p className="text-sm text-muted-foreground mt-4">
                        👉 Enter ID or range above to download (e.g., 12345 or 12345-12350)
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Active Downloads */}
            {downloads.filter(d => d.status === 'downloading').length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>📥 Active Downloads</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {downloads
                      .filter(d => d.status === 'downloading')
                      .map((download) => (
                        <div key={download.id} className="flex items-center space-x-4">
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium">{download.fileName}</span>
                              <div className="flex items-center space-x-2">
                                <span className="text-xs text-muted-foreground">
                                  {download.progress}%
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={async () => {
                                    await downloadManager.cancelDownload(download.id);
                                    toast({
                                      title: 'Download cancelled',
                                      description: 'The download has been stopped instantly',
                                    });
                                  }}
                                  className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                                  data-testid={`cancel-python-${download.id}`}
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
          </div>
        )}
      </div>
    </div>
  );
}