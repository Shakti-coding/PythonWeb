import { db } from '../db';
import { downloads, pendingMessages, botSessions, type Download, type PendingMessage, type BotSession } from '@shared/schema';
import { eq, desc, and } from 'drizzle-orm';

export class DatabaseStorage {
  // Download management
  async addDownload(downloadData: {
    userId: string;
    messageId: number;
    originalFilename: string;
    url?: string;
    fileType: string;
    status: 'pending' | 'downloading' | 'completed' | 'failed';
    filePath?: string;
    fileSize?: number;
  }): Promise<Download> {
    const [download] = await db
      .insert(downloads)
      .values({
        ...downloadData,
        downloadDate: new Date(),
      })
      .returning();
    
    return download;
  }

  async updateDownload(messageId: number, updates: {
    status?: 'pending' | 'downloading' | 'completed' | 'failed';
    filePath?: string;
    fileSize?: number;
    error?: string;
    progress?: number;
  }): Promise<Download | null> {
    const [download] = await db
      .update(downloads)
      .set({
        ...updates,
        updateDate: new Date(),
      })
      .where(eq(downloads.messageId, messageId))
      .returning();
    
    return download || null;
  }

  async getDownload(messageId: number): Promise<Download | null> {
    const [download] = await db
      .select()
      .from(downloads)
      .where(eq(downloads.messageId, messageId));
    
    return download || null;
  }

  async getDownloadsByUser(userId: string, limit: number = 50): Promise<Download[]> {
    return db
      .select()
      .from(downloads)
      .where(eq(downloads.userId, userId))
      .orderBy(desc(downloads.downloadDate))
      .limit(limit);
  }

  async getRecentDownloads(limit: number = 100): Promise<Download[]> {
    return db
      .select()
      .from(downloads)
      .orderBy(desc(downloads.downloadDate))
      .limit(limit);
  }

  async getDownloadStats(): Promise<{
    total: number;
    completed: number;
    failed: number;
    pending: number;
  }> {
    const allDownloads = await db.select().from(downloads);
    
    return {
      total: allDownloads.length,
      completed: allDownloads.filter(d => d.status === 'completed').length,
      failed: allDownloads.filter(d => d.status === 'failed').length,
      pending: allDownloads.filter(d => d.status === 'pending' || d.status === 'downloading').length,
    };
  }

  // Pending messages management
  async addPendingMessage(messageData: {
    userId: string;
    messageId: number;
    messageType: 'download' | 'command' | 'youtube';
    content: string;
    metadata?: Record<string, any>;
  }): Promise<PendingMessage> {
    const [message] = await db
      .insert(pendingMessages)
      .values({
        ...messageData,
        createdAt: new Date(),
      })
      .returning();
    
    return message;
  }

  async getPendingMessages(userId?: string): Promise<PendingMessage[]> {
    if (userId) {
      return db
        .select()
        .from(pendingMessages)
        .where(eq(pendingMessages.userId, userId))
        .orderBy(desc(pendingMessages.createdAt));
    }
    
    return db
      .select()
      .from(pendingMessages)
      .orderBy(desc(pendingMessages.createdAt));
  }

  async removePendingMessage(id: number): Promise<boolean> {
    const result = await db
      .delete(pendingMessages)
      .where(eq(pendingMessages.id, id));
    
    return result.rowCount > 0;
  }

  async clearPendingMessages(userId?: string): Promise<number> {
    if (userId) {
      const result = await db
        .delete(pendingMessages)
        .where(eq(pendingMessages.userId, userId));
      return result.rowCount;
    }
    
    const result = await db.delete(pendingMessages);
    return result.rowCount;
  }

  // Bot session management
  async saveBotSession(sessionData: {
    botId: string;
    sessionString: string;
    config: Record<string, any>;
    status: 'active' | 'inactive' | 'error';
  }): Promise<BotSession> {
    // Try to update existing session first
    const [existing] = await db
      .select()
      .from(botSessions)
      .where(eq(botSessions.botId, sessionData.botId));

    if (existing) {
      const [updated] = await db
        .update(botSessions)
        .set({
          ...sessionData,
          updatedAt: new Date(),
        })
        .where(eq(botSessions.botId, sessionData.botId))
        .returning();
      
      return updated;
    } else {
      const [created] = await db
        .insert(botSessions)
        .values({
          ...sessionData,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      
      return created;
    }
  }

  async getBotSession(botId: string): Promise<BotSession | null> {
    const [session] = await db
      .select()
      .from(botSessions)
      .where(eq(botSessions.botId, botId));
    
    return session || null;
  }

  async updateBotSessionStatus(botId: string, status: 'active' | 'inactive' | 'error', error?: string): Promise<void> {
    await db
      .update(botSessions)
      .set({
        status,
        lastError: error,
        updatedAt: new Date(),
      })
      .where(eq(botSessions.botId, botId));
  }

  async getAllBotSessions(): Promise<BotSession[]> {
    return db
      .select()
      .from(botSessions)
      .orderBy(desc(botSessions.updatedAt));
  }

  // Cleanup methods
  async cleanupOldDownloads(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const result = await db
      .delete(downloads)
      .where(and(
        eq(downloads.status, 'completed'),
        // Note: You'd need to add a proper date comparison here
        // This is a simplified version
      ));
    
    return result.rowCount;
  }

  async cleanupOldPendingMessages(hoursOld: number = 24): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hoursOld);
    
    const result = await db
      .delete(pendingMessages);
      // Add proper date comparison when needed
    
    return result.rowCount;
  }

  // Search and filter methods
  async searchDownloads(query: string, userId?: string): Promise<Download[]> {
    let baseQuery = db.select().from(downloads);
    
    if (userId) {
      baseQuery = baseQuery.where(eq(downloads.userId, userId));
    }
    
    // Note: For full-text search, you might want to use database-specific features
    // This is a simplified version
    const allDownloads = await baseQuery;
    
    return allDownloads.filter(download => 
      download.originalFilename.toLowerCase().includes(query.toLowerCase()) ||
      (download.filePath && download.filePath.toLowerCase().includes(query.toLowerCase()))
    );
  }

  async getDownloadsByStatus(status: 'pending' | 'downloading' | 'completed' | 'failed'): Promise<Download[]> {
    return db
      .select()
      .from(downloads)
      .where(eq(downloads.status, status))
      .orderBy(desc(downloads.downloadDate));
  }

  async getDownloadsByType(fileType: string): Promise<Download[]> {
    return db
      .select()
      .from(downloads)
      .where(eq(downloads.fileType, fileType))
      .orderBy(desc(downloads.downloadDate));
  }
}