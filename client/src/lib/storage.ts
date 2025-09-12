import type { TelegramSession, Chat, Message, DownloadItem } from '@shared/schema';

const DB_NAME = 'TelegramManager';
const DB_VERSION = 1;

interface StorageSchema {
  sessions: TelegramSession;
  chats: Chat;
  messages: Message;
  downloads: DownloadItem;
}

class IndexedDBStorage {
  private db: IDBDatabase | null = null;

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Sessions store
        if (!db.objectStoreNames.contains('sessions')) {
          const sessionStore = db.createObjectStore('sessions', { keyPath: 'phoneNumber' });
          sessionStore.createIndex('userId', 'userId', { unique: false });
        }

        // Chats store
        if (!db.objectStoreNames.contains('chats')) {
          const chatStore = db.createObjectStore('chats', { keyPath: 'id' });
          chatStore.createIndex('title', 'title', { unique: false });
          chatStore.createIndex('type', 'type', { unique: false });
        }

        // Messages store
        if (!db.objectStoreNames.contains('messages')) {
          const messageStore = db.createObjectStore('messages', { keyPath: ['chatId', 'id'] });
          messageStore.createIndex('chatId', 'chatId', { unique: false });
          messageStore.createIndex('date', 'date', { unique: false });
          messageStore.createIndex('hasMedia', 'hasMedia', { unique: false });
        }

        // Downloads store
        if (!db.objectStoreNames.contains('downloads')) {
          const downloadStore = db.createObjectStore('downloads', { keyPath: 'id' });
          downloadStore.createIndex('status', 'status', { unique: false });
          downloadStore.createIndex('chatId', 'chatId', { unique: false });
        }
      };
    });
  }

  private async transaction<T extends keyof StorageSchema>(
    storeName: T,
    mode: IDBTransactionMode = 'readonly'
  ): Promise<IDBObjectStore> {
    if (!this.db) {
      await this.initialize();
    }
    
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const transaction = this.db.transaction([storeName], mode);
    return transaction.objectStore(storeName);
  }

  // Session management
  async saveSession(session: TelegramSession): Promise<void> {
    const enhancedSession = {
      ...session,
      savedAt: new Date().toISOString(),
      permanent: true, // Never expire this session
    };
    
    const store = await this.transaction('sessions', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(enhancedSession);
      request.onsuccess = () => {
        // Also save to localStorage as backup for mobile
        localStorage.setItem('telegram_session', JSON.stringify(enhancedSession));
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Method to directly set session string for automatic login
  async setPreConfiguredSession(sessionString: string, apiId: number, apiHash: string, phoneNumber: string): Promise<void> {
    const sessionData: TelegramSession = {
      sessionString,
      apiId,
      apiHash,
      phoneNumber,
      userId: 'auto-configured',
      firstName: 'Auto Login',
      lastName: 'User',
    };
    
    await this.saveSession(sessionData);
  }

  async getSession(phoneNumber: string): Promise<TelegramSession | null> {
    const store = await this.transaction('sessions');
    return new Promise((resolve, reject) => {
      const request = store.get(phoneNumber);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllSessions(): Promise<TelegramSession[]> {
    const store = await this.transaction('sessions');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        let sessions = request.result;
        
        // Also check localStorage as backup for mobile
        const backupSession = localStorage.getItem('telegram_session');
        if (backupSession && sessions.length === 0) {
          try {
            const parsed = JSON.parse(backupSession);
            sessions = [parsed];
          } catch (error) {
            console.error('Failed to parse backup session:', error);
          }
        }
        
        resolve(sessions);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteSession(phoneNumber: string): Promise<void> {
    const store = await this.transaction('sessions', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(phoneNumber);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Chat management
  async saveChats(chats: Chat[]): Promise<void> {
    const store = await this.transaction('chats', 'readwrite');
    return new Promise((resolve, reject) => {
      let completed = 0;
      const total = chats.length;

      if (total === 0) {
        resolve();
        return;
      }

      chats.forEach(chat => {
        const request = store.put(chat);
        request.onsuccess = () => {
          completed++;
          if (completed === total) resolve();
        };
        request.onerror = () => reject(request.error);
      });
    });
  }

  async getChats(): Promise<Chat[]> {
    const store = await this.transaction('chats');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getChat(chatId: string): Promise<Chat | null> {
    const store = await this.transaction('chats');
    return new Promise((resolve, reject) => {
      const request = store.get(chatId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  // Message management
  async saveMessages(messages: Message[]): Promise<void> {
    const store = await this.transaction('messages', 'readwrite');
    return new Promise((resolve, reject) => {
      let completed = 0;
      const total = messages.length;

      if (total === 0) {
        resolve();
        return;
      }

      messages.forEach(message => {
        const request = store.put(message);
        request.onsuccess = () => {
          completed++;
          if (completed === total) resolve();
        };
        request.onerror = () => reject(request.error);
      });
    });
  }

  async getMessages(chatId: string, limit?: number): Promise<Message[]> {
    const store = await this.transaction('messages');
    const index = store.index('chatId');
    
    return new Promise((resolve, reject) => {
      const request = limit ? index.getAll(chatId, limit) : index.getAll(chatId);
      request.onsuccess = () => {
        const results = request.result.sort((a, b) => 
          new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getMessage(chatId: string, messageId: number): Promise<Message | null> {
    const store = await this.transaction('messages');
    return new Promise((resolve, reject) => {
      const request = store.get([chatId, messageId]);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async searchMessages(chatId: string, query: string, dateFrom?: string, dateTo?: string): Promise<Message[]> {
    const messages = await this.getMessages(chatId);
    
    return messages.filter(message => {
      // Text search
      if (query && !message.text?.toLowerCase().includes(query.toLowerCase())) {
        return false;
      }
      
      // Date range filter
      if (dateFrom && new Date(message.date) < new Date(dateFrom)) {
        return false;
      }
      
      if (dateTo && new Date(message.date) > new Date(dateTo)) {
        return false;
      }
      
      return true;
    });
  }

  // Download management
  async saveDownload(download: DownloadItem): Promise<void> {
    const store = await this.transaction('downloads', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(download);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getDownloads(): Promise<DownloadItem[]> {
    const store = await this.transaction('downloads');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async updateDownloadProgress(downloadId: string, progress: number, speed?: number): Promise<void> {
    const store = await this.transaction('downloads', 'readwrite');
    return new Promise((resolve, reject) => {
      const getRequest = store.get(downloadId);
      getRequest.onsuccess = () => {
        const download = getRequest.result;
        if (download) {
          download.progress = progress;
          if (speed !== undefined) download.speed = speed;
          
          const putRequest = store.put(download);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          reject(new Error('Download not found'));
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async deleteDownload(downloadId: string): Promise<void> {
    const store = await this.transaction('downloads', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(downloadId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearAll(): Promise<void> {
    if (!this.db) return;

    const storeNames: (keyof StorageSchema)[] = ['sessions', 'chats', 'messages', 'downloads'];
    
    for (const storeName of storeNames) {
      const store = await this.transaction(storeName, 'readwrite');
      await new Promise<void>((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
  }
}

export const storage = new IndexedDBStorage();
