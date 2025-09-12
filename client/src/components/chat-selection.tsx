import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Search,
  Users,
  Hash,
  User,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { storage } from '@/lib/storage';
import { telegramManager } from '@/lib/telegram';
import type { Chat } from '@shared/schema';

interface ChatSelectionProps {
  onChatSelect?: (chat: Chat) => void;
}

export function ChatSelection({ onChatSelect }: ChatSelectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch chats from storage
  const { data: chats = [], isLoading } = useQuery<Chat[]>({
    queryKey: ['chats'],
    queryFn: async () => {
      return await storage.getChats();
    },
  });

  // Refresh chats from Telegram
  const refreshChats = useMutation({
    mutationFn: async () => {
      const freshChats = await telegramManager.getChats();
      await storage.saveChats(freshChats);
      return freshChats;
    },
    onSuccess: (freshChats) => {
      queryClient.setQueryData(['chats'], freshChats);
      toast({
        title: 'Chats refreshed',
        description: `Loaded ${freshChats.length} chats`,
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to refresh chats',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const handleChatSelect = (chat: Chat) => {
    setSelectedChat(chat);
    if (onChatSelect) {
      onChatSelect(chat);
    }
  };

  const getTypeIcon = (type: Chat['type']) => {
    switch (type) {
      case 'channel':
        return <Hash className="w-4 h-4" />;
      case 'group':
        return <Users className="w-4 h-4" />;
      case 'private':
        return <User className="w-4 h-4" />;
    }
  };

  const getTypeColor = (type: Chat['type']) => {
    switch (type) {
      case 'channel':
        return 'bg-blue-500/10 text-blue-500';
      case 'group':
        return 'bg-green-500/10 text-green-500';
      case 'private':
        return 'bg-purple-500/10 text-purple-500';
    }
  };

  const filteredChats = chats.filter(chat =>
    chat.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    chat.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2">Chat Selection</h2>
            <p className="text-muted-foreground">
              Choose a chat to search messages and download media
            </p>
          </div>
          <Button
            onClick={() => refreshChats.mutate()}
            disabled={refreshChats.isPending}
            data-testid="button-refresh-chats"
          >
            {refreshChats.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chat List */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Your Chats
                <Badge variant="secondary" data-testid="chat-count">
                  {chats.length} total
                </Badge>
              </CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search chats..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-chats"
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {isLoading ? (
                  // Loading skeleton
                  Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="flex items-center space-x-3 p-3">
                      <Skeleton className="w-12 h-12 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                  ))
                ) : filteredChats.length > 0 ? (
                  filteredChats.map((chat) => (
                    <div
                      key={chat.id}
                      className={`flex items-center space-x-3 p-3 rounded-lg border border-border cursor-pointer transition-all duration-200 hover:bg-muted/50 hover:shadow-md ${
                        selectedChat?.id === chat.id
                          ? 'bg-primary/10 border-primary'
                          : 'bg-muted/20'
                      }`}
                      onClick={() => handleChatSelect(chat)}
                      data-testid={`chat-item-${chat.id}`}
                    >
                      <Avatar className="w-12 h-12">
                        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white font-medium">
                          {chat.title.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="font-medium truncate">{chat.title}</h3>
                          <div className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs ${getTypeColor(chat.type)}`}>
                            {getTypeIcon(chat.type)}
                            <span className="capitalize">{chat.type}</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          <span>
                            {chat.participantCount
                              ? `${chat.participantCount.toLocaleString()} members`
                              : 'Private chat'
                            }
                          </span>
                          {chat.username && (
                            <span className="text-xs bg-muted/50 px-2 py-1 rounded">
                              @{chat.username}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">
                      {searchQuery
                        ? 'No chats found matching your search.'
                        : 'No chats available. Try refreshing to load your chats.'
                      }
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Chat Details */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Chat Details</CardTitle>
            </CardHeader>
            <CardContent>
              {selectedChat ? (
                <div className="space-y-4">
                  <div className="text-center">
                    <Avatar className="w-20 h-20 mx-auto mb-4">
                      <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-xl font-bold">
                        {selectedChat.title.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <h3 className="font-semibold text-lg mb-2">{selectedChat.title}</h3>
                    <Badge variant="secondary" className="mb-4">
                      {selectedChat.type}
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Chat ID</p>
                      <p className="text-sm font-mono bg-muted/50 p-2 rounded">
                        {selectedChat.id}
                      </p>
                    </div>

                    {selectedChat.username && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Username</p>
                        <p className="text-sm">@{selectedChat.username}</p>
                      </div>
                    )}

                    {selectedChat.username && (selectedChat.type === 'channel' || selectedChat.type === 'group') && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Invite Link</p>
                        <p className="text-sm text-blue-600 break-all">
                          https://t.me/{selectedChat.username}
                        </p>
                      </div>
                    )}

                    {selectedChat.participantCount && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Members</p>
                        <p className="text-sm">{selectedChat.participantCount.toLocaleString()}</p>
                      </div>
                    )}

                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Chat Type</p>
                      <p className="text-sm capitalize">{selectedChat.type}</p>
                    </div>

                    {selectedChat.type !== 'private' && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Access</p>
                        <p className="text-sm">
                          {selectedChat.username ? 'Public' : 'Private'} {selectedChat.type}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t">
                    <Button
                      className="w-full"
                      onClick={() => {
                        toast({
                          title: 'Chat selected',
                          description: `Selected ${selectedChat.title}`,
                        });
                      }}
                      data-testid="button-select-chat"
                    >
                      Use This Chat
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Hash className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground text-sm">
                    Select a chat from the list to see details
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
