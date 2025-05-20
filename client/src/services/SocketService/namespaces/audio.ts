import { Socket } from 'socket.io-client';
import { getSocket } from '../socket.js';
import { AudioEventTypes } from '../events.js';
import { AudioFile } from 'src/pages/SoundManager/components/FolderTree/types.js';

// Audio namespace socket path
const AUDIO_NAMESPACE = '/audio';

// Get the audio namespace socket
export const getAudioSocket = (): Socket => getSocket(AUDIO_NAMESPACE);

// Event listener callback types
type FileDownloadedListener = (file: AudioFile) => void;

// Event subscriber functions
export const onFileDownloaded = (callback: FileDownloadedListener): Socket => {
  const socket = getAudioSocket();
  socket.on(AudioEventTypes.FILE_DOWNLOADED, callback);
  return socket;
};

export const offFileDownloaded = (callback: FileDownloadedListener): Socket => {
  const socket = getAudioSocket();
  socket.off(AudioEventTypes.FILE_DOWNLOADED, callback);
  return socket;
};
