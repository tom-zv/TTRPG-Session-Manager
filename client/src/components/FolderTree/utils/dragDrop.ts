import { AudioFile } from 'shared/types/audio.js';

export const handleFileDragStart = (
  e: React.DragEvent, 
  file: AudioFile, 
  selectedFileIds: number[], 
  audioFiles: AudioFile[]
) => {
  e.stopPropagation();
  
  // Check if this file is part of a multi-selection
  const isMultiSelection = selectedFileIds.length > 1 && 
    selectedFileIds.includes(file.audio_file_id);
  
  if (isMultiSelection) {
    // Get all selected files' data
    const selectedFiles = audioFiles
      .filter(f => selectedFileIds.includes(f.audio_file_id))
      .map(f => ({
        type: 'audio_file',
        id: f.audio_file_id,
        title: f.title,
        audio_type: f.audio_type
      }));
    
    // Set the drag data with an array of files
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'audio_files', // Note the plural to indicate multiple files
      files: selectedFiles,
      count: selectedFiles.length
    }));
    
    // Add a visual indicator for multi-drag
    e.currentTarget.classList.add('dragging-multi');
    // Add the count attribute to show in the ::after pseudo-element
    e.currentTarget.setAttribute('data-count', selectedFiles.length.toString());
  } else {
    // Original single file drag behavior
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'audio_file',
      id: file.audio_file_id,
      title: file.title,
      audio_type: file.audio_type
    }));
    e.currentTarget.classList.add('dragging');
  }
};

export const handleFileDragEnd = (e: React.DragEvent) => {
  e.currentTarget.classList.remove('dragging');
  e.currentTarget.classList.remove('dragging-multi');
};