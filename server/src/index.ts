import express from 'express';
import http from 'http';
import cors from 'cors';
import { serverConfig } from './config/server-config.js';
import authRoutes from './api/auth/authRoutes.js'
import userRoutes from './api/users/userRoutes.js'
import audioRoutes from './api/audio/audioRoutes.js';
import entityRoutes from './api/encounter/entities/entityRoutes.js'
import encounterRoutes from './api/encounter/encounters/encounterRoutes.js'
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

const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://localhost:3000',
  serverConfig.clientOrigin, 
]);

app.use(cors({
  origin: (origin, cb) => {
    // allow server-to-server / curl - no Origin header
    if (!origin) return cb(null, true);

    // allow explicit list
    if (allowedOrigins.has(origin)) return cb(null, true);

    // allow LAN dev origins on Vite port
    if (/^http:\/\/192\.168\.\d+\.\d+:5173$/.test(origin)) return cb(null, true);

    return cb(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials: true
}));


app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static File Serving
// -----------------
// Serve static audiofiles from the public directory
app.use('/audio', express.static(path.join(serverConfig.rootDir, 'public/audio')));
app.use('/images', express.static(path.join(serverConfig.rootDir, 'public/images')));

// API Routes
// ---------
app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/audio', audioRoutes);
app.use('/api/:system/entities', entityRoutes)
app.use('/api/:system/encounters', encounterRoutes)

// Production Configuration
// ----------------------
// Serve static files 
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(serverConfig.rootDir, '../client/dist')));
  
  // Handle any requests that don't match the API routes
  app.get('*', (_req, res) => {
    res.sendFile(path.join(serverConfig.rootDir, '../client/dist/index.html'));
  });
}

app.use(errorHandler);

// Start the server using the HTTP server
httpServer.listen(serverConfig.port, serverConfig.host, () => {
  console.log(`Server running at http://${serverConfig.host}:${serverConfig.port}`);
});

export default app;
