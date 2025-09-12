import React, { useState, useEffect } from 'react';
import { Sidebar } from '@/components/sidebar';
import { Dashboard } from '@/components/dashboard';
import { ChatSelection } from '@/components/chat-selection';
import { MessageSearch } from '@/components/message-search';
import { DateRange } from '@/components/date-range';
import { VideoDownloads } from '@/components/video-downloads';
import { Settings } from '@/components/settings';
import { PythonScriptMain } from '@/components/python-script-main';
import { BotManagement } from '@/components/bot-management';
import { PythonBot } from '@/components/python-bot';
import { PythonCopier } from '@/components/python-copier';
import { Forwarder } from '@/components/forwarder';
import { GitHubSync } from '@/components/github-sync';
import GitControl from '@/components/git-control';
import { AuthModal } from '@/components/auth-modal';
import { Button } from '@/components/ui/button';
import { Sun, Moon } from 'lucide-react';
import { useLocation, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { storage } from '@/lib/storage';
import { telegramManager } from '@/lib/telegram';
import { downloadManager } from '@/lib/downloads';
import type { TelegramSession } from '@shared/schema';

export default function Home() {
  const [currentView, setCurrentView] = useState('python-script');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [currentSession, setCurrentSession] = useState<TelegramSession | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  const { toast } = useToast();

  // Initialize dark mode from localStorage and system preference
  useEffect(() => {
    const savedMode = localStorage.getItem('darkMode');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldUseDark = savedMode ? savedMode === 'true' : systemPrefersDark;
    
    setIsDarkMode(shouldUseDark);
    if (shouldUseDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    localStorage.setItem('darkMode', newMode.toString());
    
    if (newMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  // Check for existing session on load
  const { data: sessions = [] } = useQuery<TelegramSession[]>({
    queryKey: ['sessions'],
    queryFn: async () => {
      return await storage.getAllSessions();
    },
  });

  // Check for existing session on app start
  useEffect(() => {
    const checkExistingSession = async () => {
      // Check if there's an active session
      const existingSession = localStorage.getItem('telegram_session');
      
      if (existingSession && sessions.length > 0) {
        // User is already logged in, don't show auth modal
        const latestSession = sessions[0];
        try {
          await telegramManager.loadSession(latestSession);
          setCurrentSession(latestSession);
          
          // Load chats in background
          setTimeout(async () => {
            try {
              const chats = await telegramManager.getChats();
              await storage.saveChats(chats);
              console.log('✅ Auto-loaded chats:', chats.length, 'chats');
            } catch (error) {
              console.error('Failed to auto-load chats:', error);
            }
          }, 1000);
        } catch (error) {
          console.error('Failed to restore session:', error);
          // Clear invalid session and show login options
          localStorage.removeItem('telegram_session');
          setIsAuthModalOpen(true);
        }
      } else if (!existingSession || sessions.length === 0) {
        // No valid session found, show login options
        setIsAuthModalOpen(true);
      }
    };

    checkExistingSession();
  }, [sessions]); // Run when sessions data is available

  const handleAuthSuccess = (session: TelegramSession) => {
    setCurrentSession(session);
    setIsAuthModalOpen(false);
    
    // Set localStorage flag to prevent modal from showing again
    localStorage.setItem('telegram_session', 'active');
    
    toast({
      title: 'Welcome!',
      description: 'Successfully connected to Telegram',
    });
  };

  const handleLogout = async () => {
    try {
      // Clear all session data
      if (currentSession) {
        await storage.deleteSession(currentSession.phoneNumber);
      }
      
      // Clear localStorage backup
      localStorage.removeItem('telegram_session');
      
      // Disconnect from Telegram
      await telegramManager.disconnect();
      
      // Reset state
      setCurrentSession(null);
      
      // Invalidate session queries to refresh
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      
      // Show login options
      setIsAuthModalOpen(true);
      
      toast({
        title: 'Logged out',
        description: 'You have been disconnected from Telegram',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Logout failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const handleSelectFolder = async () => {
    try {
      const success = await downloadManager.selectDownloadDirectory();
      if (success) {
        toast({
          title: 'Download folder selected',
          description: 'Videos will be saved to the selected folder',
        });
      }
      // If success is false, user cancelled - no need to show any message
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to select folder',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const renderCurrentView = () => {
    switch (currentView) {
      case 'python-script':
        return <PythonScriptMain />;
      case 'python-bot':
        return <PythonBot />;
      case 'python-copier':
        return <PythonCopier />;
      case 'dashboard':
        return <Dashboard onViewChange={setCurrentView} />;
      case 'chats':
        return <ChatSelection />;
      case 'messages':
        return <MessageSearch />;
      case 'date-range':
        return <DateRange />;
      case 'similarity':
        return <MessageSearch />; // Reuse MessageSearch component for similarity
      case 'downloads':
        return <VideoDownloads />;
      case 'forwarder':
        return <Forwarder />;
      case 'file-manager':
        // Navigate to the downloads page
        return (
          <div className="p-6 h-full flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-4">File Manager</h2>
              <p className="text-muted-foreground mb-6">
                Manage and view your downloaded files from the Telegram bot.
              </p>
              <Link href="/downloads">
                <Button className="px-8 py-3 text-lg">
                  Open File Manager
                </Button>
              </Link>
            </div>
          </div>
        );
      case 'bot-management':
        return <BotManagement />;
      case 'github-sync':
        return <GitHubSync />;
      case 'git-control':
        return <GitControl />;
      case 'settings':
        return <Settings />;
      default:
        return <PythonScriptMain />; // Default to Python script mode
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar
        currentView={currentView}
        onViewChange={setCurrentView}
        session={currentSession}
        onSelectFolder={handleSelectFolder}
        onLogout={handleLogout}
        isDownloadDirectorySelected={downloadManager.isDownloadDirectorySelected()}
      />
      
      <main className="flex-1 overflow-hidden relative">
        {renderCurrentView()}
        
        {/* Floating Dark/Light Mode Toggle */}
        <Button
          variant="outline"
          size="icon"
          onClick={toggleDarkMode}
          className="fixed top-4 right-4 z-50 w-10 h-10 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 bg-background/80 backdrop-blur-sm border-2"
          data-testid="toggle-dark-mode"
        >
          {isDarkMode ? (
            <Sun className="h-4 w-4 text-yellow-500" />
          ) : (
            <Moon className="h-4 w-4 text-blue-600" />
          )}
        </Button>
      </main>

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => {
          // Only allow closing if we have a session
          if (currentSession) {
            setIsAuthModalOpen(false);
          }
        }}
        onSuccess={handleAuthSuccess}
      />
    </div>
  );
}
