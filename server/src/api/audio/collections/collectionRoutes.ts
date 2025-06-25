import express from 'express';
import collectionController from './collectionController.js';

// Base route - api/audio/collections

const router = express.Router();

// GET /collections - Get all collections of all types
router.get('/', collectionController.getAllCollectionsAllTypes);

/*
 * Macro-in-collection endpoints
 ***************************/
// POST /collections/sfx/:id/macros - Add a macro to a collection
router.post('/sfx/:id/macros', collectionController.addMacroToCollection);

// DELETE /collections/sfx/:id/macros/:macroId - Remove a macro from a collection
router.delete('/sfx/:id/macros/:macroId', collectionController.deleteMacroFromCollection);

// POST /collections/sfx/:id/macros/batch - Add multiple macros to a collection
router.post('/sfx/:id/macros/batch', collectionController.addMacrosToCollection);

/* Collection endpoints
 ***********************/

// GET /collections/:type - Get all collections of a specific type
router.get('/:type', collectionController.getAllCollections);

// GET /collections/:type/:id - Get a collection by ID
router.get('/:type/:id', collectionController.getCollectionById);

// POST /collections/:type - Create a new collection
router.post('/:type', collectionController.createCollection);

// PUT /collections/:type/:id - Update a collection
router.put('/:type/:id', collectionController.updateCollection);

// DELETE /collections/:type/:id - Delete a collection
router.delete('/:type/:id', collectionController.deleteCollection);

/* Collection file management endpoints 
 ***************************************/

// POST /collections/:type/:id/files - Add a file to a collection
router.post('/:type/:id/files', collectionController.addFileToCollection);

// POST /collections/:type/:id/files/batch - Add multiple files to a collection in one operation
router.post('/:type/:id/files/batch', collectionController.addFilesToCollection);

// DELETE /collections/:type/:id/files/:fileId - Remove a file from a collection
router.delete('/:type/:id/files/:fileId', collectionController.removeFileFromCollection);

// PUT /collections/:type/:id/files/:fileId/position - Update the position of a file in a collection
router.put('/:type/:id/files/:fileId/position', collectionController.updateCollectionFilePosition);

// PUT /collections/:type/:id/files/positions - Move a range of files to a new position
router.put('/:type/:id/files/positions', collectionController.updateFileRangePosition);

// PUT /collections/:type/:id/files/:fileId - Update a file in a collection
router.put('/:type/:id/files/:fileId', collectionController.updateFile);

export default router;