import express from 'express';
import * as fileController from './fileController.js';
import { audioUpload } from '../../../middleware/fileUpload.js';

const router = express.Router();

// GET / - Get all audio files
router.get('/', fileController.getAllAudioFiles);

// GET /:id - Get audio file by ID
router.get('/:id', fileController.getAudioFileById);

// POST / - Create a new audio file with optional file upload
router.post('/', audioUpload.single('audioFile'), fileController.createAudioFile);

// POST /scan - Scan for audio files
router.post('/scan', fileController.scan);

export default router;
