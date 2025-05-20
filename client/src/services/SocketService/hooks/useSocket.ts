import { useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { getSocket} from '../socket.js';

/**
 * Custom hook for socket connection management
 */
export const useSocket = (namespace: string = '/'): Socket => {
  // Use ref to maintain the same socket instance across renders
  const socketRef = useRef<Socket>();

  useEffect(() => {
    // Get or create socket connection
    const socket = getSocket(namespace);
    socketRef.current = socket;

    // Clean up on unmount
    return () => {
      // Only disconnect if there are no other components using this socket
      // For simplicity, we're not implementing reference counting here
    };
  }, [namespace]);

  return socketRef.current || getSocket(namespace);
};