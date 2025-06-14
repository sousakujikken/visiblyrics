import { AspectRatio, Orientation, VideoQuality, CustomResolution } from '../../types/types';

/**
 * Legacy resolution enum for backward compatibility
 */
export enum Resolution {
  ORIGINAL = 'original',
  HD_720P = '720p',
  HD_1080P = '1080p',
  UHD_4K = '4k'
}

export interface ResolutionSize {
  width: number;
  height: number;
  label: string;
}

export interface ResolutionPreset {
  width: number;
  height: number;
  label: string;
}

// アスペクト比・向き対応の解像度プリセット
export const ASPECT_RATIO_RESOLUTIONS: Record<AspectRatio, Record<Orientation, Record<VideoQuality, ResolutionPreset>>> = {
  '16:9': {
    landscape: {
      LOW: { width: 1280, height: 720, label: 'HD (1280×720)' },
      MEDIUM: { width: 1920, height: 1080, label: 'Full HD (1920×1080)' },
      HIGH: { width: 3840, height: 2160, label: '4K (3840×2160)' },
      CUSTOM: { width: 0, height: 0, label: 'Custom' }
    },
    portrait: {
      LOW: { width: 720, height: 1280, label: 'HD Portrait (720×1280)' },
      MEDIUM: { width: 1080, height: 1920, label: 'Full HD Portrait (1080×1920)' },
      HIGH: { width: 2160, height: 3840, label: '4K Portrait (2160×3840)' },
      CUSTOM: { width: 0, height: 0, label: 'Custom' }
    }
  },
  '4:3': {
    landscape: {
      LOW: { width: 960, height: 720, label: 'SD+ (960×720)' },
      MEDIUM: { width: 1600, height: 1200, label: 'UXGA (1600×1200)' },
      HIGH: { width: 3200, height: 2400, label: '4K 4:3 (3200×2400)' },
      CUSTOM: { width: 0, height: 0, label: 'Custom' }
    },
    portrait: {
      LOW: { width: 720, height: 960, label: 'SD+ Portrait (720×960)' },
      MEDIUM: { width: 1200, height: 1600, label: 'UXGA Portrait (1200×1600)' },
      HIGH: { width: 2400, height: 3200, label: '4K 4:3 Portrait (2400×3200)' },
      CUSTOM: { width: 0, height: 0, label: 'Custom' }
    }
  },
  '1:1': {
    landscape: {
      LOW: { width: 720, height: 720, label: 'SD Square (720×720)' },
      MEDIUM: { width: 1080, height: 1080, label: 'HD Square (1080×1080)' },
      HIGH: { width: 1920, height: 1920, label: '4K Square (1920×1920)' },
      CUSTOM: { width: 0, height: 0, label: 'Custom' }
    },
    portrait: {
      LOW: { width: 720, height: 720, label: 'SD Square (720×720)' },
      MEDIUM: { width: 1080, height: 1080, label: 'HD Square (1080×1080)' },
      HIGH: { width: 1920, height: 1920, label: '4K Square (1920×1920)' },
      CUSTOM: { width: 0, height: 0, label: 'Custom' }
    }
  }
};

/**
 * ResolutionManager class
 * 
 * Handles resolution settings and conversions for video export
 * Supports aspect ratio and orientation-aware resolution selection
 */
export class ResolutionManager {
  // Legacy resolution presets for backward compatibility
  private readonly RESOLUTIONS: Record<Resolution, ResolutionSize> = {
    [Resolution.ORIGINAL]: { width: 0, height: 0, label: 'Original Size' },
    [Resolution.HD_720P]: { width: 1280, height: 720, label: 'HD (720p)' },
    [Resolution.HD_1080P]: { width: 1920, height: 1080, label: 'Full HD (1080p)' },
    [Resolution.UHD_4K]: { width: 3840, height: 2160, label: 'Ultra HD (4K)' }
  };
  
  /**
   * Get all available resolutions for a specific aspect ratio and orientation
   */
  getAvailableResolutions(aspectRatio: AspectRatio, orientation: Orientation): Array<{ value: VideoQuality, label: string }> {
    const resolutions = ASPECT_RATIO_RESOLUTIONS[aspectRatio][orientation];
    return Object.entries(resolutions)
      .filter(([key]) => key !== 'CUSTOM')
      .map(([key, value]) => ({
        value: key as VideoQuality,
        label: value.label
      }));
  }

  /**
   * Legacy method for backward compatibility
   */
  getLegacyAvailableResolutions(): Array<{ value: Resolution, label: string }> {
    return Object.entries(this.RESOLUTIONS).map(([key, value]) => ({
      value: key as Resolution,
      label: value.label
    }));
  }
  
