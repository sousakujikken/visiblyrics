import * as electron from 'electron';
const { contextBridge, ipcRenderer } = electron;
import type { 
  ProjectData, 
  MediaFileInfo, 
  ExportOptions, 
  ExportProgress, 
  ExportError,
  FontInfo
} from '../shared/types';

// Secure API exposure to renderer process
const electronAPI = {
  // File management
  saveProject: (projectData: ProjectData): Promise<string> => 
    ipcRenderer.invoke('file:save-project', projectData),
  
  loadProject: (): Promise<ProjectData> => 
    ipcRenderer.invoke('file:load-project'),
  
  selectMedia: (type: 'video' | 'audio'): Promise<MediaFileInfo> => 
    ipcRenderer.invoke('file:select-media', type),
  
  // Video export (legacy)
  startExport: (options: ExportOptions): Promise<void> => 
    ipcRenderer.invoke('export:start', options),
  
  cancelExport: (): Promise<void> => 
    ipcRenderer.invoke('export:cancel'),
  
  // Video export save dialog
  showSaveDialogForVideo: (defaultFileName: string): Promise<string | null> =>
    ipcRenderer.invoke('export:showSaveDialogForVideo', defaultFileName),
  
  // Seek and Snap Video Export (new)
  createTempSession: (sessionId: string): Promise<string> =>
    ipcRenderer.invoke('export:createTempSession', sessionId),
  
  saveFrameImage: (sessionId: string, frameName: string, frameData: Uint8Array, width?: number, height?: number): Promise<string> =>
    ipcRenderer.invoke('export:saveFrameImage', sessionId, frameName, frameData, width, height),
  
  createBatchVideo: (options: {
    sessionId: string;
    batchIndex: number;
    startFrame: number;
    endFrame: number;
    fps: number;
    width: number;
    height: number;
    videoQuality: 'low' | 'medium' | 'high' | 'highest';
  }): Promise<string> =>
    ipcRenderer.invoke('export:createBatchVideo', options),
  
  composeFinalVideo: (options: {
    sessionId: string;
    batchVideos: string[];
    fileName: string;
    includeMusicTrack?: boolean;
    audioPath?: string;
    outputPath?: string;
  }): Promise<string> =>
    ipcRenderer.invoke('export:composeFinalVideo', options),
  
  cleanupTempSession: (sessionId: string): Promise<void> =>
    ipcRenderer.invoke('export:cleanupTempSession', sessionId),
  
  getStorageStats: (sessionId?: string): Promise<{
    totalSpace: number;
    freeSpace: number;
    usedBySession: number;
    usagePercent: number;
  }> =>
    ipcRenderer.invoke('export:getStorageStats', sessionId),
  
  // Event listeners for export process
  onExportProgress: (callback: (progress: ExportProgress) => void) => {
    const subscription = (event: any, progress: ExportProgress) => callback(progress);
    ipcRenderer.on('export:progress', subscription);
    return () => ipcRenderer.removeListener('export:progress', subscription);
  },
  
  onExportCompleted: (callback: (outputPath: string) => void) => {
    const subscription = (event: any, outputPath: string) => callback(outputPath);
    ipcRenderer.on('export:completed', subscription);
    return () => ipcRenderer.removeListener('export:completed', subscription);
  },
  
  onExportError: (callback: (error: ExportError) => void) => {
    const subscription = (event: any, error: ExportError) => callback(error);
    ipcRenderer.on('export:error', subscription);
    return () => ipcRenderer.removeListener('export:error', subscription);
  },
  
  // Frame generation for export (renderer -> main)
  onExportRequest: (
    channel: 'generate-frame', 
    callback: (options: { timeMs: number; width: number; height: number }) => void
  ) => {
    const subscription = (event: any, options: any) => callback(options);
    ipcRenderer.on(`export:${channel}`, subscription);
    return () => ipcRenderer.removeListener(`export:${channel}`, subscription);
  },
  
  sendExportReply: (channel: 'frame-ready' | 'frame-error', data: string) => {
    ipcRenderer.send(`export:${channel}`, data);
  },
  
  // App utilities
  getAppVersion: (): Promise<string> => 
    ipcRenderer.invoke('app:get-version'),
  
  getAppPath: (name: string): Promise<string> => 
    ipcRenderer.invoke('app:get-path', name),
  
  // Font management
  getSystemFonts: (): Promise<FontInfo[]> => 
    ipcRenderer.invoke('font:get-system-fonts'),
  
  // Persistence
  persistence: {
    saveAutoSave: (data: any): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('persistence:save-autosave', data),
    
    loadAutoSave: (): Promise<{ success: boolean; data?: any; error?: string }> =>
      ipcRenderer.invoke('persistence:load-autosave'),
    
    hasAutoSave: (): Promise<boolean> =>
      ipcRenderer.invoke('persistence:has-autosave'),
    
    deleteAutoSave: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('persistence:delete-autosave'),

    addRecentAudio: (fileName: string, filePath: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('persistence:add-recent-audio', fileName, filePath),

    addRecentBackgroundVideo: (fileName: string, filePath: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('persistence:add-recent-background-video', fileName, filePath),

    getRecentAudio: (): Promise<{ success: boolean; files?: any[]; error?: string }> =>
      ipcRenderer.invoke('persistence:get-recent-audio'),

    getRecentBackgroundVideo: (): Promise<{ success: boolean; files?: any[]; error?: string }> =>
      ipcRenderer.invoke('persistence:get-recent-background-video'),
  },
  
  // Platform info
  platform: process.platform,
  
  // Development utilities
  openDevTools: () => {
    if (process.env.NODE_ENV === 'development') {
      ipcRenderer.send('dev:open-devtools');
    }
  }
};

// Type declaration for renderer process
declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}

// Expose API to renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);