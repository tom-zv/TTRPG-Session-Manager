import { Server as HttpServer } from 'http';
import { ExtendedError, Server, Socket } from 'socket.io';
import { getUserByToken } from 'src/api/auth/authModel.js';
import { initEncounterHandlers } from './namespaces/encounters/encounters.js';

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

  const encounterNamespace = io.of('/encounter');
  encounterNamespace.use(socketAuth);
  initEncounterHandlers(encounterNamespace);
  
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

export const socketAuth = async (socket: Socket, next: (err?: ExtendedError) => void) => {
  try{
    const token = socket.handshake.auth.token ||
      socket.handshake.query.token;
    
    if (!token) return next(new Error('Auth error: token required'));

    const user = await getUserByToken(token);

    if (!user) return next(new Error('Auth error: invalid token'));
    
    socket.data.user = user;

    next();
  
  } catch (error){
    console.error('Socket auth error:', error);
    next(new Error('Auth error'));
  }
}