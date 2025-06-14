import { AspectRatio, Orientation, StageSize } from '../types/types';

// コンテナサイズ（固定）
export const CONTAINER_SIZE = 640;

// 基準解像度の定義
export const BASE_RESOLUTIONS: Record<AspectRatio, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '4:3': { width: 1600, height: 1200 },
  '1:1': { width: 1080, height: 1080 }
};

/**
 * アスペクト比と向きからステージサイズを計算
 */
export function calculateStageSize(
  aspectRatio: AspectRatio,
  orientation: Orientation
): StageSize {
  const baseRes = BASE_RESOLUTIONS[aspectRatio];
  let width = baseRes.width;
  let height = baseRes.height;
  
  // 縦画面の場合は幅と高さを入れ替え
  if (orientation === 'portrait' && aspectRatio !== '1:1') {
    [width, height] = [height, width];
  }
  
  // コンテナにフィットするスケールを計算
  const scale = Math.min(
    CONTAINER_SIZE / width,
    CONTAINER_SIZE / height
  );
  
  return { width, height, scale };
}

/**
 * デフォルトのステージ設定を取得
 */
export function getDefaultStageConfig() {
  return {
    aspectRatio: '16:9' as AspectRatio,
    orientation: 'landscape' as Orientation,
    baseWidth: BASE_RESOLUTIONS['16:9'].width,
    baseHeight: BASE_RESOLUTIONS['16:9'].height
  };
}