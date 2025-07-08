import { Request, Response } from 'express';
import macroService from './macroService.js';
import fileService from '../files/fileService.js';
import { macroToDTO } from 'src/utils/format-transformers/audio-transformer.js';

/**
 * Get all macros
 * @route GET /api/audio/macros
 * @param {boolean} [req.query.includeFiles] - Whether to include files in each macro
 * @returns {Object[]} 200 - Array of macro objects (optionally with files)
 * @throws {Error} 500 - Server error
 */
export const getAllMacros = async (req: Request, res: Response) => {
  try {
    const includeFiles = req.query.includeFiles === 'true';
    let response;
    
    if (includeFiles) {
      response = await macroService.getAllMacros();
      
      if (response.success && response.data) {
        // Process each macro to include its files
        const macrosWithFiles = await Promise.all(
          response.data.map(async (macro) => {
            const macroWithFiles = await macroService.getMacroWithFiles(macro.id);
            return macroWithFiles.success ? macroToDTO(macroWithFiles.data) : macroToDTO(macro);
          })
        );
        
        response.data = macrosWithFiles;
      }
    } else {
      response = await macroService.getAllMacros();
      if (response.success && response.data) {
        response.data = response.data.map(macroToDTO);
      }
    }

    if (response.success) {
      res.status(200).json(response.data);
    } else {
      res.status(500).json({ error: response.error });
    }
  } catch (error) {
    console.error('Error getting macros:', error);
    res.status(500).json({ error: 'Failed to retrieve macros' });
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
 * @throws {Error} 500 - Server error
 */
export const getMacroById = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid macro ID' });
  }
  
  try {
    const includeFiles = req.query.includeFiles === 'true';
    let response;
    
    if (includeFiles) {
      response = await macroService.getMacroWithFiles(id);
      
      if (response.success && response.data) {
        // Transform the macro with its files
        response.data = macroToDTO(response.data);
      }
    } else {
      response = await macroService.getMacroById(id);
      if (response.success && response.data) {
        response.data = macroToDTO(response.data);
      }
    }

    if (response.success) {
      res.status(200).json(response.data);
    } else if (response.notFound) {
      res.status(404).json({ error: response.error });
    } else {
      res.status(500).json({ error: response.error });
    }
  } catch (error) {
    console.error(`Error getting macro ${id}:`, error);
    res.status(500).json({ error: 'Failed to retrieve macro' });
  }
};

/**
 * Create a new macro
 * @route POST /api/audio/macros
 * @param {string} req.body.name - Name of the macro (required)
 * @param {string} [req.body.description] - Description of the macro
 * @returns {Object} 201 - Created macro object
 * @throws {ValidationError} 400 - Missing or invalid name
 * @throws {Error} 500 - Server error
 */
export const createMacro = async (req: Request, res: Response) => {
  const { name, description } = req.body;
  
  if (!name) {
    return res.status(400).json({ 
      field: 'name',
      error: 'Macro name is required' 
    });
  }
  
  try {
    const response = await macroService.createMacro(name, description || null);
    
    if (response.success) {
      res.status(201).json(macroToDTO(response.data));
    } else {
      res.status(400).json({ error: response.error });
    }
  } catch (error) {
    console.error('Error creating macro:', error);
    res.status(500).json({ error: 'Failed to create macro' });
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
 * @throws {Error} 500 - Server error
 */
export const updateMacro = async (req: Request, res: Response) => {
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
    const response = await macroService.updateMacro(id, name, description, volume);
    
    if (response.success) {
      res.status(200).json({ message: 'Macro updated successfully' });
    } else if (response.notFound) {
      res.status(404).json({ error: response.error });
    } else {
      res.status(400).json({ error: response.error });
    }
  } catch (error) {
    console.error(`Error updating macro ${id}:`, error);
    res.status(500).json({ error: 'Failed to update macro' });
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
 * @throws {Error} 500 - Server error
 */
export const updateMacroFile = async (req: Request, res: Response) => {
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
    const response = await macroService.updateMacroFile(macroId, fileId, params);

    if (response.success) {
      res.status(200).json({ message: 'File updated successfully in macro' });
    } else if (response.notFound) {
      res.status(404).json({ error: response.error });
    } else {
      res.status(400).json({ error: response.error });
    }
  } catch (error) {
    console.error(`Error updating file in macro ${macroId}:`, error);
    res.status(500).json({ error: 'Failed to update file in macro' });
  }
};

/**
 * Delete a macro
 * @route DELETE /api/audio/macros/{id}
 * @param {number} req.params.id - Macro ID
 * @returns {Object} 200 - Success message
 * @throws {ValidationError} 400 - Invalid macro ID
 * @throws {NotFoundError} 404 - Macro not found
 * @throws {Error} 500 - Server error
 */
export const deleteMacro = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid macro ID' });
  }
  
  try {
    const response = await macroService.deleteMacro(id);
    
    if (response.success) {
      res.status(200).json({ message: 'Macro deleted successfully' });
    } else if (response.notFound) {
      res.status(404).json({ error: response.error });
    } else {
      res.status(500).json({ error: response.error });
    }
  } catch (error) {
    console.error(`Error deleting macro ${id}:`, error);
    res.status(500).json({ error: 'Failed to delete macro' });
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
 * @throws {Error} 500 - Server error
 */
export const addFileToMacro = async (req: Request, res: Response) => {
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
    
    const response = await macroService.addFileToMacro(
      macroId, 
      fileId, 
      delay !== undefined ? delay : 0
    );
    
    if (response.success) {
      res.status(201).json({ message: 'Audio file added to macro' });
    } else if (response.notFound) {
      res.status(404).json({ error: response.error });
    } else {
      res.status(400).json({ error: response.error });
    }
  } catch (error) {
    console.error(`Error adding file to macro ${macroId}:`, error);
    res.status(500).json({ error: 'Failed to add file to macro' });
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
 * @throws {Error} 500 - Server error
 */
export const addFilesToMacro = async (req: Request, res: Response) => {
  const macroId = parseInt(req.params.id);
  const { fileIds } = req.body;
  
  if (isNaN(macroId) || !Array.isArray(fileIds) || fileIds.length === 0) {
    return res.status(400).json({ error: 'Invalid macro ID or file IDs' });
  }
  
  try {
    const response = await macroService.addFilesToMacro(macroId, fileIds);
    
    if (response.success) {
      res.status(201).json({ message: `Added ${fileIds.length} files to macro` });
    } else if (response.notFound) {
      res.status(404).json({ error: response.error });
    } else {
      res.status(400).json({ error: response.error });
    }
  } catch (error) {
    console.error(`Error adding files to macro ${macroId}:`, error);
    res.status(500).json({ error: 'Failed to add files to macro' });
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
 * @throws {Error} 500 - Server error
 */
export const removeFileFromMacro = async (req: Request, res: Response) => {
  const macroId = parseInt(req.params.id);
  const fileId = parseInt(req.params.fileId);
  
  if (isNaN(macroId) || isNaN(fileId)) {
    return res.status(400).json({ error: 'Invalid macro ID or file ID' });
  }
  
  try {
    const response = await macroService.removeFileFromMacro(macroId, fileId);
    
    if (response.success) {
      res.status(200).json({ message: 'Audio file removed from macro' });
    } else if (response.notFound) {
      res.status(404).json({ error: response.error });
    } else {
      res.status(500).json({ error: response.error });
    }
  } catch (error) {
    console.error(`Error removing file from macro ${macroId}:`, error);
    res.status(500).json({ error: 'Failed to remove file from macro' });
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