import * as electron from 'electron';
const { dialog, ipcMain } = electron;
import { promises as fs } from 'fs';
import * as path from 'path';
import type { ProjectData, MediaFileInfo } from '../shared/types';

export class FileManager {
  async saveProject(projectData: ProjectData): Promise<string> {
    const { filePath } = await dialog.showSaveDialog({
      title: 'Save Visiblyrics Project',
      defaultPath: `${projectData.name || 'project'}.vbl`,
      filters: [
        { name: 'Visiblyrics Project', extensions: ['vbl'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    if (filePath) {
      // Update metadata before saving
      const updatedProjectData = {
        ...projectData,
        metadata: {
          ...projectData.metadata,
          modifiedAt: new Date().toISOString()
        }
      };
      
      await fs.writeFile(filePath, JSON.stringify(updatedProjectData, null, 2), 'utf-8');
      return filePath;
    }
    
    throw new Error('Save cancelled by user');
  }
  
  async loadProject(): Promise<ProjectData> {
    const { filePaths } = await dialog.showOpenDialog({
      title: 'Load Visiblyrics Project',
      filters: [
        { name: 'Visiblyrics Project', extensions: ['vbl'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });
    
    if (filePaths.length > 0) {
      const content = await fs.readFile(filePaths[0], 'utf-8');
      
      try {
        const projectFileData = JSON.parse(content);
        
        // ProjectFileData形式の基本的な検証（緩い検証）
        if (!projectFileData.metadata && !projectFileData.version) {
          console.warn('Project file missing metadata, applying defaults');
          projectFileData.metadata = {
            projectName: path.basename(filePaths[0], '.vbl'),
            createdAt: new Date().toISOString(),
            modifiedAt: new Date().toISOString()
          };
        }
        
        if (!projectFileData.version) {
          console.warn('Project file missing version, applying default');
          projectFileData.version = '0.1.0';
        }
        
        // ProjectData形式に変換（互換性のため）
        const projectData: ProjectData = {
          id: `project_${Date.now()}`,
          name: projectFileData.metadata?.projectName || path.basename(filePaths[0], '.vbl'),
          ...projectFileData
        };
        
        return projectData;
        
      } catch (parseError) {
        console.error('Failed to parse project file:', parseError);
        const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown error';
        throw new Error(`Invalid project file format: ${errorMessage}`);
      }
    }
    
    throw new Error('Load cancelled by user');
  }
  
  async selectMediaFile(type: 'video' | 'audio'): Promise<MediaFileInfo> {
    const videoExtensions = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'flv', '3gp'];
    const audioExtensions = ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'wma'];
    
    const extensions = type === 'video' ? videoExtensions : audioExtensions;
    const typeName = type.charAt(0).toUpperCase() + type.slice(1);
    
    const { filePaths } = await dialog.showOpenDialog({
      title: `Select ${typeName} File`,
      filters: [
        { name: `${typeName} Files`, extensions },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });
    
    if (filePaths.length > 0) {
      const filePath = filePaths[0];
      const stats = await fs.stat(filePath);
      
      const mediaInfo: MediaFileInfo = {
        path: filePath,
        name: path.basename(filePath),
        size: stats.size,
        type: type,
        lastModified: stats.mtime
      };
      
      // For video files, try to get resolution (would need ffprobe in production)
      if (type === 'video') {
        // This would require ffprobe integration for proper media info
        // For now, we'll leave resolution undefined
        mediaInfo.resolution = undefined;
      }
      
      return mediaInfo;
    }
    
    throw new Error('File selection cancelled by user');
  }
  
  async validateMediaFile(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(filePath);
      return stats.isFile() && stats.size > 0;
    } catch (error) {
      return false;
    }
  }
  
  async getMediaDuration(filePath: string): Promise<number | undefined> {
    // This would require ffprobe integration for proper media analysis
    // For now, return undefined - can be implemented later with FFmpeg
    return undefined;
  }
  
  async checkFileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }
  
  async readFileAsURL(filePath: string): Promise<string> {
    try {
      // Electronではfile://プロトコルを使用してローカルファイルにアクセス
      const normalizedPath = path.resolve(filePath);
      return `file://${normalizedPath}`;
    } catch (error) {
      console.error('Failed to create file URL:', error);
      throw error;
    }
  }
}

export function setupFileHandlers() {
  const fileManager = new FileManager();
  
  ipcMain.handle('file:save-project', async (event, projectData: ProjectData) => {
    try {
      return await fileManager.saveProject(projectData);
    } catch (error) {
      console.error('Failed to save project:', error);
      throw error;
    }
  });
  
  ipcMain.handle('file:load-project', async () => {
    try {
      return await fileManager.loadProject();
    } catch (error) {
      console.error('Failed to load project:', error);
      throw error;
    }
  });
  
  ipcMain.handle('file:select-media', async (event, type: 'video' | 'audio') => {
    try {
      return await fileManager.selectMediaFile(type);
    } catch (error) {
      console.error(`Failed to select ${type} file:`, error);
      throw error;
    }
  });
  
  ipcMain.handle('fs:check-file-exists', async (event, filePath: string) => {
    try {
      return await fileManager.checkFileExists(filePath);
    } catch (error) {
      console.error('Failed to check file existence:', error);
      return false;
    }
  });
  
  ipcMain.handle('fs:read-file-as-url', async (event, filePath: string) => {
    try {
      return await fileManager.readFileAsURL(filePath);
    } catch (error) {
      console.error('Failed to read file as URL:', error);
      throw error;
    }
  });
}