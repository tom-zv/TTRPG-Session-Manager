import React from 'react';
import { AudioFile } from 'shared/types/audio.js';
import { getFileIcon } from '../utils/icons.js';
import { handleFileDragStart, handleFileDragEnd } from '../utils/dragDrop.js';

interface FileItemProps {
  file: AudioFile;
  isSelected: boolean;
  selectedFileIds: number[];
  audioFiles: AudioFile[];
  onFileClick: (e: React.MouseEvent, file: AudioFile) => void;
}

const FileItem: React.FC<FileItemProps> = ({
  file,
  isSelected,
  selectedFileIds,
  audioFiles,
  onFileClick
}) => {
  return (
    <li 
      className={`file-item ${isSelected ? 'selected' : ''}`}
      data-file-id={file.audio_file_id}
      data-type={file.audio_type}
      draggable="true"
      onDragStart={(e) => handleFileDragStart(e, file, selectedFileIds, audioFiles)}
      onDragEnd={handleFileDragEnd}
    >
      <div 
        className={`file-header ${isSelected ? 'selected' : ''}`}
        onClick={(e) => onFileClick(e, file)}
      >
        <span className="file-icon">
          {getFileIcon(file.audio_type)}
        </span>
        <span className="file-name">{file.title}</span>
      </div>
    </li>
  );
};

export default FileItem;