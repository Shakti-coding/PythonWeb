import React from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  MessageCircle,
  LayoutDashboard,
  MessageSquare,
  Search,
  CalendarRange,
  GitCompare,
  Download,
  Settings,
  FolderOpen,
  LogOut,
  Code2,
  Bot,
  Files,
  Forward,
  Github,
} from 'lucide-react';
import type { TelegramSession } from '@shared/schema';

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
  session: TelegramSession | null;
  onSelectFolder: () => void;
  onLogout: () => void;
  isDownloadDirectorySelected: boolean;
}

const navigationItems = [
  { id: 'python-script', label: '🐍 Python Script Mode', icon: Code2 },
  { id: 'python-bot', label: '🐍 Python Telethon Bot', icon: Bot },
  { id: 'python-copier', label: '🐍 Python Copier', icon: Forward },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'chats', label: 'Chat Selection', icon: MessageSquare },
  { id: 'messages', label: 'Message Search', icon: Search },
  { id: 'date-range', label: 'Date Range', icon: CalendarRange },
  { id: 'similarity', label: 'Similarity Search', icon: GitCompare },
  { id: 'downloads', label: 'Download', icon: Download },
  { id: 'forwarder', label: 'Forwarder ⏩', icon: Forward },
  { id: 'file-manager', label: '📁 File Manager', icon: Files },
  { id: 'bot-management', label: '🤖 Node js Bot', icon: Bot },
  { id: 'github-sync', label: '🐙 GitHub Sync', icon: Github },
  { id: 'git-control', label: '⚡ Git Control', icon: Github },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function Sidebar({
  currentView,
  onViewChange,
  session,
  onSelectFolder,
  onLogout,
  isDownloadDirectorySelected,
}: SidebarProps) {
  const userInitials = session?.firstName && session?.lastName
    ? `${session.firstName[0]}${session.lastName[0]}`
    : session?.firstName?.[0] || 'U';

  return (
    <aside className="w-72 bg-card border-r border-border flex flex-col">
      {/* App Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <MessageCircle className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Telegram Manager</h1>
            <p className="text-sm text-muted-foreground">Media & Messages</p>
          </div>
        </div>
      </div>

      {/* User Status */}
      {session && (
        <div className="p-4 border-b border-border bg-muted/30">
          <div className="flex items-center space-x-3">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
                {userInitials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="text-sm font-medium">
                {session.firstName} {session.lastName}
              </p>
              <p className="text-xs text-muted-foreground">{session.phoneNumber}</p>
            </div>
            <div className="w-2 h-2 bg-green-500 rounded-full" />
          </div>
        </div>
      )}

      {/* Navigation Menu */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`sidebar-item w-full px-3 py-2 rounded-md text-left flex items-center space-x-3 transition-all duration-200 hover:bg-muted hover:translate-x-1 ${
                isActive ? 'bg-primary text-primary-foreground' : 'text-foreground'
              }`}
              data-testid={`nav-${item.id}`}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer Actions */}
      <div className="p-4 border-t border-border space-y-2">
        <div className="flex space-x-2">
          <Button
            variant="secondary"
            size="sm"
            className="flex-1 justify-start"
            onClick={onSelectFolder}
            data-testid="button-select-folder"
          >
            <FolderOpen className="w-4 h-4 mr-2" />
            <span>
              {isDownloadDirectorySelected ? 'Change Folder' : 'Select Folder'}
            </span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="px-3"
            onClick={() => {
              import('@/lib/downloads').then(({ downloadManager }) => {
                downloadManager.setUseDefaultDownload(true);
              });
            }}
            data-testid="button-default-download"
          >
            Default
          </Button>
        </div>
        
        {session && (
          <Button
            variant="destructive"
            size="sm"
            className="w-full justify-start"
            onClick={onLogout}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            <span>Logout</span>
          </Button>
        )}
      </div>
    </aside>
  );
}
