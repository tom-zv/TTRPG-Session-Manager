import type { Request, Response, NextFunction } from 'express';
import collectionService from './collectionService.js';
import fileService from '../files/fileService.js';
import { transformCollection, transformAudioFileToDTO, transformMacro } from '../../../utils/format-transformers.js';
import { ValidationError } from 'src/api/HttpErrors.js';

// Valid collection types - macros are now handled separately
const collectionTypes = ['playlist', 'ambience', 'sfx'];

/**
 * Get all collections of a specific type
 * @route GET /api/audio/collections/{type}
 * @param {string} req.params.type - Collection type (playlist, ambience, sfx)
 * @param {boolean} [req.query.includeFiles] - Whether to include files in the response
 * @returns {Object[]} 200 - Array of collection objects
 * @throws {ValidationError} 400 - Invalid collection type
 */
export const getAllCollections = async (
  req: Request, 
  res: Response, 
  next: NextFunction
) => {
  try {
    const type = req.params.type;
    
    // Validate collection type
    if (!collectionTypes.includes(type)) {
      throw new ValidationError('Invalid collection type');
    }
    
    const includeFiles = req.query.includeFiles === 'true';
    let collections;
    
   
    if (includeFiles) {
      collections = await collectionService.getAllCollectionsWithFiles(type);
      
      // Transform collections with their files/macros
      collections = collections.map(collection => {
        const transformedCollection = transformCollection(collection);
        
        if (type === 'sfx') {
          // For SFX, merge files and macros into a unified items array
          const fileItems = (collection.files ?? []).map(file => ({
            ...transformAudioFileToDTO(file),
            itemType: 'file' as const
          }));
          const macroItems = (collection.macros ?? []).map(macro => ({
            ...transformMacro(macro),
            itemType: 'macro' as const
          }));
          
          const items = [...fileItems, ...macroItems].sort((a, b) => {
            const posA = a.position ?? 0;
            const posB = b.position ?? 0;
            return posA - posB;
          });
          return {
            ...transformedCollection,
            items
          };
        } else {
          // For other types, just use files as items
          const items = (collection.files ?? []).map(file => transformAudioFileToDTO(file));
          return {
            ...transformedCollection,
            items
          };
        }
      });
      
    } else {
      collections = await collectionService.getAllCollections(type);
      collections = collections.map(collection => transformCollection(collection));
    }

    res.status(200).json(collections);
  } catch (error) {
    next(error);
  }
};

/**
 * Get all collections of all types
 * @route GET /api/audio/collections
 * @returns {Object[]} 200 - Array of all collections
 */
export const getAllCollectionsAllTypes = async (
  _req: Request, 
  res: Response, 
  next: NextFunction
) => {
  try {
    const collections = await collectionService.getAllCollectionsAllTypes();
    res.status(200).json(collections);
  } catch (error) {
    next(error);
  }
};

/**
 * Get a collection by ID
 * @route GET /api/audio/collections/{type}/{id}
 * @param {string} req.params.type - Collection type
 * @param {number} req.params.id - Collection ID
 * @param {boolean} [req.query.includeFiles] - Whether to include files/macros in the response
 * @returns {Object} 200 - Collection object (with items if includeFiles is true)
 * @throws {ValidationError} 400 - Invalid collection type or ID
 */
