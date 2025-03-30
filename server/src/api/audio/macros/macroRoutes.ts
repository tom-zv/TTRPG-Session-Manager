import express from 'express';
import collectionController from '../collections/collectionController.js';

// Base route - api/audio/macros

const router = express.Router();

// GET /macros - Get all macros
router.get('/', (req, res) => {
  (req.params as any).type = 'macro';
  collectionController.getAllCollections(req, res);
});

// GET /macros/:id - Get a macro by ID
router.get('/:id', (req, res) => {
  (req.params as any).type = 'macro';
  collectionController.getCollectionById(req, res);
});

// POST /macros - Create a new macro
router.post('/', (req, res) => {
  (req.params as any).type = 'macro';
  console.log('Creating macro:', req.body);
  collectionController.createCollection(req, res);
});

// PUT /macros/:id - Update a macro
router.put('/:id', (req, res) => {
  (req.params as any).type = 'macro';
  collectionController.updateCollection(req, res);
});

// DELETE /macros/:id - Delete a macro
router.delete('/:id', (req, res) => {
  (req.params as any).type = 'macro';
  collectionController.deleteCollection(req, res);
});

// POST /macros/:id/files - Add a file to a macro
router.post('/:id/files', (req, res) => {
  (req.params as any).type = 'macro';
  collectionController.addFileToCollection(req, res);
});

// POST /macros/:id/files/batch - Add multiple files to a macro
router.post('/:id/files/batch', (req, res) => {
  (req.params as any).type = 'macro';
  collectionController.addFilesToCollection(req, res);
});

// DELETE /macros/:id/files/:fileId - Remove a file from a macro
router.delete('/:id/files/:fileId', (req, res) => {
  (req.params as any).type = 'macro';
  collectionController.removeFileFromCollection(req, res);
});

// PUT /macros/:id/files/:fileId - Update a file in a macro (delay, volume)
router.put('/:id/files/:fileId', (req, res) => {
  (req.params as any).type = 'macro';
  collectionController.updateItem(req, res);
});

export default router;