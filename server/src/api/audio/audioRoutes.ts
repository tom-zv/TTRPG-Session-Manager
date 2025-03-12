import express from 'express';
import fileRoutes from './file/fileRoutes.js';
import playlistRoutes from './playlist/playlistRoutes.js';
import folderRoutes from './folder/folderRoutes.js';

const router = express.Router();

// Mount file routes at /files
router.use('/files', fileRoutes);

// Mount playlist routes at /playlists
router.use('/playlists', playlistRoutes);

// Mount folder routes at /folders
router.use('/folders', folderRoutes);

// For backward compatibility, mount file routes at root as well
router.use('/', fileRoutes);

export default router;
