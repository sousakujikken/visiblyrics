import { logger, enableProductionLogs, disableAllLogs, enableDebugLogs } from '../utils/logger';

// Configure logging based on environment
export function initializeLogging() {
  if (process.env.NODE_ENV === 'production') {
    // Only show errors in production
    enableProductionLogs();
  } else if (process.env.NODE_ENV === 'development') {
    // Disable all logs by default in development
    // Uncomment the line below to enable debug logs for specific modules
    // enableDebugLogs(['Engine', 'Timeline', 'Export']);
    
    // Or uncomment this to completely disable all logs:
    disableAllLogs();
  }
}

export { logger };