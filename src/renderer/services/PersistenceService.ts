/**
 * Electron persistence service for auto-saving project state
 */
export class PersistenceService {
  private static instance: PersistenceService;
  
  private constructor() {}
  
  static getInstance(): PersistenceService {
    if (!PersistenceService.instance) {
      PersistenceService.instance = new PersistenceService();
    }
    return PersistenceService.instance;
  }
  
  /**
   * Save auto-save data to user's app data directory
   */
  async saveAutoSave(data: {
    projectState: any;
    engineState: {
      phrases: any[];
      audioInfo: any;
      stageConfig: any;
      selectedTemplate: string;
      templateParams: any;
      backgroundImage?: string;
    };
  }): Promise<boolean> {
    try {
      const result = await window.electronAPI.persistence.saveAutoSave(data);
      if (!result.success) {
        console.error('Failed to save autosave:', result.error);
        return false;
      }
      return true;
    } catch (error) {
      console.error('Error saving autosave:', error);
      throw error;
    }
  }
  
  /**
   * Load auto-save data from user's app data directory
   */
  async loadAutoSave(): Promise<any | null> {
    try {
      const result = await window.electronAPI.persistence.loadAutoSave();
      if (!result.success) {
        console.error('Failed to load autosave:', result.error);
        return null;
      }
      return result.data;
    } catch (error) {
      console.error('Error loading autosave:', error);
      throw error;
    }
  }
  
  /**
   * Check if auto-save data exists
   */
  async hasAutoSave(): Promise<boolean> {
    try {
      return await window.electronAPI.persistence.hasAutoSave();
    } catch (error) {
      console.error('Error checking autosave:', error);
      throw error;
    }
  }
  
  /**
   * Delete auto-save data
   */
  async deleteAutoSave(): Promise<boolean> {
    try {
      const result = await window.electronAPI.persistence.deleteAutoSave();
      if (!result.success) {
        console.error('Failed to delete autosave:', result.error);
        return false;
      }
      return true;
    } catch (error) {
      console.error('Error deleting autosave:', error);
      throw error;
    }
  }
}

export const persistenceService = PersistenceService.getInstance();