import express from 'express';
import * as audioController from './audioController.js';

const router = express.Router();

// GET /api/audio - Get all audio files
router.get('/', audioController.getAllAudioFiles);

// GET /api/audio/:id - Get audio file by ID
router.get('/:id', audioController.getAudioFileById);

// POST /api/audio - Create a new audio file
router.post('/', audioController.createAudioFile);

export default router;
