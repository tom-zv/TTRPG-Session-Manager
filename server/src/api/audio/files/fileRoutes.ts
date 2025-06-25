import express from 'express';
import * as fileController from './fileController.js';
import { audioUpload } from '../../../middleware/fileUpload.js';

const router = express.Router();
// Base route - api/audio/files

// GET / - Get all audio files
router.get('/', fileController.getAllAudioFiles);

// GET /:id - Get audio file by ID
router.get('/:id', fileController.getAudioFile);

// POST / - Upload one or more audio files
router.post('/upload', audioUpload.array('files', 100), fileController.uploadAudioFiles);

// POST /download-urls - Download audio files from provided URLs
router.post('/download-urls', fileController.downloadAudioUrls);

// PUT /:id - Update audio file
router.put('/:id', fileController.updateAudioFile);

// DELETE /:id - Delete audio file by ID
router.delete('/:id', fileController.deleteAudioFile);

// DELETE / - Delete multiple audio files
router.delete('/', fileController.deleteAudioFiles);

// POST /scan - Scan for audio files
router.post('/scan', fileController.scan);


export default router;
