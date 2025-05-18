import express from 'express';
import cors from 'cors';
import ytDlp from 'yt-dlp-exec';
import { serverConfig } from './config/server-config.js';
import audioRoutes from './api/audio/audioRoutes.js';
import path from 'path';
import { serverRoot } from './utils/path-utils.js';

// Initialize Express app
const app = express();

// Middleware Configuration
// -----------------------

app.use(cors({
  origin: 'http://localhost:5173', 
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static File Serving
// -----------------
// Serve static audiofiles from the public directory
app.use('/audio', express.static(path.join(serverRoot, 'public/audio')));

// API Routes
// ---------
// Mount audio routes
app.use('/api/audio', audioRoutes);

// Direct route handler for YouTube audio
app.get('/api/audio/youtube-audio', async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) {
    return res.status(400).json({ error: 'URL parameter missing' });
  }

  // Ensure videoUrl is a string before passing to ytDlp
  if (typeof videoUrl !== 'string') {
    return res.status(400).json({ error: 'Invalid URL parameter format. URL must be a single string.' });
  }
  
  try {
    const info = await ytDlp(videoUrl, {
      dumpSingleJson: true,
      noCheckCertificate: true,
      noWarnings: true,
      preferFreeFormats: true,
      youtubeSkipDashManifest: true,
      // Updated format to ensure browser compatibility
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      addHeader: 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8; Accept-Language: en-US,en;q=0.5; DNT: 1; Connection: keep-alive',
      format: 'bestaudio[ext=m4a]/bestaudio[ext=mp3]/bestaudio[ext=aac]/bestaudio[ext=webm]/bestaudio',
    });

    const audioUrl = info.url;
    
    res.json({ audioUrl });
  } catch (err) {
    console.error('Error fetching audio URL:', err);
    res.status(500).json({ error: 'Failed to retrieve audio URL' });
  }
});

// Production Configuration
// ----------------------
// Serve static files from the React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(serverRoot, '../client/dist')));
  
  // Handle any requests that don't match the API routes
  app.get('*', (_req, res) => {
    res.sendFile(path.join(serverRoot, '../client/dist/index.html'));
  });
}

// Start the server
app.listen(serverConfig.port, () => {
  console.log(`Server running on port ${serverConfig.port}`);
});

export default app;
