import { io, Socket } from 'socket.io-client';

// Socket instance cache
const socketInstances: Record<string, Socket> = {};

/**
 * Get or create a socket instance for a specific namespace
 */
export const getSocket = (namespace: string = '/'): Socket => {
  // Return existing instance if available
  if (socketInstances[namespace]) {
    return socketInstances[namespace];
  }

  // Determine the base URL (same as current host in production)
  const baseUrl = process.env.NODE_ENV === 'production' 
    ? window.location.origin 
    : 'http://localhost:3000';
  
  // Create new socket instance
  const socket = io(`${baseUrl}${namespace}`, {
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    autoConnect: true,
  });

  // Setup socket event listeners for connection management
  socket.on('connect', () => {
    console.log(`Socket connected to namespace: ${namespace}`);
  });

  socket.on('disconnect', (reason) => {
    console.log(`Socket disconnected from namespace ${namespace}:`, reason);
  });

  socket.on('connect_error', (error) => {
    console.error(`Socket connection error for namespace ${namespace}:`, error);
  });

  // Store instance in cache
  socketInstances[namespace] = socket;
  return socket;
};

/**
 * Disconnect a specific socket namespace or all sockets
 */
export const disconnectSocket = (namespace?: string): void => {
  if (namespace && socketInstances[namespace]) {
    socketInstances[namespace].disconnect();
    delete socketInstances[namespace];
  } else if (!namespace) {
    // Disconnect all sockets
    Object.values(socketInstances).forEach(socket => socket.disconnect());
    Object.keys(socketInstances).forEach(key => delete socketInstances[key]);
  }
};