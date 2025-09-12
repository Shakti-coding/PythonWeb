import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Search,
  Calendar,
  Hash,
  Copy,
  ExternalLink,
  Video,
  Image,
  FileText,
  Loader2,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { storage } from '@/lib/storage';
import { telegramManager } from '@/lib/telegram';
import { SimilarityMatcher } from '@/lib/similarity';
import type { Chat, Message, SearchParams } from '@shared/schema';

export function MessageSearch() {
  const [searchParams, setSearchParams] = useState<SearchParams>({
    similarityThreshold: 70,
  });
  const [searchMode, setSearchMode] = useState<'text' | 'id' | 'date'>('text');
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch chats
  const { data: chats = [] } = useQuery<Chat[]>({
    queryKey: ['chats'],
    queryFn: async () => {
      return await storage.getChats();
    },
  });

  // Fetch messages for selected chat
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ['messages', searchParams.chatId],
    queryFn: async () => {
      if (!searchParams.chatId) return [];
      return await storage.getMessages(searchParams.chatId);
    },
    enabled: !!searchParams.chatId,
  });

  const executeSearch = useMutation({
    mutationFn: async (params: SearchParams) => {
      if (!params.chatId) {
        throw new Error('Please select a chat first');
      }

      setIsSearching(true);
      
      try {
        // Determine search scope based on date range
        const hasDateRange = params.dateFrom || params.dateTo;
        const searchLimit = hasDateRange ? undefined : 50000; // Large limit for unlimited search
        
        // Get fresh messages from Telegram
        const freshMessages = await telegramManager.getMessages(params.chatId, {
          limit: searchLimit,
          fromDate: params.dateFrom ? new Date(params.dateFrom) : undefined,
          toDate: params.dateTo ? new Date(params.dateTo) : undefined,
        });

        // Save to storage
        await storage.saveMessages(freshMessages);

        // Perform search based on mode
        let results: Message[] = [];

        if (searchMode === 'text' && params.query) {
          // Use similarity search with scope support
          const similarMessages = SimilarityMatcher.findSimilarMessages(
            params.query,
            freshMessages,
            params.similarityThreshold,
            params.searchInWholeMessage ?? true
          );
          results = similarMessages.map(sim => ({
            ...freshMessages.find(m => m.id === sim.id)!,
            similarity: sim.similarity,
          }));
        } else if (searchMode === 'id' && params.messageId) {
          // Search by message ID
          const message = await telegramManager.getMessageById(params.chatId, params.messageId);
          results = message ? [message] : [];
        } else if (searchMode === 'date') {
          // Filter by date range
          results = freshMessages.filter(msg => {
            const msgDate = new Date(msg.date);
            if (params.dateFrom && msgDate < new Date(params.dateFrom)) return false;
            if (params.dateTo && msgDate > new Date(params.dateTo)) return false;
            return true;
          });
        }

        return results;
      } finally {
        setIsSearching(false);
      }
    },
    onSuccess: (results) => {
      setSearchResults(results);
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      
      const hasDateRange = searchParams.dateFrom || searchParams.dateTo;
      const searchScope = hasDateRange ? 'in specified date range' : 'across entire chat history';
      
      toast({
        title: 'Search completed',
        description: `Found ${results.length} messages ${searchScope}`,
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

  const countMessages = useMutation({
    mutationFn: async (params: SearchParams) => {
      if (!params.chatId) {
        throw new Error('Please select a chat first');
      }

      return await telegramManager.countMessages(
        params.chatId,
        params.dateFrom ? new Date(params.dateFrom) : undefined,
        params.dateTo ? new Date(params.dateTo) : undefined
      );
    },
    onSuccess: (count) => {
      toast({
        title: 'Message count',
        description: `Found ${count} messages in the specified range`,
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Count failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const handleSearch = () => {
    executeSearch.mutate(searchParams);
  };

  const handleCount = () => {
    countMessages.mutate(searchParams);
  };

  const copyMessageId = (messageId: number) => {
    navigator.clipboard.writeText(messageId.toString());
    toast({
      title: 'Copied',
      description: 'Message ID copied to clipboard',
    });
  };

  const getMediaIcon = (mediaType?: string) => {
    switch (mediaType) {
      case 'video':
        return <Video className="w-3 h-3 text-amber-500" />;
      case 'photo':
      case 'image':
        return <Image className="w-3 h-3 text-blue-500" />;
      case 'document':
        return <FileText className="w-3 h-3 text-green-500" />;
      default:
        return null;
    }
  };

  const selectedChat = chats.find(chat => chat.id === searchParams.chatId);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2">Message Search</h2>
        <p className="text-muted-foreground">
          Search and analyze messages across your chats
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Search Controls */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Search Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Chat Selection */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Selected Chat</Label>
                <Select
                  value={searchParams.chatId || ''}
                  onValueChange={(value) =>
                    setSearchParams(prev => ({ ...prev, chatId: value }))
                  }
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
              </div>

              {/* Search Mode Tabs */}
              <div>
                <Tabs value={searchMode} onValueChange={(value) => setSearchMode(value as any)}>
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="text" data-testid="tab-text-search">
                      Text
                    </TabsTrigger>
                    <TabsTrigger value="id" data-testid="tab-id-search">
                      ID
                    </TabsTrigger>
                    <TabsTrigger value="date" data-testid="tab-date-search">
                      Date
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="text" className="space-y-4 mt-4">
                    {/* Search Scope Toggle */}
                    <div className="flex items-center space-x-2 p-3 bg-muted/30 rounded-lg">
                      <Checkbox
                        id="search-scope-message"
                        checked={searchParams.searchInWholeMessage ?? true}
                        onCheckedChange={(checked) => 
                          setSearchParams(prev => ({ ...prev, searchInWholeMessage: checked === true }))
                        }
                        data-testid="checkbox-search-scope-message"
                      />
                      <Label htmlFor="search-scope-message" className="text-sm cursor-pointer">
                        Search in whole message (unchecked = search only in title/filename)
                      </Label>
                    </div>
                    
                    <div>
                      <Label className="text-sm font-medium mb-2 block">Search Query</Label>
                      <Input
                        placeholder={searchParams.searchInWholeMessage ? "Search in messages and filenames..." : "Search only in titles/filenames..."}
                        value={searchParams.query || ''}
                        onChange={(e) =>
                          setSearchParams(prev => ({ ...prev, query: e.target.value }))
                        }
                        data-testid="input-search-query"
                      />
                    </div>

                    <div>
                      <Label className="text-sm font-medium mb-2 block">
                        Similarity Threshold: {searchParams.similarityThreshold}%
                      </Label>
                      <Slider
                        value={[searchParams.similarityThreshold]}
                        onValueChange={([value]) =>
                          setSearchParams(prev => ({ ...prev, similarityThreshold: value }))
                        }
                        max={100}
                        min={0}
                        step={5}
                        className="w-full"
                        data-testid="slider-similarity"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Higher values = more exact matches
                      </p>
                    </div>
                  </TabsContent>

                  <TabsContent value="id" className="space-y-4 mt-4">
                    <div>
                      <Label className="text-sm font-medium mb-2 block">Message ID</Label>
                      <Input
                        type="number"
                        placeholder="Enter message ID..."
                        value={searchParams.messageId || ''}
                        onChange={(e) =>
                          setSearchParams(prev => ({
                            ...prev,
                            messageId: e.target.value ? parseInt(e.target.value) : undefined,
                          }))
                        }
                        data-testid="input-message-id"
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="date" className="space-y-4 mt-4">
                    {/* Date range inputs will be here */}
                  </TabsContent>
                </Tabs>
              </div>

              {/* Date Range */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Date Range (Optional)</Label>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    type="date"
                    placeholder="From date"
                    value={searchParams.dateFrom || ''}
                    onChange={(e) =>
                      setSearchParams(prev => ({ ...prev, dateFrom: e.target.value }))
                    }
                    data-testid="input-date-from"
                  />
                  <Input
                    type="date"
                    placeholder="To date"
                    value={searchParams.dateTo || ''}
                    onChange={(e) =>
                      setSearchParams(prev => ({ ...prev, dateTo: e.target.value }))
                    }
                    data-testid="input-date-to"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {searchParams.dateFrom || searchParams.dateTo 
                    ? 'Searching within specified date range'
                    : '🚀 Searching entire chat history (may take longer for large chats)'}
                </p>
              </div>

              {/* Search Actions */}
              <div className="space-y-2">
                <Button
                  onClick={handleSearch}
                  className="w-full"
                  disabled={!searchParams.chatId || executeSearch.isPending}
                  data-testid="button-search"
                >
                  {executeSearch.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Search Messages
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleCount}
                  className="w-full"
                  disabled={!searchParams.chatId || countMessages.isPending}
                  data-testid="button-count"
                >
                  {countMessages.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Count Only
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search Results */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Search Results
                <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                  <span data-testid="search-results-count">
                    {searchResults.length} messages found
                  </span>
                  {selectedChat && (
                    <span>in {selectedChat.title}</span>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isSearching ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin mb-3" />
                  <span className="text-sm font-medium">Searching messages...</span>
                  <span className="text-xs text-muted-foreground mt-1">
                    {searchParams.dateFrom || searchParams.dateTo 
                      ? 'Searching within date range'
                      : 'Searching entire chat history - this may take a moment'}
                  </span>
                </div>
              ) : searchResults.length > 0 ? (
                <div className="space-y-4 max-h-[600px] overflow-y-auto">
                  {searchResults.map((message) => (
                    <div
                      key={`${message.chatId}-${message.id}`}
                      className="message-card bg-muted/30 p-4 rounded-lg border border-border hover:shadow-lg transition-all duration-200"
                      data-testid={`message-${message.id}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <Avatar className="w-8 h-8">
                            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                              {message.senderName?.substring(0, 2).toUpperCase() || 'UN'}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">{message.senderName || 'Unknown'}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(message.date).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {(message as any).similarity && (
                            <Badge variant="secondary" className="text-xs">
                              {Math.round((message as any).similarity)}% match
                            </Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyMessageId(message.id)}
                            data-testid={`copy-${message.id}`}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      {message.text && (
                        <p className="text-sm text-foreground mb-3">{message.text}</p>
                      )}

                      {message.hasMedia && (
                        <div className="flex items-center space-x-2 mb-3">
                          {getMediaIcon(message.mediaType)}
                          <span className="text-xs text-muted-foreground">
                            {message.mediaType || 'Media'} attachment
                          </span>
                          {message.mediaSize && (
                            <span className="text-xs text-muted-foreground">
                              ({(message.mediaSize / 1024 / 1024).toFixed(1)} MB)
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>ID: {message.id}</span>
                        <div className="flex items-center space-x-4">
                          <span>{selectedChat?.title}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-primary hover:text-primary/80 h-auto p-0"
                            data-testid={`view-context-${message.id}`}
                          >
                            <ExternalLink className="w-3 h-3 mr-1" />
                            View in Context
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    {searchParams.chatId
                      ? 'No messages found. Try adjusting your search criteria or removing date restrictions to search the entire chat.'
                      : 'Select a chat and enter search criteria to get started.'
                    }
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
