import express from 'express';
import packController from './packController.js';

const router = express.Router();

// GET /audio/packs - Get all packs
router.get('/', packController.getAllPacks);

// POST /audio/packs - Create a new pack
router.post('/', packController.createPack);

// DELETE /audio/packs/:id - Delete a pack
router.delete('/:id', packController.deletePack);

// POST /audio/packs/:id/collections - Add a collection to a pack
router.post('/:id/collections', packController.addCollectionToPack);

// GET /audio/packs/:id/collections - Get all collections in a pack
router.get('/:id/collections', packController.getPackCollections);

export default router;
