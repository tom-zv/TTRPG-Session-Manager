import { useMemo } from 'react';
import { Socket } from 'socket.io-client';
import { getSocket} from '../socket.js';

/**
 * Custom hook for socket connection management
 */
export const useSocket = (namespace: string = '/'): Socket => {
  return useMemo(() => getSocket(namespace), [namespace]);
};
