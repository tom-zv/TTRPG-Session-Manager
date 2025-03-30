import express from 'express';
import fileRoutes from './files/fileRoutes.js';
import folderRoutes from './folders/folderRoutes.js';
import collectionRoutes from './collections/collectionRoutes.js';
import macroRoutes from './macros/macroRoutes.js';

// Base route - api/audio
// This file is responsible for mounting all the audio-related routes

const router = express.Router();

// Mount file routes at /files
router.use('/files', fileRoutes);

// Mount folder routes at /folders
router.use('/folders', folderRoutes);

// Mount collection routes at /collections
router.use('/collections', collectionRoutes);

// Mount macro routes at /macros
router.use('/macro', macroRoutes);

export default router;
