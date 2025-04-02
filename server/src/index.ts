import express from 'express';
import cors from 'cors'; // Add this import
import { serverConfig } from './config/server-config.js';
import audioRoutes from './api/audio/audioRoutes.js';
import path from 'path';
import { fileURLToPath } from 'url';

// Initialize Express app
const app = express();

// Add CORS middleware
app.use(cors({
  origin: 'http://localhost:5173', // Your React dev server
  credentials: true
}));

// Middleware for parsing JSON and urlencoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use('/api/audio', audioRoutes);

// Define __dirname since it's not available in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static audiofiles from the public directory
app.use('/audio', express.static(path.join(__dirname, '../public/audio')));

// Serve static files from the React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../client/dist')));
  
  // Handle any requests that don't match the API routes
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
  });
}

// Start the server
app.listen(serverConfig.port, () => {
  console.log(`Server running on port ${serverConfig.port}`);
});

export default app;
