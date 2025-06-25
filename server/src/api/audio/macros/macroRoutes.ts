import express from 'express';
import macroController from './macroController.js';

// Base route - api/audio/macro
const router = express.Router();

// GET /macros - Get all macros
router.get('/', macroController.getAllMacros);

// GET /macros/:id - Get a macro by ID
router.get('/:id', macroController.getMacroById);

// POST /macros - Create a new macro
router.post('/', macroController.createMacro);

// PUT /macros/:id - Update a macro
router.put('/:id', macroController.updateMacro);

// DELETE /macros/:id - Delete a macro
router.delete('/:id', macroController.deleteMacro);

// POST /macros/:id/files - Add a file to a macro
router.post('/:id/files', macroController.addFileToMacro);

// POST /macros/:id/files/batch - Add multiple files to a macro
router.post('/:id/files/batch', macroController.addFilesToMacro);

// DELETE /macros/:id/files/:fileId - Remove a file from a macro
router.delete('/:id/files/:fileId', macroController.removeFileFromMacro);

// PUT /macros/:id/files/:fileId - Update a file in a macro (delay, volume)
router.put('/:id/files/:fileId', macroController.updateMacroFile);

export default router;