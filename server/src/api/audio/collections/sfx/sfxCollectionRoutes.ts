import express from 'express';
import * as sfxController from './sfxCollectionController.js';
const router = express.Router();

router.get('/collections', sfxController.getAllSfxCollections);

export default router;