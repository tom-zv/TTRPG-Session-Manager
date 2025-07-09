import { Request, Response, NextFunction } from 'express';
import macroService from './macroService.js';
import fileService from '../files/fileService.js';
import { macroToDTO } from 'src/utils/format-transformers/audio-transformer.js';

/**
 * Get all macros
 * @route GET /api/audio/macros
 * @param {boolean} [req.query.includeFiles] - Whether to include files in each macro
 * @returns {Object[]} 200 - Array of macro objects (optionally with files)
 * @throws Forwards errors to the global error handler
 */
export const getAllMacros = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const includeFiles = req.query.includeFiles === 'true';
    let macros;
    
    if (includeFiles) {
      // Get all macros first
      macros = await macroService.getAllMacros();
      
      // Process each macro to include its files
      const macrosWithFiles = await Promise.all(
        macros.map(async (macro) => {
          try {
            const macroWithFiles = await macroService.getMacroWithFiles(macro.id);
            return macroToDTO(macroWithFiles);
          } catch {
            return macroToDTO(macro);
          }
        })
      );
      
      res.status(200).json(macrosWithFiles);
    } else {
      macros = await macroService.getAllMacros();
      res.status(200).json(macros.map(macroToDTO));
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Get a macro by ID
 * @route GET /api/audio/macros/{id}
 * @param {number} req.params.id - Macro ID
 * @param {boolean} [req.query.includeFiles] - Whether to include files in the macro
 * @returns {Object} 200 - Macro object (optionally with files)
 * @throws {ValidationError} 400 - Invalid macro ID
 * @throws {NotFoundError} 404 - Macro not found
 * @throws Forwards errors to the global error handler
 */
export const getMacroById = async (req: Request, res: Response, next: NextFunction) => {
  const id = parseInt(req.params.id);
  
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid macro ID' });
  }
  
  try {
    const includeFiles = req.query.includeFiles === 'true';
    let macro;
    
    if (includeFiles) {
      macro = await macroService.getMacroWithFiles(id);
    } else {
      macro = await macroService.getMacroById(id);
    }
    
    res.status(200).json(macroToDTO(macro));
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new macro
 * @route POST /api/audio/macros
 * @param {string} req.body.name - Name of the macro (required)
 * @param {string} [req.body.description] - Description of the macro
 * @returns {Object} 201 - Created macro object
 * @throws {ValidationError} 400 - Missing or invalid name
 * @throws Forwards errors to the global error handler
 */
export const createMacro = async (req: Request, res: Response, next: NextFunction) => {
  const { name, description } = req.body;
  
  if (!name) {
    return res.status(400).json({ 
      field: 'name',
      error: 'Macro name is required' 
    });
  }
  
  try {
    const macro = await macroService.createMacro(name, description || null);
    res.status(201).json(macroToDTO(macro));
  } catch (error) {
    next(error);
  }
};

/**
 * Update a macro
 * @route PUT /api/audio/macros/{id}
 * @param {number} req.params.id - Macro ID
 * @param {string} [req.body.name] - New name for the macro
 * @param {string} [req.body.description] - New description for the macro
 * @param {number} [req.body.volume] - New volume (0-1)
 * @returns {Object} 200 - Success message
 * @throws {ValidationError} 400 - Invalid parameters
 * @throws {NotFoundError} 404 - Macro not found
 * @throws Forwards errors to the global error handler
 */
export const updateMacro = async (req: Request, res: Response, next: NextFunction) => {
  const id = parseInt(req.params.id);
  const { name, description, volume } = req.body;

  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid macro ID' });
  }

  // All fields are optional, but at least one must be provided
  if (name === undefined && description === undefined && volume === undefined) {
    return res.status(400).json({ error: 'No update parameters provided' });
  }

  if (volume !== undefined && (typeof volume !== 'number' || volume < 0 || volume > 1)) {
    return res.status(400).json({ 
      field: 'volume', 
      error: 'Volume must be a number between 0 and 1' 
    });
  }

  try {
    await macroService.updateMacro(id, name, description, volume);
    res.status(200).json({ message: 'Macro updated successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a file within a macro
 * @route PUT /api/audio/macros/{id}/files/{fileId}
 * @param {number} req.params.id - Macro ID
 * @param {number} req.params.fileId - File ID
 * @param {number} [req.body.volume] - New volume (0-1)
 * @param {number} [req.body.delay] - New delay (ms)
 * @returns {Object} 200 - Success message
 * @throws {ValidationError} 400 - Invalid parameters
 * @throws {NotFoundError} 404 - Macro or file not found
 * @throws Forwards errors to the global error handler
 */
export const updateMacroFile = async (req: Request, res: Response, next: NextFunction) => {
  const macroId = parseInt(req.params.id);
  const fileId = parseInt(req.params.fileId);
  const { volume, delay } = req.body;
  
  if (isNaN(macroId) || isNaN(fileId)) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  // Collect parameters to update
  const params: {volume?: number, delay?: number} = {};
  
  if (volume !== undefined) {
    if (typeof volume !== 'number' || volume < 0 || volume > 1) {
      return res.status(400).json({ 
        field: 'volume', 
        error: 'Volume must be a number between 0 and 1' 
      });
    }
    params.volume = volume;
  }
  
  if (delay !== undefined) {
    if (typeof delay !== 'number' || delay < 0) {
      return res.status(400).json({ 
        field: 'delay', 
        error: 'Delay must be a non-negative number' 
      });
    }
    params.delay = delay;
  }

  if (Object.keys(params).length === 0) {
    return res.status(400).json({ error: 'No update parameters provided' });
  }

  try {
    await macroService.updateMacroFile(macroId, fileId, params);
    res.status(200).json({ message: 'File updated successfully in macro' });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a macro
 * @route DELETE /api/audio/macros/{id}
 * @param {number} req.params.id - Macro ID
 * @returns {Object} 200 - Success message
 * @throws {ValidationError} 400 - Invalid macro ID
 * @throws {NotFoundError} 404 - Macro not found
 * @throws Forwards errors to the global error handler
 */
export const deleteMacro = async (req: Request, res: Response, next: NextFunction) => {
  const id = parseInt(req.params.id);
  
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid macro ID' });
  }
  
  try {
    await macroService.deleteMacro(id);
    res.status(200).json({ message: 'Macro deleted successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * Add a file to a macro
 * @route POST /api/audio/macros/{id}/files
 * @param {number} req.params.id - Macro ID
 * @param {number} req.body.fileId - File ID to add
 * @param {number} [req.body.delay] - Delay for the file (ms)
 * @returns {Object} 201 - Success message
 * @throws {ValidationError} 400 - Invalid macro ID or file ID
 * @throws {NotFoundError} 404 - Macro or file not found
 * @throws Forwards errors to the global error handler
 */
export const addFileToMacro = async (req: Request, res: Response, next: NextFunction) => {
  const macroId = parseInt(req.params.id);
  const { fileId, delay } = req.body;
  
  if (isNaN(macroId) || !fileId) {
    return res.status(400).json({ error: 'Invalid macro ID or file ID' });
  }
  
  try {
    // Check if audio file exists
    const audioFile = await fileService.getAudioFile(fileId);
    if (!audioFile) {
      return res.status(404).json({ error: 'Audio file not found' });
    }
    
    await macroService.addFileToMacro(
      macroId, 
      fileId, 
      delay !== undefined ? delay : 0
    );
    
    res.status(201).json({ message: 'Audio file added to macro' });
  } catch (error) {
    next(error);
  }
};

/**
 * Add multiple files to a macro
 * @route POST /api/audio/macros/{id}/files/batch
 * @param {number} req.params.id - Macro ID
 * @param {number[]} req.body.fileIds - Array of file IDs to add
 * @returns {Object} 201 - Success message
 * @throws {ValidationError} 400 - Invalid macro ID or file IDs
 * @throws {NotFoundError} 404 - Macro not found
 * @throws Forwards errors to the global error handler
 */
export const addFilesToMacro = async (req: Request, res: Response, next: NextFunction) => {
  const macroId = parseInt(req.params.id);
  const { fileIds } = req.body;
  
  if (isNaN(macroId) || !Array.isArray(fileIds) || fileIds.length === 0) {
    return res.status(400).json({ error: 'Invalid macro ID or file IDs' });
  }
  
  try {
    await macroService.addFilesToMacro(macroId, fileIds);
    res.status(201).json({ message: `Added ${fileIds.length} files to macro` });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove a file from a macro
 * @route DELETE /api/audio/macros/{id}/files/{fileId}
 * @param {number} req.params.id - Macro ID
 * @param {number} req.params.fileId - File ID to remove
 * @returns {Object} 200 - Success message
 * @throws {ValidationError} 400 - Invalid macro ID or file ID
 * @throws {NotFoundError} 404 - Macro or file not found
 * @throws Forwards errors to the global error handler
 */
export const removeFileFromMacro = async (req: Request, res: Response, next: NextFunction) => {
  const macroId = parseInt(req.params.id);
  const fileId = parseInt(req.params.fileId);
  
  if (isNaN(macroId) || isNaN(fileId)) {
    return res.status(400).json({ error: 'Invalid macro ID or file ID' });
  }
  
  try {
    await macroService.removeFileFromMacro(macroId, fileId);
    res.status(200).json({ message: 'Audio file removed from macro' });
  } catch (error) {
    next(error);
  }
};

export default {
  getAllMacros,
  getMacroById,
  createMacro,
  updateMacro,
  deleteMacro,
  addFileToMacro,
  addFilesToMacro,
  updateMacroFile,
  removeFileFromMacro
};