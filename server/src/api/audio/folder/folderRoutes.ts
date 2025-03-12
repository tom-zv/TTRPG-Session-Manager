import express from 'express';
import * as folderController from './folderController.js';

const router = express.Router();

// GET / - Get all folders
router.get('/', folderController.getAllFolders);

// GET /:id - Get folder by ID
router.get('/:id', folderController.getFolderById);

// GET /type/:type - Get folders by type
router.get('/type/:type', folderController.getFoldersByType);

// GET /:parentId/subfolders - Get subfolders
router.get('/:parentId/subfolders', folderController.getSubFolders);

export default router;
