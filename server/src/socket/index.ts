import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';

// Socket.IO server instance
let io: Server | null = null;

/**
 * Initialize the Socket.IO server
 */
export const initSocketServer = (httpServer: HttpServer): Server => {
  // Create Socket.IO server
  io = new Server(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === 'production' 
        ? false 
        : 'http://localhost:5173',
      credentials: true
    }
  });
  
  io.of('/download');
  
  console.log('Socket.IO server initialized');
  
  return io;
};

/**
 * Get the Socket.IO server instance
 */
export const getSocketIO = (): Server => {
  if (!io) {
    throw new Error('Socket.IO not initialized. Call initSocketServer first.');
  }
  return io;
};