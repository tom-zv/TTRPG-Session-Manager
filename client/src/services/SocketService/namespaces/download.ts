import { Socket } from 'socket.io-client';
import { getSocket } from '../socket.js';

// Audio namespace socket path
const DOWNLOAD_NAMESPACE = '/download';

// Get the audio namespace socket
export const getDownloadSocket = (): Socket => getSocket(DOWNLOAD_NAMESPACE);