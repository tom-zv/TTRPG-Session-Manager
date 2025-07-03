import express from 'express';
import http from 'http';
import cors from 'cors';
import { serverConfig } from './config/server-config.js';
import audioRoutes from './api/audio/audioRoutes.js';
import systemRoutes from './api/system/systemRoutes.js'; 
import path from 'path';
import { initSocketServer } from './socket/index.js';
import { errorHandler } from './middleware/errorHandler.js';

// Initialize Express app
const app = express();
const httpServer = http.createServer(app);

// Initialize Socket.IO with the HTTP server
initSocketServer(httpServer);

// Middleware Configuration
// -----------------------

app.use(cors({
  origin: ['http://localhost:5173', serverConfig.clientOrigin],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static File Serving
// -----------------
// Serve static audiofiles from the public directory
app.use('/audio', express.static(path.join(serverConfig.rootDir, 'public/audio')));

// API Routes
// ---------
// Mount audio routes
app.use('/api/audio', audioRoutes);
app.use('/api/system', systemRoutes); 

// Production Configuration
// ----------------------
// Serve static files from the React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(serverConfig.rootDir, '../../../client/dist')));
  
  // Handle any requests that don't match the API routes
  app.get('*', (_req, res) => {
    res.sendFile(path.join(serverConfig.rootDir, '../../../client/dist/index.html'));
  });
}

app.use(errorHandler);

// Start the server using the HTTP server
httpServer.listen(serverConfig.port, serverConfig.host, () => {
  console.log(`Server running at http://${serverConfig.host}:${serverConfig.port}`);
});

export default app;
