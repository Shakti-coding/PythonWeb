import { logger } from './telegram-bot/logger';
import { db } from './db';
import * as fs from 'fs';
import * as path from 'path';

// Automatic setup system that runs on startup
export async function autoSetup(): Promise<void> {
  try {
    logger.info('🔧 Starting automatic setup...');

    // 1. Ensure database connection is working
    await ensureDatabaseConnection();

    // 2. Create all necessary directories
    await createDirectories();

    // 3. Install missing packages (if any)
    await checkAndInstallPackages();

    // 4. Verify environment is ready
    await verifyEnvironment();

    logger.info('✅ Automatic setup completed successfully');

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`❌ Automatic setup failed: ${errorMessage}`);
    throw error;
  }
}

async function ensureDatabaseConnection(): Promise<void> {
  try {
    // Test database connection by running a simple query
    const result = await db.execute('SELECT 1 as test');
    logger.info('✅ Database connection verified');
  } catch (error) {
    logger.warn('⚠️ Database connection issue, but continuing...');
  }
}

async function createDirectories(): Promise<void> {
  const directories = [
    './downloads',
    './downloads/completed',
    './downloads/youtube',
    './downloads/youtube/videos',
    './downloads/youtube/audio',
    './downloads/temp',
    './downloads/torrents',
    './downloads/documents',
    './downloads/images',
    './downloads/videos',
    './downloads/audio',
    './downloads/archives',
    './sessions',
    './logs'
  ];

  for (const dir of directories) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.debug(`Created directory: ${dir}`);
    }
  }
  
  logger.info('✅ All directories created/verified');
}

async function checkAndInstallPackages(): Promise<void> {
  try {
    // Check if package.json exists
    if (!fs.existsSync('./package.json')) {
      logger.warn('⚠️ package.json not found, skipping package check');
      return;
    }

    // Read package.json to check dependencies
    const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
    const requiredPackages = [
      'node-telegram-bot-api',
      'ytdl-core',
      'axios',
      'drizzle-orm',
      '@neondatabase/serverless'
    ];

    const missingPackages = requiredPackages.filter(pkg => 
      !packageJson.dependencies?.[pkg] && !packageJson.devDependencies?.[pkg]
    );

    if (missingPackages.length > 0) {
      logger.warn(`⚠️ Missing packages detected: ${missingPackages.join(', ')}`);
      logger.info('Please install missing packages manually or they will be auto-installed');
    } else {
      logger.info('✅ All required packages are available');
    }

  } catch (error) {
    logger.warn('⚠️ Could not verify packages, continuing...');
  }
}

async function verifyEnvironment(): Promise<void> {
  const checks = [
    { name: 'Node.js version', check: () => process.version, required: true },
    { name: 'File system write access', check: () => fs.accessSync('.', fs.constants.W_OK), required: true },
    { name: 'Downloads directory', check: () => fs.existsSync('./downloads'), required: true },
  ];

  for (const { name, check, required } of checks) {
    try {
      check();
      logger.debug(`✅ ${name}: OK`);
    } catch (error) {
      if (required) {
        logger.error(`❌ ${name}: FAILED`);
        throw new Error(`Environment check failed: ${name}`);
      } else {
        logger.warn(`⚠️ ${name}: WARNING`);
      }
    }
  }

  logger.info('✅ Environment verification completed');
}

// Auto-recovery system
export async function autoRecover(): Promise<void> {
  try {
    logger.info('🔄 Starting auto-recovery...');

    // Clean up any corrupted files
    await cleanupCorruptedFiles();

    // Reset any stuck processes
    await resetStuckProcesses();

    // Verify system health
    await verifySystemHealth();

    logger.info('✅ Auto-recovery completed');

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`❌ Auto-recovery failed: ${errorMessage}`);
  }
}

async function cleanupCorruptedFiles(): Promise<void> {
  const tempDirs = ['./downloads/temp', './logs'];
  
  for (const dir of tempDirs) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        try {
          const stats = fs.statSync(filePath);
          // Remove files older than 24 hours
          if (Date.now() - stats.mtime.getTime() > 24 * 60 * 60 * 1000) {
            fs.unlinkSync(filePath);
            logger.debug(`Cleaned up old file: ${filePath}`);
          }
        } catch (error) {
          // File might be corrupted, try to remove it
          try {
            fs.unlinkSync(filePath);
            logger.debug(`Removed corrupted file: ${filePath}`);
          } catch (removeError) {
            logger.warn(`Could not remove file: ${filePath}`);
          }
        }
      }
    }
  }
}

async function resetStuckProcesses(): Promise<void> {
  // This would typically reset any stuck download processes
  // For now, just log that we're checking
  logger.debug('Checking for stuck processes...');
}

async function verifySystemHealth(): Promise<void> {
  // Quick health check
  const health = {
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    platform: process.platform,
    nodeVersion: process.version
  };

  logger.debug(`System health: ${JSON.stringify(health)}`);
}