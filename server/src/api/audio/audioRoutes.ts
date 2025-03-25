import express from 'express';
import fileRoutes from './files/fileRoutes.js';
import folderRoutes from './folders/folderRoutes.js';
import collectionRoutes from './collections/collectionRoutes.js';

// Base route - api/audio
// This file is responsible for mounting all the audio-related routes

const router = express.Router();

// Mount file routes at /files
router.use('/files', fileRoutes);

// Mount folder routes at /folders
router.use('/folders', folderRoutes);

// Mount collection routes at /collections
router.use('/collections', collectionRoutes);

export default router;
