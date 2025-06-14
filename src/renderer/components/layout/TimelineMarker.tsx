import React from 'react';
import Draggable from 'react-draggable';
import '../../styles/components.css';

// PhraseUnitの型定義（実際のプロジェクトではtypesからimportする）
interface PhraseUnit {
  id: string;
  text: string;
  start: number;
  end: number;
}

interface TimelineMarkerProps {
  unit: PhraseUnit;
  width: number;
  duration: number;
  onDragStop: (id: string, newStart: number, newEnd: number) => void;
}

const TimelineMarker: React.FC<TimelineMarkerProps> = ({ 
  unit, 
  width, 
  duration,
  onDragStop
}) => {
  // マーカーの位置計算
  const startX = (unit.start / duration) * width;
  const markerWidth = ((unit.end - unit.start) / duration) * width;
  
  // ドラッグ終了時のハンドラ
  const handleDragStop = (e: any, data: any) => {
    const newStartX = data.x;
    const newStart = (newStartX / width) * duration;
    const newEnd = newStart + (unit.end - unit.start);
    
    onDragStop(unit.id, newStart, newEnd);
  };
  
  return (
    <Draggable
      axis="x"
      bounds="parent"
      position={{ x: startX, y: 0 }}
      onStop={handleDragStop}
    >
      <div
        className="marker"
        style={{ 
          width: `${markerWidth}px`,
          backgroundColor: getColorForText(unit.text),
          userSelect: 'none'
        }}
      >
        <div className="marker-content">
          {unit.text}
        </div>
      </div>
    </Draggable>
  );
};

// テキストに応じた色を生成する関数（ランダムだが一貫した色）
const getColorForText = (text: string): string => {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const hue = hash % 360;
  return `hsla(${hue}, 70%, 60%, 0.7)`;
};

export default TimelineMarker;
