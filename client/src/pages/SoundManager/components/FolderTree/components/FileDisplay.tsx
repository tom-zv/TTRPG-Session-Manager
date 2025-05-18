import React from 'react';
import { AudioFile } from 'src/pages/SoundManager/components/FolderTree/types.js';
import { getFileIcon } from '../utils/icons.js';

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
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(e as unknown as React.MouseEvent<HTMLDivElement>);
        }
      }}
      role="button"
      tabIndex={0}
      data-type={file.audioType || 'default'}
    >
      <div className="file-header">
        <span className="file-icon">
          {getFileIcon(file.audioType || 'default')}
        </span>
        <span className="file-name">
          {file.name}
        </span>
      </div>
    </div>
  );
};

export default FileDisplay;