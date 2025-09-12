// ===========================================
// COMPREHENSIVE GITHUB FEATURES - COMPLETE API ENDPOINTS  
// ===========================================

import { Request, Response } from 'express';

// GitHub Workflows and Actions
export const getWorkflows = async (accessToken: string, owner: string, repo: string) => {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'TelegramManager-GitControl'
    }
  });
  return response;
};

export const getWorkflowRuns = async (accessToken: string, owner: string, repo: string, workflowId: string) => {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'TelegramManager-GitControl'
    }
  });
  return response;
};

export const triggerWorkflow = async (accessToken: string, owner: string, repo: string, workflowId: string, ref: string = 'main') => {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'TelegramManager-GitControl',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ref })
  });
  return response;
};

// Repository and Organization Secrets
export const getRepoSecrets = async (accessToken: string, owner: string, repo: string) => {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/secrets`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'TelegramManager-GitControl'
    }
  });
  return response;
};

export const getOrgSecrets = async (accessToken: string, org: string) => {
  const response = await fetch(`https://api.github.com/orgs/${org}/actions/secrets`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'TelegramManager-GitControl'
    }
  });
  return response;
};

// SSH and GPG Keys Management
export const getUserSSHKeys = async (accessToken: string) => {
  const response = await fetch('https://api.github.com/user/keys', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'TelegramManager-GitControl'
    }
  });
  return response;
};

export const getUserGPGKeys = async (accessToken: string) => {
  const response = await fetch('https://api.github.com/user/gpg_keys', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'TelegramManager-GitControl'
    }
  });
  return response;
};

export const addSSHKey = async (accessToken: string, title: string, key: string) => {
  const response = await fetch('https://api.github.com/user/keys', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'TelegramManager-GitControl',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ title, key })
  });
  return response;
};

// Packages and Registry
export const getUserPackages = async (accessToken: string, packageType: string = 'npm') => {
  const response = await fetch(`https://api.github.com/user/packages?package_type=${packageType}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'TelegramManager-GitControl'
    }
  });
  return response;
};

export const getOrgPackages = async (accessToken: string, org: string, packageType: string = 'npm') => {
  const response = await fetch(`https://api.github.com/orgs/${org}/packages?package_type=${packageType}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'TelegramManager-GitControl'
    }
  });
  return response;
};

// Organizations and Teams
export const getUserOrgs = async (accessToken: string) => {
  const response = await fetch('https://api.github.com/user/orgs', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'TelegramManager-GitControl'
    }
  });
  return response;
};

export const getOrgTeams = async (accessToken: string, org: string) => {
  const response = await fetch(`https://api.github.com/orgs/${org}/teams`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'TelegramManager-GitControl'
    }
  });
  return response;
};

export const getTeamMembers = async (accessToken: string, org: string, teamSlug: string) => {
  const response = await fetch(`https://api.github.com/orgs/${org}/teams/${teamSlug}/members`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'TelegramManager-GitControl'
    }
  });
  return response;
};

// Projects (Classic and Beta)
export const getOrgProjects = async (accessToken: string, org: string) => {
  const response = await fetch(`https://api.github.com/orgs/${org}/projects`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'TelegramManager-GitControl',
      'Accept': 'application/vnd.github.inertia-preview+json'
    }
  });
  return response;
};

export const getRepoProjects = async (accessToken: string, owner: string, repo: string) => {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/projects`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'TelegramManager-GitControl',
      'Accept': 'application/vnd.github.inertia-preview+json'
    }
  });
  return response;
};

// Discussions
export const getRepoDiscussions = async (accessToken: string, owner: string, repo: string) => {
  const query = `
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        discussions(first: 50) {
          nodes {
            id
            title
            body
            createdAt
            updatedAt
            author {
              login
              avatarUrl
            }
            category {
              name
              emoji
            }
            answerChosenAt
            upvoteCount
          }
        }
      }
    }
  `;
  
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'TelegramManager-GitControl',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables: { owner, repo } })
  });
  return response;
};

// Audit Logs (Organization level)
export const getOrgAuditLog = async (accessToken: string, org: string) => {
  const response = await fetch(`https://api.github.com/orgs/${org}/audit-log`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'TelegramManager-GitControl'
    }
  });
  return response;
};

// GitHub Copilot 
export const getCopilotUsage = async (accessToken: string, org?: string) => {
  const endpoint = org 
    ? `https://api.github.com/orgs/${org}/copilot/usage`
    : 'https://api.github.com/user/copilot/usage';
    
  const response = await fetch(endpoint, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'TelegramManager-GitControl'
    }
  });
  return response;
};

export const getCopilotSeats = async (accessToken: string, org: string) => {
  const response = await fetch(`https://api.github.com/orgs/${org}/copilot/billing/seats`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'TelegramManager-GitControl'
    }
  });
  return response;
};

// Rate Limits
export const getRateLimits = async (accessToken: string) => {
  const response = await fetch('https://api.github.com/rate_limit', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'TelegramManager-GitControl'
    }
  });
  return response;
};

// Issues and Pull Requests
export const getRepoIssues = async (accessToken: string, owner: string, repo: string, state: string = 'open') => {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues?state=${state}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'TelegramManager-GitControl'
    }
  });
  return response;
};

// Releases
export const getRepoReleases = async (accessToken: string, owner: string, repo: string) => {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'TelegramManager-GitControl'
    }
  });
  return response;
};

// Labels and Milestones
export const getRepoLabels = async (accessToken: string, owner: string, repo: string) => {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/labels`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'TelegramManager-GitControl'
    }
  });
  return response;
};

export const getRepoMilestones = async (accessToken: string, owner: string, repo: string) => {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/milestones`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'TelegramManager-GitControl'
    }
  });
  return response;
};