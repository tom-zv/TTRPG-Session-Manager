import collectionModel from './collectionModel.js';
import { audioPool } from "src/db.js";
import macroService from '../macros/macroService.js';
import { ValidationError, NotFoundError } from 'src/api/HttpErrors.js';

import type {
  CollectionDB,
  CollectionAudioFileDB,
  MacroDB,
} from '../types.js';

/**
 * Get all collections of a specific type
 * @param type The collection type (playlist, ambience, sfx)
 */
export async function getAllCollections(type: string): Promise<CollectionDB[]> {
  try {
    return await collectionModel.getAllCollections(type);
  } catch (error) {
    console.error(`Service error getting all ${type} collections:`, error);
    throw error;
  }
}

export async function getAllCollectionsAllTypes(): Promise<CollectionDB[]> {
  try {
    return await collectionModel.getAllCollectionsAllTypes();
  } catch (error) {
    console.error('Service error getting all collections:', error);
    throw error;
  }
}

/**
 * Get a collection by its ID and type
 * @param type The collection type (playlist, ambience, sfx)
 * @param id The collection ID
 */
export async function getCollectionById(type: string, id: number): Promise<CollectionDB> {
  try {
    const collections = await collectionModel.getCollectionById(type, id);
    
    if (collections.length === 0) {
      throw new NotFoundError(`${type} collection not found`);
    }
    return collections[0];
  } catch (error) {
    console.error(`Service error getting ${type} collection ${id}:`, error);
    throw error;
  }
}

/**
 * Get a collection with its files
 * @param type The collection type (playlist, ambience, sfx)
 * @param id The collection ID
 */
export async function getCollectionWithFiles(
  type: string,
  id: number
): Promise<CollectionDB & { files: CollectionAudioFileDB[]; macros?: MacroDB[] }> {
  try {
    // First, get the collection metadata
    const collection = await getCollectionById(type, id);

    // Get the files for this collection
    const filesResult = await collectionModel.getCollectionFiles(type, id);

    const result: CollectionDB & { files: CollectionAudioFileDB[]; macros?: MacroDB[] } = {
      ...collection,
      files: filesResult.files
    };

    // SFX collections can also contain macros
    if (type === 'sfx') {
      result.macros = filesResult.macros;
    }

    return result;
  } catch (error) {
    console.error(`Service error getting ${type} collection with files ${id}:`, error);
    throw error;
  }
}

export async function createCollection(
  type: string,
  name: string,
  description: string | null
): Promise<CollectionDB> {
  try {
    if (!name) {
      throw new ValidationError('Collection name is required');
    }
    
    const insertId = await collectionModel.createCollection(type, name, description);
    
    if (!insertId) {
      throw new Error(`Failed to create ${type} collection`);
    }
    
    const collection = await getCollectionById(type, insertId);
    return collection;
  } catch (error) {
    console.error(`Service error creating ${type} collection:`, error);
    throw error;
  }
}

export async function updateCollection(
  type: string,
  id: number, 
  name?: string, 
  description?: string | null
): Promise<void> {
  try {
    const affectedRows = await collectionModel.updateCollection(type, id, name, description);

    if (affectedRows === 0) {
      // Check if collection exists
      await getCollectionById(type, id);
      throw new ValidationError(`No changes made to ${type} collection`);
    }
  } catch (error) {
    console.error(`Service error updating ${type} collection ${id}:`, error);
    throw error;
  }
}

export async function deleteCollection(type: string, id: number): Promise<void> {
  try {
    // Check if collection exists first
    await getCollectionById(type, id);
    
    const affectedRows = await collectionModel.deleteCollection(type, id);
    
    if (!affectedRows) {
      throw new Error(`Failed to delete ${type} collection`);
    }
  } catch (error) {
    console.error(`Service error deleting ${type} collection ${id}:`, error);
    throw error;
  }
}

/* Collection file management endpoints 
 ****************************************/

