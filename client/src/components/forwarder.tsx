import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { storage } from '@/lib/storage';
import { PlayCircle, StopCircle, Settings, AlertCircle, CheckCircle, Activity } from 'lucide-react';
import type { Chat } from '@shared/schema';
import { queryClient } from '@/lib/queryClient';

interface ForwardConfig {
  name: string;
  fromChatId: string;
  toChatId: string;
  offsetFrom: number;
  offsetTo: number;
}

interface ForwardJob {
  id: string;
  config: ForwardConfig;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  currentOffset: number;
  progress: number;
  logs: string[];
  error?: string;
}

export function Forwarder() {
  const [configs, setConfigs] = useState<ForwardConfig[]>(() => {
    const saved = localStorage.getItem('forwarder_configs');
    return saved ? JSON.parse(saved) : [];
  });
  // Load saved configuration from localStorage
  const [currentConfig, setCurrentConfig] = useState<ForwardConfig>(() => {
    const saved = localStorage.getItem('forwarder_currentConfig');
    return saved ? JSON.parse(saved) : {
      name: '',
      fromChatId: '',
      toChatId: '',
      offsetFrom: 0,
      offsetTo: 0,
    };
  });
  const [runningJobs, setRunningJobs] = useState<Map<string, ForwardJob>>(new Map());
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const { toast } = useToast();

  // Save configuration changes to localStorage
  useEffect(() => {
    localStorage.setItem('forwarder_currentConfig', JSON.stringify(currentConfig));
  }, [currentConfig]);

  useEffect(() => {
    localStorage.setItem('forwarder_configs', JSON.stringify(configs));
  }, [configs]);

  // Load available chats
  const { data: chats = [] } = useQuery<Chat[]>({
    queryKey: ['chats'],
    queryFn: async () => {
      return await storage.getChats();
    },
  });

  // Poll for job updates
  const { data: jobsData } = useQuery({
    queryKey: ['forwarding-jobs'],
    queryFn: async () => {
      const response = await fetch('/api/telegram/forwarding-jobs');
      if (!response.ok) throw new Error('Failed to fetch jobs');
      return response.json();
    },
    refetchInterval: selectedJob ? 2000 : 10000, // Poll more frequently when monitoring a job
    enabled: runningJobs.size > 0, // Only poll if we have active jobs
  });

  // Update running jobs from server
  useEffect(() => {
    if (jobsData?.jobs) {
      const updatedJobs = new Map<string, ForwardJob>();
      jobsData.jobs.forEach((job: ForwardJob) => {
        if (job.id) {
          updatedJobs.set(job.id, job);
        }
      });
      setRunningJobs(updatedJobs);
    }
  }, [jobsData]);

  // Add new forward configuration
  const addConfig = () => {
    if (!currentConfig.name || !currentConfig.fromChatId || !currentConfig.toChatId) {
      toast({
        variant: 'destructive',
        title: 'Invalid Configuration',
        description: 'Please fill in all required fields.',
      });
      return;
    }

    if (currentConfig.offsetFrom >= currentConfig.offsetTo && currentConfig.offsetTo !== 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid Offset Range',
        description: 'Offset To must be greater than Offset From.',
      });
      return;
    }

    const newConfigs = [...configs, { ...currentConfig }];
    setConfigs(newConfigs);
    setCurrentConfig({
      name: '',
      fromChatId: '',
      toChatId: '',
      offsetFrom: 0,
      offsetTo: 0,
    });

    toast({
      title: 'Configuration Added',
      description: `Forward rule "${currentConfig.name}" has been added.`,
    });
  };

  // Remove configuration
  const removeConfig = (index: number) => {
    const newConfigs = configs.filter((_, i) => i !== index);
    setConfigs(newConfigs);
  };

  // Get current session
  const { data: sessions = [] } = useQuery<import('@shared/schema').TelegramSession[]>({
    queryKey: ['sessions'],
    queryFn: async () => {
      return await storage.getAllSessions();
    },
  });

  const currentSession = sessions[0]; // Use the first available session

  // Start forwarding job
  const startForwardingMutation = useMutation({
    mutationFn: async (config: ForwardConfig) => {
      if (!currentSession) {
        throw new Error('No active Telegram session found. Please authenticate first.');
      }

      const requestData = {
        ...config,
        sessionString: currentSession.sessionString,
        apiId: currentSession.apiId,
        apiHash: currentSession.apiHash,
      };

      const response = await fetch('/api/telegram/start-forwarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        throw new Error('Failed to start forwarding');
      }

      return response.json();
    },
    onSuccess: (data, config) => {
      const jobId = data.jobId;
      const newJob: ForwardJob = {
        id: jobId,
        config,
        status: 'running',
        currentOffset: config.offsetFrom,
        progress: 0,
        logs: [`Started forwarding from ${config.fromChatId} to ${config.toChatId}`],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setRunningJobs(prev => new Map(prev.set(jobId, newJob)));
      setSelectedJob(jobId);

      toast({
        title: 'Forwarding Started',
        description: `Started forwarding messages for "${config.name}".`,
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to Start',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  // Stop forwarding job
  const stopForwardingMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const response = await fetch('/api/telegram/stop-forwarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ jobId }),
      });

      if (!response.ok) {
        throw new Error('Failed to stop forwarding');
      }

      return response.json();
    },
    onSuccess: (_, jobId) => {
      setRunningJobs(prev => {
        const updated = new Map(prev);
        const job = updated.get(jobId);
        if (job) {
          job.status = 'paused';
          job.logs.push('Forwarding stopped by user');
        }
        return updated;
      });

      toast({
        title: 'Forwarding Stopped',
        description: 'The forwarding job has been stopped.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to Stop',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  // Get chat title by ID
  const getChatTitle = (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    return chat ? chat.title : `Chat ${chatId}`;
  };

  // Get status icon
  const getStatusIcon = (status: ForwardJob['status']) => {
    switch (status) {
      case 'running':
        return <Activity className="w-4 h-4 text-green-500 animate-pulse" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'paused':
        return <StopCircle className="w-4 h-4 text-yellow-500" />;
      default:
        return <div className="w-4 h-4 bg-gray-300 rounded-full" />;
    }
  };

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
            <PlayCircle className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Forwarder ⏩</h1>
            <p className="text-muted-foreground">Forward messages between Telegram chats</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Configuration Panel */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Settings className="w-5 h-5" />
                <span>Forward Configuration</span>
              </CardTitle>
              <CardDescription>
                Set up rules for forwarding messages between chats
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Configuration Name */}
              <div className="space-y-2">
                <Label htmlFor="config-name">Configuration Name</Label>
                <Input
                  id="config-name"
                  placeholder="e.g., News to Archive"
                  value={currentConfig.name}
                  onChange={(e) => setCurrentConfig(prev => ({ ...prev, name: e.target.value }))}
                  data-testid="input-config-name"
                />
              </div>

              {/* From Chat Selection */}
              <div className="space-y-2">
                <Label htmlFor="from-chat">From Chat</Label>
                <Select
                  value={currentConfig.fromChatId}
                  onValueChange={(value) => setCurrentConfig(prev => ({ ...prev, fromChatId: value }))}
                >
                  <SelectTrigger data-testid="select-from-chat">
                    <SelectValue placeholder="Select source chat" />
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

              {/* To Chat Selection */}
              <div className="space-y-2">
                <Label htmlFor="to-chat">To Chat</Label>
                <Select
                  value={currentConfig.toChatId}
                  onValueChange={(value) => setCurrentConfig(prev => ({ ...prev, toChatId: value }))}
                >
                  <SelectTrigger data-testid="select-to-chat">
                    <SelectValue placeholder="Select destination chat" />
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

              {/* Offset Configuration */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="offset-from">Offset From</Label>
                  <Input
                    id="offset-from"
                    type="number"
                    placeholder="0"
                    value={currentConfig.offsetFrom || ''}
                    onChange={(e) => setCurrentConfig(prev => ({ ...prev, offsetFrom: parseInt(e.target.value) || 0 }))}
                    data-testid="input-offset-from"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="offset-to">Offset To (0 = all)</Label>
                  <Input
                    id="offset-to"
                    type="number"
                    placeholder="0"
                    value={currentConfig.offsetTo || ''}
                    onChange={(e) => setCurrentConfig(prev => ({ ...prev, offsetTo: parseInt(e.target.value) || 0 }))}
                    data-testid="input-offset-to"
                  />
                </div>
              </div>

              <Button onClick={addConfig} className="w-full" data-testid="button-add-config">
                Add Configuration
              </Button>
            </CardContent>
          </Card>

          {/* Active Jobs Panel */}
          <Card>
            <CardHeader>
              <CardTitle>Active Jobs</CardTitle>
              <CardDescription>
                Monitor and control running forward jobs
              </CardDescription>
            </CardHeader>
            <CardContent>
              {runningJobs.size === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No active forwarding jobs
                </div>
              ) : (
                <div className="space-y-3">
                  {Array.from(runningJobs.values()).map((job) => (
                    <div key={job.id} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(job.status)}
                          <span className="font-medium">{job.config.name}</span>
                        </div>
                        <div className="flex space-x-1">
                          {job.status === 'running' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => stopForwardingMutation.mutate(job.id)}
                              disabled={stopForwardingMutation.isPending}
                              data-testid={`button-stop-${job.id}`}
                            >
                              <StopCircle className="w-3 h-3 mr-1" />
                              Stop
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => startForwardingMutation.mutate(job.config)}
                              disabled={startForwardingMutation.isPending}
                              data-testid={`button-start-${job.id}`}
                            >
                              <PlayCircle className="w-3 h-3 mr-1" />
                              Start
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {getChatTitle(job.config.fromChatId)} → {getChatTitle(job.config.toChatId)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Progress: {job.progress}% (Offset: {job.currentOffset})
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Saved Configurations */}
        {configs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Saved Configurations</CardTitle>
              <CardDescription>
                Your saved forward configurations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {configs.map((config, index) => (
                  <div key={index} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{config.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {getChatTitle(config.fromChatId)} → {getChatTitle(config.toChatId)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Offset: {config.offsetFrom} to {config.offsetTo || 'end'}
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          onClick={() => startForwardingMutation.mutate(config)}
                          disabled={startForwardingMutation.isPending}
                          data-testid={`button-start-config-${index}`}
                        >
                          <PlayCircle className="w-3 h-3 mr-1" />
                          Start
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => removeConfig(index)}
                          data-testid={`button-remove-config-${index}`}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Log Display */}
        {selectedJob && runningJobs.has(selectedJob) && (
          <Card>
            <CardHeader>
              <CardTitle>Forwarding Logs</CardTitle>
              <CardDescription>
                Real-time logs for {runningJobs.get(selectedJob)?.config.name}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                className="h-48 font-mono text-sm"
                value={runningJobs.get(selectedJob)?.logs.join('\n') || ''}
                readOnly
                data-testid="logs-display"
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}