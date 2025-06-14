// Electron-integrated file management service

import { useElectronAPI } from '../../shared/electronAPI';
import type { ProjectData, MediaFileInfo } from '../../shared/types';

export class ElectronFileManager {
  private electronAPI;
  
  constructor() {
    const { electronAPI } = useElectronAPI();
    this.electronAPI = electronAPI;
  }
  
  
  async saveProject(projectData: ProjectData): Promise<string> {
    try {
      const filePath = await this.electronAPI.saveProject(projectData);
      console.log('Project saved to:', filePath);
      return filePath;
    } catch (error) {
      console.error('Failed to save project:', error);
      throw error;
    }
  }
  
  async loadProject(): Promise<ProjectData> {
    try {
      const projectData = await this.electronAPI.loadProject();
      console.log('Project loaded:', projectData.name);
      return projectData;
    } catch (error) {
      console.error('Failed to load project:', error);
      throw error;
    }
  }
  
  async selectVideoFile(): Promise<MediaFileInfo> {
    try {
      const mediaInfo = await this.electronAPI.selectMedia('video');
      console.log('Video file selected:', mediaInfo.name);
      return mediaInfo;
    } catch (error) {
      console.error('Failed to select video file:', error);
      throw error;
    }
  }
  
  async selectAudioFile(): Promise<MediaFileInfo> {
    try {
      const mediaInfo = await this.electronAPI.selectMedia('audio');
      console.log('Audio file selected:', mediaInfo.name);
      return mediaInfo;
    } catch (error) {
      console.error('Failed to select audio file:', error);
      throw error;
    }
  }
  
  // Convert local file path to file:// URL for use in HTML elements
  getFileURL(localPath: string): string {
    if (!localPath) return '';
    
    // Ensure proper file:// protocol
    if (localPath.startsWith('file://')) {
      return localPath;
    }
    
    // Convert local path to file URL
    const isWindows = process.platform === 'win32';
    if (isWindows) {
      // Windows path conversion
      return `file:///${localPath.replace(/\\/g, '/')}`;
    } else {
      // Unix-like path conversion
      return `file://${localPath}`;
    }
  }
  
  // Check if a file path is a local file
  isLocalFile(path: string): boolean {
    return path.startsWith('/') || // Unix absolute path
           path.match(/^[A-Za-z]:\\/) || // Windows absolute path
           path.startsWith('file://'); // File URL
  }
}

// Global instance
export const electronFileManager = new ElectronFileManager();