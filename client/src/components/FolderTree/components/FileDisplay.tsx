import React from 'react';
import { getFileIcon } from '../utils/icons.js';
import { AudioFile } from 'shared/types/audio.js';

interface FileDisplayProps {
  file: AudioFile;
  isSelected?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onClick?: (e: React.MouseEvent) => void;
}

const FileDisplay: React.FC<FileDisplayProps> = ({
  file,
  isSelected,
  onDragStart,
  onDragEnd,
  onClick
}) => {
  return (
    <div 
      className={`file-item ${isSelected ? 'selected' : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      data-type={file.audioType || 'default'}
    >
      <div className="file-header">
        <span className="file-icon">
          {getFileIcon(file.audioType || 'default')}
        </span>
        <span className="file-name">
          {file.title}
        </span>
      </div>
    </div>
  );
};

export default FileDisplay;