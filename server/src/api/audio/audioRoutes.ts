import express from 'express';
import fileRoutes from './files/fileRoutes.js';
import folderRoutes from './folders/folderRoutes.js';
import playlistRoutes from './collections/playlists/playlistRoutes.js';
import sfxRoutes from './collections/sfx/sfxCollectionRoutes.js';

const router = express.Router();

// Mount file routes at /files
router.use('/files', fileRoutes);

// Mount playlist routes at /playlists
router.use('/playlists', playlistRoutes);

// Mount folder routes at /folders
router.use('/folders', folderRoutes);

// mount sfx routes at /sfx
router.use('/sfx', sfxRoutes);

export default router;
