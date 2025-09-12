import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { 
  Bot, Play, Square, Activity, Terminal, 
  AlertTriangle, CheckCircle, Eye, EyeOff 
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

interface PythonBotStatus {
  running: boolean;
  apiId: string;
  apiHash: string;
  botToken: string;
  authorizedUserId: string;
  lastActivity: string | null;
  logs: string[];
}

export function PythonBot() {
  const [botToken, setBotToken] = useState('8154976061:AAGryZFYIb5fu6OlCVFMAlWgiu6M8J9j_1o');
  const [authorizedUserId, setAuthorizedUserId] = useState('6956029558');
  const [showSecrets, setShowSecrets] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch bot status
  const { data: statusData, isLoading } = useQuery({
    queryKey: ['python-bot-status'],
    queryFn: async () => {
      const response = await fetch('/api/python-bot/status');
      if (!response.ok) throw new Error('Failed to fetch status');
      return response.json();
    },
    refetchInterval: 2000, // Poll every 2 seconds
  });

  // Fetch logs
  const { data: logsData } = useQuery({
    queryKey: ['python-bot-logs'],
    queryFn: async () => {
      const response = await fetch('/api/python-bot/logs');
      if (!response.ok) throw new Error('Failed to fetch logs');
      return response.json();
    },
    refetchInterval: 3000, // Poll every 3 seconds
    enabled: showLogs,
  });

  const status: PythonBotStatus = statusData?.status || {
    running: false,
    apiId: '',
    apiHash: '',
    botToken: '',
    authorizedUserId: '',
    lastActivity: null,
    logs: []
  };

  // Start bot mutation
  const startBotMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/python-bot/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken,
          authorizedUserId
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start bot');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({ 
        title: 'Python Telethon Bot Started', 
        description: 'Bot is now running with the exact same functionality as the original repository!' 
      });
      queryClient.invalidateQueries({ queryKey: ['python-bot-status'] });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Failed to Start Bot', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  // Stop bot mutation
  const stopBotMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/python-bot/stop', {
        method: 'POST',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to stop bot');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Python Telethon Bot Stopped', description: 'Bot has been stopped successfully.' });
      queryClient.invalidateQueries({ queryKey: ['python-bot-status'] });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Failed to Stop Bot', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  const handleStart = () => {
    if (!botToken || !authorizedUserId) {
      toast({ 
        title: 'Missing Information', 
        description: 'Please provide bot token and authorized user ID', 
        variant: 'destructive' 
      });
      return;
    }
    startBotMutation.mutate();
  };

  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString();
  };

  const maskValue = (value: string, show: boolean) => {
    if (show || !value) return value;
    return value.slice(0, 3) + '...';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
          <Bot className="w-6 h-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">🐍 Python Telethon Bot</h1>
          <p className="text-muted-foreground">
            Run the exact same telethon_downloader bot from the original repository
          </p>
        </div>
      </div>

      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Bot Status
            {status.running ? (
              <Badge variant="default" className="ml-auto">
                <CheckCircle className="w-3 h-3 mr-1" />
                Running
              </Badge>
            ) : (
              <Badge variant="secondary" className="ml-auto">
                <Square className="w-3 h-3 mr-1" />
                Stopped
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status.running && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Bot Token:</span> {maskValue(status.botToken, showSecrets)}
              </div>
              <div>
                <span className="font-medium">Authorized User:</span> {status.authorizedUserId}
              </div>
              <div className="col-span-2">
                <span className="font-medium">Last Activity:</span> {formatTime(status.lastActivity)}
              </div>
              <div className="col-span-2">
                <span className="font-medium text-green-600">✅ Using web app API credentials</span>
              </div>
            </div>
          )}
          
          {status.running && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSecrets(!showSecrets)}
                data-testid="button-toggle-secrets"
              >
                {showSecrets ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                {showSecrets ? 'Hide' : 'Show'} Secrets
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowLogs(!showLogs)}
                data-testid="button-toggle-logs"
              >
                <Terminal className="w-4 h-4 mr-2" />
                {showLogs ? 'Hide' : 'Show'} Logs
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configuration Card */}
      {!status.running && (
        <Card>
          <CardHeader>
            <CardTitle>🔧 Bot Configuration</CardTitle>
            <p className="text-sm text-muted-foreground">
              Configure your bot settings (API credentials are inherited from your existing session)
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg mb-4">
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-green-800 dark:text-green-200">✅ API Credentials Ready</p>
                  <p className="text-green-700 dark:text-green-300 mt-1">
                    Using your existing Telegram API credentials from the web app login
                  </p>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="botToken">Bot Token *</Label>
              <Input
                id="botToken"
                type="password"
                placeholder="Your bot token from @BotFather"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                data-testid="input-bot-token"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="authorizedUserId">Authorized User ID *</Label>
              <Input
                id="authorizedUserId"
                type="text"
                placeholder="Telegram user ID who can use this bot"
                value={authorizedUserId}
                onChange={(e) => setAuthorizedUserId(e.target.value)}
                data-testid="input-authorized-user-id"
              />
            </div>

            <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-blue-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-blue-800 dark:text-blue-200">How to get these credentials:</p>
                  <ul className="mt-2 space-y-1 text-blue-700 dark:text-blue-300">
                    <li>• Bot Token: Create a bot with <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="underline">@BotFather</a></li>
                    <li>• User ID: Send a message to <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="underline">@userinfobot</a></li>
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            {!status.running ? (
              <Button
                onClick={handleStart}
                disabled={startBotMutation.isPending || isLoading}
                className="flex-1"
                data-testid="button-start-python-bot"
              >
                <Play className="w-4 h-4 mr-2" />
                {startBotMutation.isPending ? 'Starting...' : 'Start Python Bot'}
              </Button>
            ) : (
              <Button
                onClick={() => stopBotMutation.mutate()}
                disabled={stopBotMutation.isPending}
                variant="destructive"
                className="flex-1"
                data-testid="button-stop-python-bot"
              >
                <Square className="w-4 h-4 mr-2" />
                {stopBotMutation.isPending ? 'Stopping...' : 'Stop Python Bot'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Logs Card */}
      {showLogs && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Terminal className="w-5 h-5" />
              Bot Logs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={logsData?.logs?.slice(-20).join('\n') || 'No logs available...'}
              readOnly
              className="min-h-[200px] font-mono text-xs bg-black text-green-400"
              data-testid="logs-display"
            />
          </CardContent>
        </Card>
      )}

      {/* Features Card */}
      <Card>
        <CardHeader>
          <CardTitle>🚀 Bot Features</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <h4 className="font-medium">✨ Core Features:</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Automatic file downloads from Telegram</li>
                <li>• YouTube video/audio downloading</li>
                <li>• File organization by extension</li>
                <li>• Regex-based folder organization</li>
                <li>• Multi-language support</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">🔧 Advanced Features:</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li>• ZIP/RAR/7Z extraction</li>
                <li>• Progress tracking</li>
                <li>• File renaming capabilities</li>
                <li>• Link-based downloads</li>
                <li>• Parallel download processing</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}