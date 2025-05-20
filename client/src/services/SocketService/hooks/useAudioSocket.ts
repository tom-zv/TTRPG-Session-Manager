import { useEffect } from 'react';
import { onFileDownloaded, offFileDownloaded } from '../namespaces/audio.js';
import { useSocket } from './useSocket.js';
import { AudioFile } from 'src/pages/SoundManager/components/FolderTree/types.js';

/**
 * Hook for connecting to the audio socket namespace
 */
export const useAudioSocket = () => {
  const socket = useSocket('/audio');
  return socket;
};

/**
 * Hook for listening to file download completed events
 */
export const useFileDownloadListener = (
  onDownloadComplete: (file: AudioFile) => void
) => {
  useEffect(() => {
    // Register event listener
    onFileDownloaded(onDownloadComplete);
    
    // Cleanup on unmount
    return () => {
      offFileDownloaded(onDownloadComplete);
    };
  }, [onDownloadComplete]);
};