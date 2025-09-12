interface LogLevel {
  DEBUG: number;
  INFO: number;
  WARN: number;
  ERROR: number;
}

class Logger {
  private static instance: Logger;
  private logLevel: number = 0; // DEBUG level by default

  private levels: LogLevel = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
  };

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    return `[${timestamp}] ${level.padEnd(7)} ${message}`;
  }

  private log(level: keyof LogLevel, message: string): void {
    if (this.levels[level] >= this.logLevel) {
      console.log(this.formatMessage(level, message));
    }
  }

  debug(message: string): void {
    this.log('DEBUG', message);
  }

  info(message: string): void {
    this.log('INFO', message);
  }

  warn(message: string): void {
    this.log('WARN', message);
  }

  error(message: string): void {
    this.log('ERROR', message);
  }

  setLevel(level: keyof LogLevel): void {
    this.logLevel = this.levels[level];
  }
}

export const logger = Logger.getInstance();