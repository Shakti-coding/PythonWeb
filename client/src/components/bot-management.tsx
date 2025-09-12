import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { 
  Bot, 
  Play, 
  Square, 
  Send, 
  Loader2, 
  CheckCircle, 
  AlertCircle,
  MessageSquare,
  Settings
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

interface BotStatus {
  running: boolean;
  token: string;
  lastActivity: string | null;
}

export function BotManagement() {
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [message, setMessage] = useState('');
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch bot status
  const { data: botStatusData, isLoading } = useQuery({
    queryKey: ['bot-status'],
    queryFn: async () => {
      const response = await fetch('/api/bot/status');
      return await response.json();
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const botStatus: BotStatus = botStatusData?.status || { running: false, token: '', lastActivity: null };

  // Start bot mutation
  const startBot = useMutation({
    mutationFn: async (token: string) => {
      const response = await fetch('/api/bot/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start bot');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Bot started successfully',
        description: 'Your Telegram bot is now running and ready to receive messages!',
      });
      setBotToken('');
      queryClient.invalidateQueries({ queryKey: ['bot-status'] });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to start bot',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  // Stop bot mutation
  const stopBot = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/bot/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to stop bot');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Bot stopped',
        description: 'Your Telegram bot has been stopped.',
      });
      queryClient.invalidateQueries({ queryKey: ['bot-status'] });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to stop bot',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  // Send message mutation
  const sendMessage = useMutation({
    mutationFn: async ({ chatId, message }: { chatId: string; message: string }) => {
      const response = await fetch('/api/bot/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, message }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send message');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Message sent',
        description: 'Your message has been sent successfully!',
      });
      setMessage('');
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to send message',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  return (
    <div className="space-y-6">
      {/* Bot Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Bot className="w-5 h-5" />
            <span>Telegram Bot Status</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                {botStatus.running ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-500" />
                )}
                <Badge variant={botStatus.running ? "default" : "destructive"} className={botStatus.running ? "bg-green-500 text-white" : ""}>
                  {botStatus.running ? "Running" : "Stopped"}
                </Badge>
              </div>
              {botStatus.token && (
                <span className="text-sm text-muted-foreground">
                  Token: {botStatus.token}
                </span>
              )}
            </div>
            {botStatus.lastActivity && (
              <span className="text-sm text-muted-foreground">
                Last activity: {new Date(botStatus.lastActivity).toLocaleString()}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bot Control Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="w-5 h-5" />
            <span>Bot Control</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!botStatus.running ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="bot-token">Bot Token</Label>
                <Input
                  id="bot-token"
                  type="password"
                  placeholder="Enter your Telegram bot token"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  data-testid="input-bot-token"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Get your bot token from @BotFather on Telegram
                </p>
              </div>
              <Button
                onClick={() => startBot.mutate(botToken)}
                disabled={!botToken || startBot.isPending}
                className="w-full"
                data-testid="button-start-bot"
              >
                {startBot.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Starting Bot...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Start Bot
                  </>
                )}
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => stopBot.mutate()}
              disabled={stopBot.isPending}
              variant="destructive"
              className="w-full"
              data-testid="button-stop-bot"
            >
              {stopBot.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Stopping Bot...
                </>
              ) : (
                <>
                  <Square className="w-4 h-4 mr-2" />
                  Stop Bot
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Send Message Card */}
      {botStatus.running && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <MessageSquare className="w-5 h-5" />
              <span>Send Message</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="chat-id">Chat ID</Label>
              <Input
                id="chat-id"
                placeholder="Enter chat ID (e.g., 123456789)"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                data-testid="input-chat-id"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Send /status to your bot to get the chat ID
              </p>
            </div>
            <div>
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                placeholder="Enter your message..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                data-testid="textarea-message"
              />
            </div>
            <Button
              onClick={() => sendMessage.mutate({ chatId, message })}
              disabled={!chatId || !message || sendMessage.isPending}
              className="w-full"
              data-testid="button-send-message"
            >
              {sendMessage.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send Message
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Instructions Card */}
      <Card>
        <CardHeader>
          <CardTitle>How to Use</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            1. Create a new bot by messaging @BotFather on Telegram
          </p>
          <p className="text-sm text-muted-foreground">
            2. Copy the bot token and paste it above
          </p>
          <p className="text-sm text-muted-foreground">
            3. Start the bot and it will run directly from your web app
          </p>
          <p className="text-sm text-muted-foreground">
            4. When you deploy to Vercel, the bot will deploy with your app
          </p>
          <p className="text-sm text-muted-foreground">
            5. Test the bot by sending /start, /status, or /help commands
          </p>
        </CardContent>
      </Card>
    </div>
  );
}