export const getCollectionById = async (
  req: Request, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  try {
    const type = req.params.type;
    const id = parseInt(req.params.id);
    
    // Validate collection type
    if (!collectionTypes.includes(type)) {
      throw new ValidationError('Invalid collection type');
    }
    
    if (isNaN(id)) {
      throw new ValidationError('Invalid collection ID');
    }
    
    const includeFiles = req.query.includeFiles === 'true';
    if (includeFiles) {
      const collectionWithFiles = await collectionService.getCollectionWithFiles(type, id);

      if (type === 'sfx') {
        // For SFX, merge files and macros into a unified items array, transforming to DTOs
        const fileItems = (collectionWithFiles.files ?? []).map(file => ({
          ...transformAudioFileToDTO(file),
          itemType: 'file' as const
        }));
        const macroItems = (collectionWithFiles.macros ?? []).map(macro => ({
          ...transformMacro(macro),
          itemType: 'macro' as const
        }));
        
        const items = [...fileItems, ...macroItems].sort((a, b) => {
          const posA = a.position ?? 0;
          const posB = b.position ?? 0;
          return posA - posB;
        });

        // Build response object with only the desired properties
        res.status(200).json({
          ...transformCollection(collectionWithFiles),
          items
        });
      } else {
        // For other types, just use files as items, transforming to DTOs
        const items = (collectionWithFiles.files ?? []).map(file => transformAudioFileToDTO(file));
        res.status(200).json({
          ...transformCollection(collectionWithFiles),
          items
        });
      }
    } else {
      const collection = await collectionService.getCollectionById(type, id);
      res.status(200).json(collection);
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new collection
 * @route POST /api/audio/collections/{type}
 * @param {string} req.params.type - Collection type
 * @param {string} req.body.name - Name of the collection
 * @param {string} [req.body.description] - Description of the collection
 * @returns {Object} 201 - Created collection object
 * @throws {ValidationError} 400 - Invalid collection type or missing name
 */
export const createCollection = async (
  req: Request, 
  res: Response, 
  next: NextFunction
) => {
  try {
    const type = req.params.type;
    const { name, description } = req.body;
    
    // Validate collection type
    if (!collectionTypes.includes(type)) {
      throw new ValidationError('Invalid collection type');
    }
    
    if (!name) {
      throw new ValidationError('Collection name is required');
    }
    
    const collection = await collectionService.createCollection(type, name, description || null);
    res.status(201).json(collection);
  } catch (error) {
    next(error);
  }
};

/**
 * Update an existing collection
 * @route PUT /api/audio/collections/{type}/{id}
 * @param {string} req.params.type - Collection type
 * @param {number} req.params.id - Collection ID
 * @param {string} [req.body.name] - New name for the collection
 * @param {string} [req.body.description] - New description for the collection
 * @returns {Object} 200 - Success message
 * @throws {ValidationError} 400 - Invalid collection type, ID, or no update parameters
 */
export const updateCollection = async (
  req: Request, 
  res: Response, 
  next: NextFunction
) => {
  try {
    const type = req.params.type;
    const id = parseInt(req.params.id);
    const { name, description } = req.body; 

    if (!collectionTypes.includes(type)) {
      throw new ValidationError('Invalid collection type');
    }
    if (isNaN(id)) {
      throw new ValidationError(`Invalid ${type} collection ID`);
    }

    // All fields are optional, but at least one must be provided
    if (name === undefined && description === undefined) {
      throw new ValidationError('No update parameters provided');
    }

    await collectionService.updateCollection(type, id, name, description);
    res.status(200).json({ message: `${type} collection updated successfully` });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a collection by ID
 * @route DELETE /api/audio/collections/{type}/{id}
 * @param {string} req.params.type - Collection type
 * @param {number} req.params.id - Collection ID
 * @returns {Object} 200 - Success message
 * @throws {ValidationError} 400 - Invalid collection type or ID
 */
export const deleteCollection = async (
  req: Request, 
  res: Response, 
  next: NextFunction
) => {
  try {
    const type = req.params.type;
    const id = parseInt(req.params.id);
    
    // Validate collection type
    if (!collectionTypes.includes(type)) {
      throw new ValidationError('Invalid collection type');
    }
    
    if (isNaN(id)) {
      throw new ValidationError(`Invalid ${type} collection ID`);
    }
    
    await collectionService.deleteCollection(type, id);
    res.status(200).json({ message: `${type} collection deleted successfully` });
  } catch (error) {
    next(error);
  }
};

/**
 * Add a file to a collection
 * @route POST /api/audio/collections/{type}/{id}/files
 * @param {string} req.params.type - Collection type
 * @param {number} req.params.id - Collection ID
 * @param {number} req.body.fileId - Audio file ID to add
 * @param {number} [req.body.position] - Position in the collection
 * @returns {Object} 201 - Success message
 * @throws {ValidationError} 400 - Invalid parameters or audio file not found
 */
export const addFileToCollection = async (
  req: Request, 
  res: Response, 
  next: NextFunction
) => {
  try {
    const type = req.params.type;
    const collectionId = parseInt(req.params.id);
    const { fileId, position } = req.body;
    
    // Validate collection type
    if (!collectionTypes.includes(type)) {
      throw new ValidationError('Invalid collection type');
    }
    
    if (isNaN(collectionId) || !fileId) {
      throw new ValidationError(`Invalid ${type} collection ID or audio file ID`);
    }
    
    // Check if collection exists
    await collectionService.getCollectionById(type, collectionId);
    
    // Check if audio file exists
    const audioFile = await fileService.getAudioFile(fileId);
    if (!audioFile) {
      throw new ValidationError('Audio file not found');
    }
    
    await collectionService.addFileToCollection(type, collectionId, fileId, position);
    res.status(201).json({ message: `Audio file added to ${type} collection` });
  } catch (error) {
    next(error);
  }
};

/**
 * Add multiple files to a collection
 * @route POST /api/audio/collections/{type}/{id}/files/batch
 * @param {string} req.params.type - Collection type
 * @param {number} req.params.id - Collection ID
 * @param {number[]} req.body.fileIds - Array of audio file IDs to add
 * @param {number} [req.body.startPosition] - Start position for adding files
 * @returns {Object} 201 - Success message
 * @throws {ValidationError} 400 - Invalid parameters
 */
export const addFilesToCollection = async (
  req: Request, 
  res: Response, 
  next: NextFunction
) => {
  try {
    const type = req.params.type;
    const collectionId = parseInt(req.params.id);
    const { fileIds, startPosition } = req.body;
    
    // Validate collection type
    if (!collectionTypes.includes(type)) {
      throw new ValidationError('Invalid collection type');
    }
    
    if (isNaN(collectionId) || !Array.isArray(fileIds) || fileIds.length === 0) {
      throw new ValidationError(`Invalid ${type} collection ID or audio file IDs`);
    }
    
    // Check if collection exists
    await collectionService.getCollectionById(type, collectionId);
    
    await collectionService.addFilesToCollection(
      type, 
      collectionId, 
      fileIds, 
      startPosition !== undefined ? startPosition : null
    );
    
    res.status(201).json({ message: `Added ${fileIds.length} files to ${type} collection` });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove a file from a collection
 * @route DELETE /api/audio/collections/{type}/{id}/files/{fileId}
 * @param {string} req.params.type - Collection type
 * @param {number} req.params.id - Collection ID
 * @param {number} req.params.fileId - Audio file ID to remove
 * @returns {Object} 200 - Success message
 * @throws {ValidationError} 400 - Invalid parameters
 */
export const removeFileFromCollection = async (
  req: Request, 
  res: Response, 
  next: NextFunction
) => {
  try {
    const type = req.params.type;
    const collectionId = parseInt(req.params.id);
    const fileId = parseInt(req.params.fileId);
    
    // Validate collection type
    if (!collectionTypes.includes(type)) {
      throw new ValidationError('Invalid collection type');
    }
    
    if (isNaN(collectionId) || isNaN(fileId)) {
      throw new ValidationError(`Invalid ${type} collection ID or audio file ID`);
    }
    
    await collectionService.removeFileFromCollection(type, collectionId, fileId);
    res.status(200).json({ message: `Audio file removed from ${type} collection` });
  } catch (error) {
    next(error);
  }
};

/**
 * Update the position of a file in a collection
 * @route PUT /api/audio/collections/{type}/{id}/files/{fileId}/position
 * @param {string} req.params.type - Collection type
 * @param {number} req.params.id - Collection ID
 * @param {number} req.params.fileId - Audio file ID
 * @param {number} req.body.targetPosition - New position for the file
 * @returns {Object} 200 - Success message
 * @throws {ValidationError} 400 - Invalid parameters
 */
export const updateCollectionFilePosition = async (
  req: Request, 
  res: Response, 
  next: NextFunction
) => {
  try {
    const type = req.params.type;
    const collectionId = parseInt(req.params.id);
    const fileId = parseInt(req.params.fileId);
    const { targetPosition } = req.body;

    // Validate collection type
    if (!collectionTypes.includes(type)) {
      throw new ValidationError('Invalid collection type');
    }
    
    if (isNaN(collectionId) || isNaN(fileId)) {
      throw new ValidationError('Invalid parameters');
    }
    
    await collectionService.updateCollectionFilePosition(
      type, collectionId, fileId, targetPosition
    );
    
    res.status(200).json({ message: `Position updated successfully in ${type} collection` });
  } catch (error) {
    next(error);
  }
};

/**
 * Move a range of files within a collection
 * @route PUT /api/audio/collections/{type}/{id}/files/range/position
 * @param {string} req.params.type - Collection type
 * @param {number} req.params.id - Collection ID
 * @param {number} req.body.sourceStartPosition - Start position of the range
 * @param {number} req.body.sourceEndPosition - End position of the range
 * @param {number} req.body.targetPosition - Target position for the range
 * @returns {Object} 200 - Success message
 * @throws {ValidationError} 400 - Invalid parameters
 */
export const updateFileRangePosition = async (
  req: Request, 
  res: Response, 
  next: NextFunction
) => {
  try {
    const type = req.params.type;
    const collectionId = parseInt(req.params.id);
    const { sourceStartPosition, sourceEndPosition, targetPosition } = req.body;
    
    // Validate collection type
    if (!collectionTypes.includes(type)) {
      throw new ValidationError('Invalid collection type');
    }
    
    if (isNaN(collectionId)) {
      throw new ValidationError(`Invalid ${type} collection ID`);
    }
    
    if (
      typeof sourceStartPosition !== 'number' || 
      typeof sourceEndPosition !== 'number' || 
      typeof targetPosition !== 'number'
    ) {
      throw new ValidationError('Invalid position parameters');
    }
    
    await collectionService.updateFileRangePosition(
      type,
      collectionId,
      sourceStartPosition,
      sourceEndPosition,
      targetPosition
    );
    
    res.status(200).json({ message: `${type} collection items moved successfully` });
  } catch (error) {
    next(error);
  }
};

/**
 * Update collection-file parameters (active, volume)
 * @route PUT /api/audio/collections/{type}/{id}/files/{fileId}
 * @param {string} req.params.type - Collection type
 * @param {number} req.params.id - Collection ID
 * @param {number} req.params.fileId - Audio file ID
 * @param {boolean} [req.body.active] - Whether the file is active in the collection
 * @param {number} [req.body.volume] - Volume for the file in the collection
 * @returns {Object} 200 - Success message
 * @throws {ValidationError} 400 - Invalid parameters or no update parameters
 */
export const updateFile = async (
  req: Request, 
  res: Response, 
  next: NextFunction
) => {
  try {
    const type = req.params.type;
    const collectionId = parseInt(req.params.id);
    const fileId = parseInt(req.params.fileId);
    
    const { active, volume } = req.body;

    if (isNaN(collectionId) || isNaN(fileId)) {
      throw new ValidationError('Invalid parameters');
    }

    // Collect only collection‐file parameters
    const collectionFileParams: {active?: boolean, volume?: number} = {};
    if (active !== undefined) collectionFileParams.active = active;
    if (volume !== undefined) collectionFileParams.volume = volume;

    if (Object.keys(collectionFileParams).length === 0) {
      throw new ValidationError('No update parameters provided');
    }

    await collectionService.updateCollectionFile(
      collectionId,
      fileId,
      collectionFileParams
    );

    res.status(200).json({
      message: `File updated successfully in ${type} collection`
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add a macro to an SFX collection
 * @route POST /api/audio/collections/sfx/{id}/macros
 * @param {number} req.params.id - SFX collection ID
 * @param {number} req.body.macroId - Macro ID to add
 * @param {number} [req.body.position] - Position in the collection
 * @returns {Object} 201 - Success message
 * @throws {ValidationError} 400 - Invalid parameters
 */
export const addMacroToCollection = async (
  req: Request, 
  res: Response, 
  next: NextFunction
) => {
  try {
    const collectionId = parseInt(req.params.id);
    const { macroId, position } = req.body;
    
    if (isNaN(collectionId) || !macroId) {
      throw new ValidationError('Invalid collection ID or macro ID');
    }
    
    await collectionService.addMacroToCollection(
      collectionId,
      macroId,
      position !== undefined ? position : null
    );
    
    res.status(201).json({ message: 'Macro added to SFX collection' });
  } catch (error) {
    next(error);
  }
};

/**
 * Add multiple macros to an SFX collection
 * @route POST /api/audio/collections/sfx/{id}/macros/batch
 * @param {number} req.params.id - SFX collection ID
 * @param {number[]} req.body.macroIds - Array of macro IDs to add
 * @param {number} [req.body.startPosition] - Start position for adding macros
 * @returns {Object} 201 - Success message
 * @throws {ValidationError} 400 - Invalid parameters
 */
export const addMacrosToCollection = async (
  req: Request, 
  res: Response, 
  next: NextFunction
) => {
  try {
    const collectionId = parseInt(req.params.id);
    const { macroIds, startPosition } = req.body;
    
    if (isNaN(collectionId) || !Array.isArray(macroIds) || macroIds.length === 0) {
      throw new ValidationError('Invalid collection ID or macro IDs');
    }
    
    await collectionService.addMacrosToCollection(
      collectionId, 
      macroIds, 
      startPosition !== undefined ? startPosition : null
    );
    
    res.status(201).json({ message: `Added ${macroIds.length} macros to SFX collection` });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove a macro from an SFX collection
 * @route DELETE /api/audio/collections/sfx/{id}/macros/{macroId}
 * @param {number} req.params.id - SFX collection ID
 * @param {number} req.params.macroId - Macro ID to remove
 * @returns {Object} 200 - Success message
 * @throws {ValidationError} 400 - Invalid parameters
 */
export const deleteMacroFromCollection = async (
  req: Request, 
  res: Response, 
  next: NextFunction
) => {
  try {
    const collectionId = parseInt(req.params.id);
    const macroId = parseInt(req.params.macroId);
    
    if (isNaN(collectionId) || isNaN(macroId)) {
      throw new ValidationError('Invalid collection ID or macro ID');
    }
    
    await collectionService.removeMacroFromCollection(collectionId, macroId);
    res.status(200).json({ message: 'Macro removed from SFX collection' });
  } catch (error) {
    next(error);
  }
};

export default {
  getAllCollections,
  getAllCollectionsAllTypes,
  getCollectionById,
  createCollection,
  updateCollection,
  deleteCollection,
  addFileToCollection,
  addFilesToCollection,
  removeFileFromCollection,
  updateCollectionFilePosition,
  updateFileRangePosition,
  updateFile,
  addMacroToCollection,
  addMacrosToCollection,
  deleteMacroFromCollection
};