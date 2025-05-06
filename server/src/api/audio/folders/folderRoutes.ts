import express from 'express';
import * as folderController from './folderController.js';

const router = express.Router();

// GET / - Get all folders
router.get('/', folderController.getAllFolders);

// POST / - Create a new folder
router.post('/', folderController.createFolder);

// GET /:id - Get folder by ID
router.get('/:id', folderController.getFolderById);

// GET /:parentId/subfolders - Get subfolders
router.get('/:parentId/subfolders', folderController.getSubFolders);

export default router;