export async function addFileToCollection(
  type: string,
  collectionId: number,
  fileId: number,
  position: number | null = null
): Promise<void> {
  try {
    const affectedRows = await collectionModel.addFileToCollection(
      type, collectionId, fileId, position
    );
    
    if (affectedRows === 0) {
      throw new Error(`Failed to add file to ${type} collection`);
    }
  } catch (error) {
    console.error(`Service error adding file ${fileId} to ${type} collection ${collectionId}:`, error);
    throw error;
  }
}

export async function addFilesToCollection(
  type: string,
  collectionId: number,
  fileIds: number[],
  startPosition: number | null = null
): Promise<void> {
  try {
    if (!fileIds || fileIds.length === 0) {
      throw new ValidationError('No files specified');
    }
    
    const affectedRows = await collectionModel.addFilesToCollection(
      type, collectionId, fileIds, startPosition
    );
    
    if (affectedRows === 0) {
      throw new Error(`Failed to add files to ${type} collection`);
    }
  } catch (error) {
    console.error(`Service error adding files to ${type} collection ${collectionId}:`, error);
    throw error;
  }
}

export async function removeFileFromCollection(
  type: string,
  collectionId: number, 
  fileId: number
): Promise<void> {
  try {
    const affectedRows = await collectionModel.removeFileFromCollection(
      type, collectionId, fileId
    );
    
    if (!affectedRows) {
      throw new NotFoundError(`File not found in ${type} collection`);
    }
  } catch (error) {
    console.error(`Service error removing file ${fileId} from ${type} collection ${collectionId}:`, error);
    throw error;
  }
}

export async function updateCollectionFilePosition(
  type: string,
  collectionId: number,
  fileId: number,
  targetPosition: number
): Promise<void> {
  try {
    if (typeof targetPosition !== 'number') {
      throw new ValidationError('Invalid position');
    }
    
    const affectedRows = await collectionModel.updateCollectionFilePosition(
      type, collectionId, fileId, targetPosition
    );
    
    if (!affectedRows) {
      throw new NotFoundError(`File not found in ${type} collection`);
    }
  } catch (error) {
    console.error(`Service error updating file position for ${fileId} in ${type} collection ${collectionId}:`, error);
    throw error;
  }
}

export async function updateFileRangePosition(
  type: string,
  collectionId: number,
  sourceStartPosition: number,
  sourceEndPosition: number,
  targetPosition: number
): Promise<void> {
  try {
    if (
      typeof sourceStartPosition !== 'number' || 
      typeof sourceEndPosition !== 'number' || 
      typeof targetPosition !== 'number'
    ) {
      throw new ValidationError('Invalid position parameters');
    }
    
    if (sourceStartPosition > sourceEndPosition) {
      throw new ValidationError('Start position must be less than or equal to end position');
    }
    
    const affectedRows = await collectionModel.updateFileRangePosition(
      type, collectionId, sourceStartPosition, sourceEndPosition, targetPosition
    );
    
    if (affectedRows === 0) {
      throw new NotFoundError(`No ${type} collection items found in the specified range`);
    }
  } catch (error) {
    console.error(`Service error moving items in ${type} collection ${collectionId}:`, error);
    throw error;
  }
}

export async function updateCollectionFile(
  collectionId: number,
  fileId: number,
  params: {
    active?: boolean,
    volume?: number
  }
): Promise<void> {
  try {
    // First, verify the file exists in the collection
    const [existingFile] = await audioPool.execute(
      `SELECT * FROM collection_files WHERE collection_id = ? AND file_id = ?`,
      [collectionId, fileId]
    );
    
    if (!(existingFile as CollectionAudioFileDB[])[0]) {
      throw new NotFoundError('File not found in collection');
    }
    
    // Update collection_files table properties if needed
    const collectionFileParams: Partial<Pick<CollectionAudioFileDB, 'active' | 'volume'>> = {};
    if (params.active !== undefined) collectionFileParams.active = params.active;
    if (params.volume !== undefined) collectionFileParams.volume = params.volume;
    
    if (Object.keys(collectionFileParams).length === 0) {
      throw new ValidationError('No collection file fields to update');
    }
    
    const affectedRows = await collectionModel.updateCollectionFile(
      collectionId,
      fileId,
      collectionFileParams
    );
    
    if (!affectedRows) {
      throw new Error('No collection file fields were updated');
    }
  } catch (error) {
    console.error(`Service error updating file ${fileId} in collection ${collectionId}:`, error);
    throw error;
  }
}

