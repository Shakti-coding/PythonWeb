import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Calendar as CalendarIcon,
  Clock,
  Search,
  BarChart3,
  Loader2,
  FileText,
  Video,
  Image,
} from 'lucide-react';
import { format, startOfDay, endOfDay, subDays, subWeeks, subMonths } from 'date-fns';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { storage } from '@/lib/storage';
import { telegramManager } from '@/lib/telegram';
import { cn } from '@/lib/utils';
import type { Chat, Message } from '@shared/schema';

export function DateRange() {
  const [selectedChat, setSelectedChat] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [results, setResults] = useState<{
    messages: Message[];
    count: number;
    dateRange: string;
  } | null>(null);
  
  const { toast } = useToast();

  // Fetch chats
  const { data: chats = [] } = useQuery<Chat[]>({
    queryKey: ['chats'],
    queryFn: async () => {
      return await storage.getChats();
    },
  });

  const searchByDateRange = useMutation({
    mutationFn: async ({ chatId, from, to }: { chatId: string; from?: Date; to?: Date }) => {
      // Get fresh messages from Telegram
      const messages = await telegramManager.getMessages(chatId, {
        limit: 5000,
        fromDate: from,
        toDate: to,
      });

      // Save to storage
      await storage.saveMessages(messages);

      return {
        messages,
        count: messages.length,
        dateRange: `${from ? format(from, 'MMM dd, yyyy') : 'Beginning'} - ${
          to ? format(to, 'MMM dd, yyyy') : 'Present'
        }`,
      };
    },
    onSuccess: (result) => {
      setResults(result);
      toast({
        title: 'Search completed',
        description: `Found ${result.count} messages in the specified date range`,
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

  const handleQuickDateSelect = (days: number) => {
    const now = new Date();
    const from = subDays(now, days);
    setDateFrom(startOfDay(from));
    setDateTo(endOfDay(now));
  };

  const handleSearch = () => {
    if (!selectedChat) {
      toast({
        variant: 'destructive',
        title: 'No chat selected',
        description: 'Please select a chat first',
      });
      return;
    }

    searchByDateRange.mutate({
      chatId: selectedChat,
      from: dateFrom,
      to: dateTo,
    });
  };

  const getMediaIcon = (mediaType?: string) => {
    switch (mediaType) {
      case 'video':
        return <Video className="w-4 h-4 text-amber-500" />;
      case 'photo':
      case 'image':
        return <Image className="w-4 h-4 text-blue-500" />;
      case 'document':
        return <FileText className="w-4 h-4 text-green-500" />;
      default:
        return null;
    }
  };

  const selectedChatInfo = chats.find(chat => chat.id === selectedChat);
  const hasMediaMessages = results?.messages.filter(m => m.hasMedia).length || 0;

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2">Date Range Search</h2>
        <p className="text-muted-foreground">
          Find messages and media within specific date ranges
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Search Controls */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Search Parameters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Chat Selection */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Select Chat</Label>
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
              </div>

              {/* Quick Date Selections */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Quick Select</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickDateSelect(7)}
                    data-testid="quick-7-days"
                  >
                    Last 7 days
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickDateSelect(30)}
                    data-testid="quick-30-days"
                  >
                    Last 30 days
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickDateSelect(90)}
                    data-testid="quick-90-days"
                  >
                    Last 90 days
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDateFrom(undefined);
                      setDateTo(undefined);
                    }}
                    data-testid="quick-all-time"
                  >
                    All time
                  </Button>
                </div>
              </div>

              {/* Custom Date Range */}
              <div className="space-y-4">
                <Label className="text-sm font-medium">Custom Date Range</Label>
                
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">From Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !dateFrom && 'text-muted-foreground'
                        )}
                        data-testid="button-from-date"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateFrom ? format(dateFrom, 'PPP') : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={dateFrom}
                        onSelect={setDateFrom}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">To Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !dateTo && 'text-muted-foreground'
                        )}
                        data-testid="button-to-date"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateTo ? format(dateTo, 'PPP') : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={dateTo}
                        onSelect={setDateTo}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Search Button */}
              <Button
                onClick={handleSearch}
                className="w-full"
                disabled={!selectedChat || searchByDateRange.isPending}
                data-testid="button-search-date-range"
              >
                {searchByDateRange.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Search className="mr-2 h-4 w-4" />
                Search Messages
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Results */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Search Results
                {results && (
                  <Badge variant="secondary" data-testid="results-count">
                    {results.count} messages
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {results ? (
                <div className="space-y-6">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-muted/30 p-4 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <BarChart3 className="w-5 h-5 text-blue-500" />
                        <div>
                          <p className="text-sm font-medium">Total Messages</p>
                          <p className="text-2xl font-bold">{results.count}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-muted/30 p-4 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <Video className="w-5 h-5 text-amber-500" />
                        <div>
                          <p className="text-sm font-medium">Media Messages</p>
                          <p className="text-2xl font-bold">{hasMediaMessages}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-muted/30 p-4 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <Clock className="w-5 h-5 text-green-500" />
                        <div>
                          <p className="text-sm font-medium">Date Range</p>
                          <p className="text-sm font-semibold">{results.dateRange}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Messages List */}
                  <div className="space-y-4 max-h-[500px] overflow-y-auto">
                    {results.messages.map((message) => (
                      <div
                        key={`${message.chatId}-${message.id}`}
                        className="flex items-start space-x-3 p-3 bg-muted/20 rounded-lg border border-border"
                        data-testid={`message-${message.id}`}
                      >
                        <Avatar className="w-8 h-8">
                          <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                            {message.senderName?.substring(0, 2).toUpperCase() || 'UN'}
                          </AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-medium">{message.senderName || 'Unknown'}</p>
                            <div className="flex items-center space-x-2">
                              {message.hasMedia && getMediaIcon(message.mediaType)}
                              <span className="text-xs text-muted-foreground">
                                {new Date(message.date).toLocaleString()}
                              </span>
                            </div>
                          </div>
                          
                          {message.text && (
                            <p className="text-sm text-foreground mb-2 line-clamp-2">
                              {message.text}
                            </p>
                          )}
                          
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>ID: {message.id}</span>
                            {message.hasMedia && message.mediaFileName && (
                              <span className="text-amber-600">📎 {message.mediaFileName}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <CalendarIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    {selectedChatInfo
                      ? `Select a date range and search messages in ${selectedChatInfo.title}`
                      : 'Select a chat and date range to search messages'
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
