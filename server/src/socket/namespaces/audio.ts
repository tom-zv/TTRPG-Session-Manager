import { Namespace, Socket } from 'socket.io';
import { getSocketIO } from '../index.js';
import { transformAudioFile } from '../../utils/format-transformers.js';
import { AudioEventTypes } from '../types/socketEvents.js'
import { AudioFileDB } from '../../api/audio/files/types.js';

export const setupAudioNamespace = (namespace: Namespace): void => {
  namespace.on('connection', (socket: Socket) => {
    console.log(`Client connected to audio namespace: ${socket.id}`);
  });
};

// Utility functions for emitting events from outside socket handlers
export const emitFileDownloaded = (audioFile: AudioFileDB): void => {
  const io = getSocketIO();
  console.log(`[SOCKET] Emitting file_downloaded event for file ID: ${audioFile.audio_file_id}`);
  
  // Transform the file data to match frontend expected format
  const transformedFile = transformAudioFile(audioFile);
  
  // Broadcast to all connected clients
  io.of('/audio').emit(
    AudioEventTypes.FILE_DOWNLOADED,
    transformedFile
  );
};