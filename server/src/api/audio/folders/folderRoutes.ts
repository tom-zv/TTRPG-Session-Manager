import express from 'express';
import * as folderController from './folderController.js';

const router = express.Router();

// GET / - Get all folders
router.get('/', folderController.getAllFolders);

// POST / - Create a new folder
router.post('/', folderController.createFolder);

// DELETE / - Delete multiple folders
router.delete('/', folderController.deleteFolders);

// GET /:id - Get folder by ID
router.get('/:id', folderController.getFolderById);

// DELETE /:id - Delete folder by ID
router.delete('/:id', folderController.deleteFolder);

// GET /:parentId/subfolders - Get subfolders
router.get('/:parentId/subfolders', folderController.getSubFolders);

export default router;
