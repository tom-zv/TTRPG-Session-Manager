import React from 'react';

interface DropAreaProps {
  isDraggingOver: boolean;
  dragCount: number;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  className?: string;
  children: React.ReactNode;
}

const DropArea: React.FC<DropAreaProps> = ({
  isDraggingOver,
  dragCount,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  className = '',
  children
}) => {
  return (
    <div 
      className={`${className} ${isDraggingOver ? 'drop-target' : ''}`}
      data-count={dragCount > 1 ? dragCount : ''}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {children}
    </div>
  );
};

export default DropArea;