// Functions to maintain backward compatibility with SFX collections containing macros
export async function addMacroToCollection(
  collectionId: number,
  macroId: number,
  position: number | null = null
): Promise<void> {
  try {
    // Check if collection exists and is of sfx type
    await getCollectionById('sfx', collectionId);
    
    // Check if macro exists using macroService
    await macroService.getMacroById(macroId);
    
    const affectedRows = await collectionModel.addMacroToCollection(collectionId, macroId, position);
    
    if (affectedRows === 0) {
      throw new Error('Failed to add macro to SFX collection');
    } else if (affectedRows === -1) {
      throw new ValidationError('Macro already exists in this collection');
    }
  } catch (error) {
    console.error(`Service error adding macro ${macroId} to SFX collection ${collectionId}:`, error);
    throw error;
  }
}

export async function addMacrosToCollection(
  collectionId: number,
  macroIds: number[],
  startPosition: number | null = null
): Promise<void> {
  try {
    if (!macroIds || macroIds.length === 0) {
      throw new ValidationError('No macros specified');
    }
    
    // Check if collection exists and is of sfx type
    await getCollectionById('sfx', collectionId);
    
    // Check if all macros exist using macroService
    for (const macroId of macroIds) {
      await macroService.getMacroById(macroId);
    }
    
    const affectedRows = await collectionModel.addMacrosToCollection(collectionId, macroIds, startPosition);
    
    if (affectedRows === 0) {
      throw new Error('Failed to add macros to SFX collection');
    }
  } catch (error) {
    console.error(`Service error adding macros to SFX collection ${collectionId}:`, error);
    throw error;
  }
}

export async function getAllCollectionsWithFiles(
  type: string
): Promise<(CollectionDB & { files: CollectionAudioFileDB[]; macros: MacroDB[] })[]> {
  try {
    const collections = await collectionModel.getAllCollections(type);
    
    // For each collection, fetch its files
    return await Promise.all(
      collections.map(async (collection: CollectionDB) => {
        const result = await collectionModel.getCollectionFiles(type, collection.id);
        
        return {
          ...collection,
          files: result.files,
          macros: result.macros || []
        };
      })
    );
  } catch (error) {
    console.error(`Service error getting all ${type} collections with files:`, error);
    throw error;
  }
}

export async function removeMacroFromCollection(
  collectionId: number, 
  macroId: number
): Promise<void> {
  try {
    // Check if collection exists and is of sfx type
    await getCollectionById('sfx', collectionId);
    
    // Check if macro exists using macroService
    await macroService.getMacroById(macroId);
    
    const affectedRows = await collectionModel.removeMacroFromCollection(collectionId, macroId);
    
    if (!affectedRows) {
      throw new NotFoundError('Macro not found in this collection');
    }
  } catch (error) {
    console.error(`Service error removing macro ${macroId} from SFX collection ${collectionId}:`, error);
    throw error;
  }
}

export default {
  getAllCollections,
  getAllCollectionsAllTypes,
  getAllCollectionsWithFiles,
  getCollectionById,
  getCollectionWithFiles,
  createCollection,
  updateCollection,
  deleteCollection,
  addFileToCollection,
  addFilesToCollection,
  updateCollectionFile,
  removeFileFromCollection,
  updateCollectionFilePosition,
  updateFileRangePosition,
  // Functions for handling macros in collections (kept for backward compatibility)
  addMacroToCollection,
  addMacrosToCollection,
  removeMacroFromCollection
};