import * as electron from 'electron';
import type { BrowserWindow as BrowserWindowType } from 'electron';
const { app, BrowserWindow, ipcMain } = electron;
import * as path from 'path';
import { setupFileHandlers } from './fileManager';
import { setupExportHandlers } from './exportManager';
import { fontManager } from './fontManager';
import { persistenceManager } from './persistenceManager';

class ElectronApp {
  private mainWindow: BrowserWindowType | null = null;
  
  async initialize() {
    await app.whenReady();
    
    console.log('ElectronApp: Initializing managers...');
    
    // Initialize managers before setting up IPC to ensure all handlers are registered
    await fontManager.initialize();
    console.log('ElectronApp: FontManager initialized');
    
    await persistenceManager.initialize();
    console.log('ElectronApp: PersistenceManager initialized');
    
    this.createMainWindow();
    this.setupIPC();
    this.setupAppEvents();
    
    console.log('ElectronApp: All initialization complete');
  }
  
  private createMainWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1400,
      height: 1000,
      minWidth: 1200,
      minHeight: 800,
      titleBarStyle: 'default',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, './preload.js'),
        webSecurity: false, // ローカルファイルアクセスのため無効化
        allowRunningInsecureContent: true
      }
    });
    
    // 開発時は Vite dev server、プロダクション時はバンドルされたHTML
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    
    if (isDev) {
      console.log('Development mode: Loading Vite dev server at http://localhost:5173');
      this.mainWindow.loadURL('http://localhost:5173').catch((error) => {
        console.error('Failed to load Vite dev server:', error);
        console.log('Make sure npm run dev is running on port 5173');
      });
      this.mainWindow.webContents.openDevTools();
    } else {
      // プロダクションビルド時のHTMLファイルパス
      const rendererPath = path.join(__dirname, '../renderer/index.html');
      console.log('Loading renderer from:', rendererPath);
      this.mainWindow.loadFile(rendererPath);
    }
    
    // Window event handlers
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
    
    this.mainWindow.on('ready-to-show', () => {
      this.mainWindow?.show();
    });
  }
  
  private setupIPC() {
    setupFileHandlers();
    setupExportHandlers();
    
    // Basic app info
    ipcMain.handle('app:get-version', () => {
      return app.getVersion();
    });
    
    ipcMain.handle('app:get-path', (event, name: string) => {
      return app.getPath(name as any);
    });
  }
  
  private setupAppEvents() {
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });
    
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createMainWindow();
      }
    });
    
    // Security: Prevent new window creation
    app.on('web-contents-created', (event, contents) => {
      contents.setWindowOpenHandler(({ url }) => {
        console.log('Prevented navigation to:', url);
        return { action: 'deny' };
      });
    });
  }
  
  getMainWindow(): BrowserWindowType | null {
    return this.mainWindow;
  }
}

// Initialize the application
const electronApp = new ElectronApp();
electronApp.initialize().catch(console.error);

// Export for use by other modules
export { electronApp };