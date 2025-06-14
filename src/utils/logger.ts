type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  enabled: boolean;
  level: LogLevel;
  enabledModules?: string[];
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

class Logger {
  private config: LoggerConfig;
  
  constructor() {
    this.config = {
      enabled: process.env.NODE_ENV === 'development',
      level: 'error',
      enabledModules: []
    };
  }
  
  setConfig(config: Partial<LoggerConfig>) {
    this.config = { ...this.config, ...config };
  }
  
  private shouldLog(level: LogLevel, module?: string): boolean {
    if (!this.config.enabled) return false;
    
    if (module && this.config.enabledModules && this.config.enabledModules.length > 0) {
      if (!this.config.enabledModules.includes(module)) return false;
    }
    
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.level];
  }
  
  debug(message: string, ...args: any[]) {
    if (this.shouldLog('debug')) {
      console.log(message, ...args);
    }
  }
  
  info(message: string, ...args: any[]) {
    if (this.shouldLog('info')) {
      console.log(message, ...args);
    }
  }
  
  warn(message: string, ...args: any[]) {
    if (this.shouldLog('warn')) {
      console.warn(message, ...args);
    }
  }
  
  error(message: string, ...args: any[]) {
    if (this.shouldLog('error')) {
      console.error(message, ...args);
    }
  }
  
  module(moduleName: string) {
    return {
      debug: (message: string, ...args: any[]) => {
        if (this.shouldLog('debug', moduleName)) {
          console.log(`[${moduleName}] ${message}`, ...args);
        }
      },
      info: (message: string, ...args: any[]) => {
        if (this.shouldLog('info', moduleName)) {
          console.log(`[${moduleName}] ${message}`, ...args);
        }
      },
      warn: (message: string, ...args: any[]) => {
        if (this.shouldLog('warn', moduleName)) {
          console.warn(`[${moduleName}] ${message}`, ...args);
        }
      },
      error: (message: string, ...args: any[]) => {
        if (this.shouldLog('error', moduleName)) {
          console.error(`[${moduleName}] ${message}`, ...args);
        }
      }
    };
  }
}

export const logger = new Logger();

export const disableAllLogs = () => {
  logger.setConfig({ enabled: false });
};

export const enableProductionLogs = () => {
  logger.setConfig({ 
    enabled: true, 
    level: 'error' 
  });
};

export const enableDebugLogs = (modules?: string[]) => {
  logger.setConfig({ 
    enabled: true, 
    level: 'debug',
    enabledModules: modules
  });
};