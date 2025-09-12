// Simple storage interface for Telegram Manager
// All data is handled by IndexedDB on the frontend

import { 
  GitHubSettings, 
  InsertGitHubSettings, 
  GitTokenConfig, 
  InsertGitTokenConfig,
  GitRepository,
  InsertGitRepository
} from "@shared/schema";

export interface IStorage {
  // This storage is primarily for backend session management if needed
  // Most storage operations happen in the frontend with IndexedDB
  
  // GitHub PAT settings (existing)
  getGitHubSettings(userId: string): Promise<GitHubSettings | null>;
  saveGitHubSettings(userId: string, settings: InsertGitHubSettings): Promise<GitHubSettings>;
  getDefaultGitHubPAT(): Promise<string | null>;
  
  // Git Control - Token Management
  getGitTokenConfigs(): Promise<GitTokenConfig[]>;
  saveGitTokenConfig(config: InsertGitTokenConfig): Promise<GitTokenConfig>;
  deleteGitTokenConfig(id: number): Promise<boolean>;
  updateTokenLastUsed(id: number): Promise<void>;
  
  // Git Control - Repository Cache
  getCachedRepositories(): Promise<GitRepository[]>;
  saveCachedRepository(repo: InsertGitRepository): Promise<GitRepository>;
  deleteCachedRepository(fullName: string): Promise<boolean>;
  clearRepositoryCache(): Promise<void>;
}

export class MemStorage implements IStorage {
  private githubSettings: Map<string, GitHubSettings> = new Map();
  private gitTokenConfigs: Map<number, GitTokenConfig> = new Map();
  private cachedRepositories: Map<string, GitRepository> = new Map();
  private tokenIdCounter: number = 1;
  private defaultPAT: string = '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';

  constructor() {
    // Backend storage placeholder - main storage is client-side IndexedDB
  }

  // Existing GitHub settings methods
  async getGitHubSettings(userId: string): Promise<GitHubSettings | null> {
    return this.githubSettings.get(userId) || null;
  }

  async saveGitHubSettings(userId: string, settings: InsertGitHubSettings): Promise<GitHubSettings> {
    const savedSettings: GitHubSettings = {
      id: this.githubSettings.size + 1,
      userId,
      personalAccessToken: settings.personalAccessToken || null,
      isDefault: settings.isDefault || false,
      updatedAt: new Date(),
    };
    this.githubSettings.set(userId, savedSettings);
    return savedSettings;
  }

  async getDefaultGitHubPAT(): Promise<string | null> {
    return this.defaultPAT;
  }

  // Git Control - Token Management
  async getGitTokenConfigs(): Promise<GitTokenConfig[]> {
    return Array.from(this.gitTokenConfigs.values());
  }

  async saveGitTokenConfig(config: InsertGitTokenConfig): Promise<GitTokenConfig> {
    const savedConfig: GitTokenConfig = {
      id: this.tokenIdCounter++,
      label: config.label,
      tokenHash: config.tokenHash,
      scopes: config.scopes || [],
      createdAt: new Date(),
      lastUsed: null,
    };
    this.gitTokenConfigs.set(savedConfig.id, savedConfig);
    return savedConfig;
  }

  async deleteGitTokenConfig(id: number): Promise<boolean> {
    return this.gitTokenConfigs.delete(id);
  }

  async updateTokenLastUsed(id: number): Promise<void> {
    const config = this.gitTokenConfigs.get(id);
    if (config) {
      config.lastUsed = new Date();
      this.gitTokenConfigs.set(id, config);
    }
  }

  // Git Control - Repository Cache
  async getCachedRepositories(): Promise<GitRepository[]> {
    return Array.from(this.cachedRepositories.values());
  }

  async saveCachedRepository(repo: InsertGitRepository): Promise<GitRepository> {
    const savedRepo: GitRepository = {
      id: this.cachedRepositories.size + 1,
      owner: repo.owner,
      name: repo.name,
      fullName: repo.fullName,
      private: repo.private || false,
      description: repo.description || null,
      defaultBranch: repo.defaultBranch || 'main',
      homepage: repo.homepage || null,
      topics: repo.topics || [],
      cachedAt: new Date(),
    };
    this.cachedRepositories.set(repo.fullName, savedRepo);
    return savedRepo;
  }

  async deleteCachedRepository(fullName: string): Promise<boolean> {
    return this.cachedRepositories.delete(fullName);
  }

  async clearRepositoryCache(): Promise<void> {
    this.cachedRepositories.clear();
  }
}

export const storage = new MemStorage();
