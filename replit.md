# Telegram Manager

## Overview

This is a comprehensive Telegram client application built with React and Express that provides advanced message management and media downloading capabilities. The application allows users to authenticate with Telegram, search through chat messages, download videos and media files, and perform sophisticated message filtering operations. It features a modern dark-themed UI with comprehensive chat management tools including similarity-based message search, date range filtering, and bulk video download functionality.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript using Vite as the build tool
- **UI Library**: Shadcn/UI components built on Radix UI primitives with Tailwind CSS for styling
- **State Management**: TanStack Query (React Query) for server state management and caching
- **Routing**: Wouter for lightweight client-side routing
- **Storage**: IndexedDB for persistent local data storage of sessions, chats, messages, and downloads
- **Client Structure**: Component-based architecture with pages, UI components, and utility libraries

### Backend Architecture
- **Server Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM for schema management and queries
- **Session Management**: In-memory storage with interfaces designed for easy database integration
- **API Design**: RESTful API structure with `/api` prefix for all endpoints
- **Development Setup**: Vite integration for hot module replacement in development

### Data Storage Solutions
- **Primary Database**: PostgreSQL configured through Drizzle with connection to Neon serverless database
- **Local Storage**: IndexedDB implementation for offline-first functionality
- **Session Storage**: Dual approach with both database persistence and in-memory storage
- **File Downloads**: Browser File System Access API for direct file system integration

### Authentication and Authorization
- **Telegram Authentication**: Direct integration with Telegram Client API using session strings
- **Session Management**: Persistent session storage with automatic session restoration
- **API Credentials**: Secure handling of Telegram API credentials (API ID and API Hash)
- **Multi-step Auth**: Phone number, SMS code, and optional password verification flow

### External Dependencies
- **Telegram Integration**: Official Telegram client library for full API access
- **UI Components**: Extensive Radix UI component library for accessible interface elements
- **Database**: Neon serverless PostgreSQL for scalable data persistence
- **File Handling**: Native browser File System Access API for downloads
- **Development Tools**: Replit-specific plugins for development environment integration

The application follows a modular architecture with clear separation between the React frontend and Express backend, connected through a well-defined API interface. The system is designed for scalability with proper database integration while maintaining offline functionality through local storage.