  /**
   * Get the width and height for a specified aspect ratio, orientation, and quality
   */
  getResolutionSize(
    aspectRatio: AspectRatio,
    orientation: Orientation,
    quality: VideoQuality,
    customResolution?: CustomResolution
  ): { width: number, height: number } {
    if (quality === 'CUSTOM') {
      if (!customResolution) {
        throw new Error('Custom resolution must be provided for CUSTOM quality');
      }
      return this.validateCustomResolution(customResolution.width, customResolution.height);
    }
    
    const preset = ASPECT_RATIO_RESOLUTIONS[aspectRatio][orientation][quality];
    
    if (!preset) {
      throw new Error(`Unknown resolution configuration: ${aspectRatio}/${orientation}/${quality}`);
    }
    
    return { width: preset.width, height: preset.height };
  }

  /**
   * Legacy method for backward compatibility
   */
  getLegacyResolutionSize(
    resolution: Resolution, 
    originalWidth?: number, 
    originalHeight?: number
  ): { width: number, height: number } {
    if (resolution === Resolution.ORIGINAL && originalWidth && originalHeight) {
      return { width: originalWidth, height: originalHeight };
    }
    
    const preset = this.RESOLUTIONS[resolution];
    
    if (!preset) {
      throw new Error(`Unknown resolution: ${resolution}`);
    }
    
    if (resolution === Resolution.ORIGINAL) {
      throw new Error('Original dimensions must be provided for ORIGINAL resolution');
    }
    
    return { width: preset.width, height: preset.height };
  }

  /**
   * Validate custom resolution input
   */
  private validateCustomResolution(width: number, height: number): { width: number, height: number } {
    // Type checking
    if (!Number.isInteger(width) || !Number.isInteger(height)) {
      throw new Error('Resolution dimensions must be integers');
    }
    
    // Minimum resolution check
    if (width < 320 || height < 240) {
      throw new Error('Minimum resolution is 320×240');
    }
    
    // Maximum resolution check (8K)
    if (width > 7680 || height > 4320) {
      throw new Error('Maximum resolution is 7680×4320');
    }
    
    // Must be even numbers for video encoding
    if (width % 2 !== 0 || height % 2 !== 0) {
      throw new Error('Resolution dimensions must be even numbers');
    }
    
    // Check for reasonable aspect ratios (prevent extremely narrow videos)
    const aspectRatio = width / height;
    if (aspectRatio < 0.1 || aspectRatio > 10) {
      throw new Error('Aspect ratio must be between 0.1 and 10');
    }
    
    return { width, height };
  }

  /**
   * Get error message for custom resolution validation (non-throwing)
   */
  validateCustomResolutionSafe(width: number, height: number): string | null {
    try {
      this.validateCustomResolution(width, height);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Invalid resolution';
    }
  }

  /**
   * Get resolution preset information
   */
  getResolutionPreset(aspectRatio: AspectRatio, orientation: Orientation, quality: VideoQuality): ResolutionPreset | null {
    if (quality === 'CUSTOM') return null;
    return ASPECT_RATIO_RESOLUTIONS[aspectRatio]?.[orientation]?.[quality] || null;
  }

  /**
   * Get all available qualities for a specific aspect ratio and orientation
   */
  getAvailableQualities(aspectRatio: AspectRatio, orientation: Orientation): VideoQuality[] {
    const resolutions = ASPECT_RATIO_RESOLUTIONS[aspectRatio]?.[orientation];
    if (!resolutions) return [];
    
    return Object.keys(resolutions).filter(key => key !== 'CUSTOM') as VideoQuality[];
  }
  
  /**
   * Calculate and maintain aspect ratio when scaling
   */
  calculateMaintainedAspectRatio(
    targetWidth: number, 
    targetHeight: number, 
    originalWidth: number, 
    originalHeight: number
  ): { width: number, height: number } {
    const originalRatio = originalWidth / originalHeight;
    
    if (originalRatio > this.ASPECT_RATIO) {
      // Original is wider than target aspect ratio
      return {
        width: targetWidth,
        height: Math.round(targetWidth / originalRatio)
      };
    } else {
      // Original is taller than target aspect ratio
      return {
        width: Math.round(targetHeight * originalRatio),
        height: targetHeight
      };
    }
  }
  
  /**
   * Calculate scaling factors for a resolution change
   */
  calculateScalingFactors(
    sourceWidth: number, 
    sourceHeight: number, 
    targetWidth: number, 
    targetHeight: number
  ): { scaleX: number, scaleY: number } {
    return {
      scaleX: targetWidth / sourceWidth,
      scaleY: targetHeight / sourceHeight
    };
  }
}
