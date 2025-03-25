import express from 'express';
import collectionController from './collectionController.js';

// Base route - api/audio/collections

const router = express.Router();

/* Pack endpoints
 *****************/
// GET /pack - Get all packs
router.get('/pack', collectionController.getAllPacks);

// POST /pack - Create a new pack
router.post('/pack', collectionController.createPack);

// DELETE /pack/:id - Delete a pack
router.delete('/pack/:id', collectionController.deletePack);

// POST /pack/:id/collections - Add a collection to a pack
router.post('/pack/:id/collections', collectionController.addCollectionToPack);

// GET /pack/:id/collections - Get all collections in a pack
router.get('/pack/:id/collections', collectionController.getPackCollections);

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

export default router;