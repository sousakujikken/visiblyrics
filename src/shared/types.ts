// Shared type definitions for Electron IPC communication

export interface ProjectData {
  id: string;
  name: string;
  lyrics: any;
  templates: Record<string, string>;
  parameters: Record<string, any>;
  timing: any;
  metadata: {
    createdAt: string;
    modifiedAt: string;
    version: string;
  };
}

export interface MediaFileInfo {
  path: string;
  name: string;
  size: number;
  type: 'video' | 'audio';
  lastModified: Date;
  duration?: number;
  resolution?: {
    width: number;
    height: number;
  };
}

export interface ExportOptions {
  aspectRatio: string;
  orientation: 'landscape' | 'portrait';
  quality: 'low' | 'medium' | 'high';
  videoQuality: 'low' | 'medium' | 'high';
  fps: number;
  fileName: string;
  outputDir: string;
  startTime: number;
  endTime: number;
  width: number;
  height: number;
  includeDebugVisuals: boolean;
  audioPath?: string;
}

export interface ExportProgress {
  phase: 'preparing' | 'generating' | 'encoding' | 'finalizing';
  progress: number; // 0-100
  currentFrame?: number;
  totalFrames?: number;
  timeRemaining?: number;
  message?: string;
}

export interface ExportError {
  code: string;
  message: string;
  details?: any;
}

export interface FontInfo {
  family: string;
  fullName: string;
  style: string;
  weight: string;
  path?: string;
}

// IPC Channel definitions
export interface MainToRendererChannels {
  'file:project-loaded': (projectData: ProjectData) => void;
  'file:media-loaded': (mediaInfo: MediaFileInfo) => void;
  'export:progress': (progress: ExportProgress) => void;
  'export:completed': (outputPath: string) => void;
  'export:error': (error: ExportError) => void;
  'export:generate-frame': (options: { timeMs: number; width: number; height: number }) => void;
}

export interface RendererToMainChannels {
  'file:save-project': (projectData: ProjectData) => Promise<string>;
  'file:load-project': () => Promise<ProjectData>;
  'file:select-media': (type: 'video' | 'audio') => Promise<MediaFileInfo>;
  'export:start': (options: ExportOptions) => Promise<void>;
  'export:cancel': () => Promise<void>;
  'export:frame-ready': (frameData: string) => void;
  'export:frame-error': (error: string) => void;
  'font:get-system-fonts': () => Promise<FontInfo[]>;
}