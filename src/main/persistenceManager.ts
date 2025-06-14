import { app, ipcMain } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';

interface RecentFile {
  fileName: string;
  filePath: string;
  timestamp: number;
}

interface RecentFilesData {
  audioFiles: RecentFile[];
  backgroundVideoFiles: RecentFile[];
}

interface AutoSaveData {
  version: string;
  timestamp: number;
  projectState: any;
  engineState: {
    phrases: any[];
    audioInfo: any;
    backgroundVideoInfo?: {
      fileName: string | null;
    };
    stageConfig: any;
    selectedTemplate: string;
    templateParams: any;
    backgroundImage?: string;
    backgroundConfig?: any;
  };
  recentFiles?: RecentFilesData;
}

class PersistenceManager {
  private userDataPath: string;
  private autoSaveFilePath: string;
  private autoSaveInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    this.userDataPath = app.getPath('userData');
    this.autoSaveFilePath = path.join(this.userDataPath, 'autosave.json');
  }
  
  async initialize() {
    console.log('PersistenceManager: Initializing...');
    console.log('PersistenceManager: User data path:', this.userDataPath);
    console.log('PersistenceManager: Autosave file path:', this.autoSaveFilePath);
    
    // Ensure user data directory exists
    await fs.mkdir(this.userDataPath, { recursive: true });
    
    // Set up IPC handlers
    this.setupIPCHandlers();
    
    console.log('PersistenceManager: IPC handlers registered successfully');
  }
  
  private setupIPCHandlers() {
    // Save autosave data
    ipcMain.handle('persistence:save-autosave', async (event, data: AutoSaveData) => {
      try {
        await this.saveAutoSave(data);
        return { success: true };
      } catch (error) {
        console.error('Failed to save autosave:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });
    
    // Load autosave data
    ipcMain.handle('persistence:load-autosave', async () => {
      try {
        const data = await this.loadAutoSave();
        return { success: true, data };
      } catch (error) {
        console.error('Failed to load autosave:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });
    
    // Check if autosave exists
    ipcMain.handle('persistence:has-autosave', async () => {
      try {
        await fs.access(this.autoSaveFilePath);
        return true;
      } catch {
        return false;
      }
    });
    
    // Delete autosave
    ipcMain.handle('persistence:delete-autosave', async () => {
      try {
        await fs.unlink(this.autoSaveFilePath);
        return { success: true };
      } catch (error) {
        console.error('Failed to delete autosave:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // Recent files management
    ipcMain.handle('persistence:add-recent-audio', async (event, fileName: string, filePath: string) => {
      try {
        await this.addRecentFile('audio', fileName, filePath);
        return { success: true };
      } catch (error) {
        console.error('Failed to add recent audio file:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    ipcMain.handle('persistence:add-recent-background-video', async (event, fileName: string, filePath: string) => {
      try {
        await this.addRecentFile('backgroundVideo', fileName, filePath);
        return { success: true };
      } catch (error) {
        console.error('Failed to add recent background video file:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    ipcMain.handle('persistence:get-recent-audio', async () => {
      try {
        const files = await this.getRecentFiles('audio');
        return { success: true, files };
      } catch (error) {
        console.error('Failed to get recent audio files:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    ipcMain.handle('persistence:get-recent-background-video', async () => {
      try {
        const files = await this.getRecentFiles('backgroundVideo');
        return { success: true, files };
      } catch (error) {
        console.error('Failed to get recent background video files:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });
  }
  
  private async saveAutoSave(data: AutoSaveData): Promise<void> {
    console.log('PersistenceManager: Starting saveAutoSave');
    console.log('PersistenceManager: userDataPath:', this.userDataPath);
    console.log('PersistenceManager: autoSaveFilePath:', this.autoSaveFilePath);
    
    // Ensure user data directory exists before writing
    try {
      await fs.mkdir(this.userDataPath, { recursive: true });
      console.log('PersistenceManager: Directory created/confirmed');
      
      // Verify directory is writable
      await fs.access(this.userDataPath, fs.constants.W_OK);
      console.log('PersistenceManager: Directory is writable');
    } catch (error) {
      console.error('PersistenceManager: Failed to create/access directory:', error);
      throw error;
    }
    
    // Add metadata
    const saveData = {
      ...data,
      version: app.getVersion(),
      timestamp: Date.now()
    };
    
    const tempPath = `${this.autoSaveFilePath}.tmp`;
    console.log('PersistenceManager: Using temp path:', tempPath);
    
    try {
      // Clean up any existing temp file first
      try {
        await fs.unlink(tempPath);
        console.log('PersistenceManager: Cleaned up existing temp file');
      } catch (cleanupError) {
        // Ignore if temp file doesn't exist
        console.log('PersistenceManager: No existing temp file to clean up');
      }
      
      // Write to temp file first
      console.log('PersistenceManager: Writing to temp file...');
      await fs.writeFile(tempPath, JSON.stringify(saveData, null, 2), { 
        encoding: 'utf-8',
        flag: 'w' 
      });
      console.log('PersistenceManager: Temp file written successfully');
      
      // Verify temp file exists and is readable
      try {
        const stats = await fs.stat(tempPath);
        console.log('PersistenceManager: Temp file size:', stats.size, 'bytes');
        
        if (stats.size === 0) {
          throw new Error('Temp file is empty');
        }
      } catch (error) {
        console.error('PersistenceManager: Temp file verification failed:', error);
        throw error;
      }
      
      // Attempt atomic rename with retry logic
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          console.log(`PersistenceManager: Attempting rename (attempt ${retryCount + 1}/${maxRetries})`);
          await fs.rename(tempPath, this.autoSaveFilePath);
          console.log('PersistenceManager: Rename completed successfully');
          return; // Success, exit function
        } catch (renameError) {
          console.error(`PersistenceManager: Rename attempt ${retryCount + 1} failed:`, renameError);
          
          if (retryCount === maxRetries - 1) {
            // Last attempt failed, try direct write as fallback
            console.log('PersistenceManager: All rename attempts failed, trying direct write');
            try {
              await fs.writeFile(this.autoSaveFilePath, JSON.stringify(saveData, null, 2), { 
                encoding: 'utf-8',
                flag: 'w' 
              });
              console.log('PersistenceManager: Direct write successful');
              // Clean up temp file
              await fs.unlink(tempPath);
              return; // Success with direct write
            } catch (directWriteError) {
              console.error('PersistenceManager: Direct write also failed:', directWriteError);
              throw renameError; // Throw original rename error
            }
          }
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 100));
          retryCount++;
        }
      }
    } catch (error) {
      console.error('PersistenceManager: Error during file operations:', error);
      
      // Try to clean up temp file if it exists
      try {
        await fs.unlink(tempPath);
        console.log('PersistenceManager: Cleaned up temp file after error');
      } catch (cleanupError) {
        console.log('PersistenceManager: No temp file to clean up');
      }
      
      throw error;
    }
  }
  
  private async loadAutoSave(): Promise<AutoSaveData | null> {
    try {
      const content = await fs.readFile(this.autoSaveFilePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return null; // File doesn't exist
      }
      throw error;
    }
  }

  private async addRecentFile(type: 'audio' | 'backgroundVideo', fileName: string, filePath: string): Promise<void> {
    console.log(`PersistenceManager: addRecentFile called - type: ${type}, fileName: ${fileName}, filePath: ${filePath}`);
    
    const data = await this.loadAutoSave() || { 
      version: app.getVersion(), 
      timestamp: Date.now(), 
      projectState: {}, 
      engineState: { 
        phrases: [], 
        audioInfo: null, 
        stageConfig: {}, 
        selectedTemplate: '', 
        templateParams: {} 
      } 
    };

    if (!data.recentFiles) {
      console.log('PersistenceManager: Creating new recentFiles structure');
      data.recentFiles = { audioFiles: [], backgroundVideoFiles: [] };
    }

    const targetList = type === 'audio' ? data.recentFiles.audioFiles : data.recentFiles.backgroundVideoFiles;
    console.log(`PersistenceManager: Current ${type} files:`, targetList);
    
    // Remove existing entry for the same file
    const existingIndex = targetList.findIndex(file => file.filePath === filePath);
    if (existingIndex !== -1) {
      console.log(`PersistenceManager: Removing existing entry at index ${existingIndex}`);
      targetList.splice(existingIndex, 1);
    }

    // Add new entry at the beginning
    const newEntry = {
      fileName,
      filePath,
      timestamp: Date.now()
    };
    targetList.unshift(newEntry);
    console.log(`PersistenceManager: Added new entry:`, newEntry);

    // Keep only the 5 most recent files
    const beforeLength = targetList.length;
    targetList.splice(5);
    console.log(`PersistenceManager: List length before: ${beforeLength}, after: ${targetList.length}`);

    console.log(`PersistenceManager: Saving updated ${type} files:`, targetList);
    await this.saveAutoSave(data);
  }

  private async getRecentFiles(type: 'audio' | 'backgroundVideo'): Promise<RecentFile[]> {
    console.log(`PersistenceManager: getRecentFiles called for type: ${type}`);
    
    const data = await this.loadAutoSave();
    console.log(`PersistenceManager: Loaded autosave data:`, {
      hasData: !!data,
      hasRecentFiles: !!(data?.recentFiles),
      dataKeys: data ? Object.keys(data) : [],
      recentFilesKeys: data?.recentFiles ? Object.keys(data.recentFiles) : []
    });
    
    if (!data || !data.recentFiles) {
      console.log(`PersistenceManager: No data or recentFiles found for ${type}`);
      return [];
    }

    const targetList = type === 'audio' ? data.recentFiles.audioFiles : data.recentFiles.backgroundVideoFiles;
    console.log(`PersistenceManager: Full recentFiles structure:`, data.recentFiles);
    console.log(`PersistenceManager: audioFiles:`, data.recentFiles.audioFiles);
    console.log(`PersistenceManager: backgroundVideoFiles:`, data.recentFiles.backgroundVideoFiles);
    console.log(`PersistenceManager: Target list for ${type}:`, targetList);
    console.log(`PersistenceManager: Found ${targetList?.length || 0} ${type} files in storage:`, targetList);
    
    // Filter out files that no longer exist
    const validFiles: RecentFile[] = [];
    for (const file of targetList) {
      try {
        await fs.access(file.filePath);
        validFiles.push(file);
        console.log(`PersistenceManager: File exists: ${file.filePath}`);
      } catch {
        console.log(`PersistenceManager: File no longer exists: ${file.filePath}`);
        // File no longer exists, skip it
      }
    }

    // If the list changed, update the saved data
    if (validFiles.length !== targetList.length) {
      console.log(`PersistenceManager: Updating saved data due to invalid files. Valid: ${validFiles.length}, Total: ${targetList.length}`);
      if (type === 'audio') {
        data.recentFiles.audioFiles = validFiles;
      } else {
        data.recentFiles.backgroundVideoFiles = validFiles;
      }
      await this.saveAutoSave(data);
    }

    console.log(`PersistenceManager: Returning ${validFiles.length} valid ${type} files:`, validFiles);
    return validFiles;
  }
}

export const persistenceManager = new PersistenceManager();