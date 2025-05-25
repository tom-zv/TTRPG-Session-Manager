import React from 'react';
import { AudioFileUI } from '../types.js';
import { getFileIcon } from '../utils/icons.js';
import { handleFileClick } from '../utils/ClickHandlers.js';
import { useFolderTree } from '../context/FolderTreeContext.js';

interface FileDisplayProps {
  file: AudioFileUI;
}

const FileDisplay: React.FC<FileDisplayProps> = ({ file }) => {
  const { 
    selectedFileIds, 
    handleFileSelect,
    handleFileDragStart,
    handleFileDragEnd
  } = useFolderTree();
  
  const isSelected = selectedFileIds.includes(file.id);

  const handleEditFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    // TODO: Implement file editing functionality
    console.log('Edit file:', file.name);
  };

  return (
    <div 
      className={`file-item ${isSelected ? 'selected' : ''}`}
      draggable
      onDragStart={(e) => handleFileDragStart(e, file)}
      onDragEnd={handleFileDragEnd}
      onClick={(e) => handleFileClick(e, file, handleFileSelect)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleFileClick(e as unknown as React.MouseEvent, file, handleFileSelect);
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
        <span className="file-name" title={file.name}>
          {file.name}
        </span>
        <button
          className="icon-button"
          onClick={handleEditFile}
          title="Edit file"
        >
          ✏️
        </button>
      </div>
    </div>
  );
};

export default React.memo(FileDisplay);