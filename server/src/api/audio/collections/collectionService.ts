import collectionModel from './collectionModel.js';
import macroModel from '../macros/macroModel.js';
import { pool } from "src/db.js";
import fs from 'fs/promises';
import path from 'path';
import { toAbsolutePath, toRelativePath } from '../../../utils/path-utils.js';

// Interface for standardized service responses
export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  notFound?: boolean;
}

export async function getAllCollections(type: string): Promise<ServiceResponse<any[]>> {
  try {
    let collections;
    if (type === 'macro') {
      collections = await macroModel.getAllMacros();
    } else {
      collections = await collectionModel.getAllCollections(type);
    }
    return { success: true, data: collections };
  } catch (error) {
    console.error(`Service error getting all ${type} collections:`, error);
    return { success: false, error: `Failed to retrieve ${type} collections` };
  }
}

export async function getAllCollectionsAllTypes(): Promise<ServiceResponse<any[]>> {
  try {
    const collections = await collectionModel.getAllCollectionsAllTypes();
    return { success: true, data: collections };
  } catch (error) {
    console.error('Service error getting all collections:', error);
    return { success: false, error: 'Failed to retrieve collections' };
  }
}

export async function getCollectionById(type: string, id: number): Promise<ServiceResponse<any>> {
  try {
    let collections;
    if (type === 'macro') {
      collections = await macroModel.getMacroById(id);
    } else {
      collections = await collectionModel.getCollectionById(type, id);
    }
    
    if (collections.length === 0) {
      return { success: false, notFound: true, error: `${type} collection not found` };
    }
    return { success: true, data: collections[0] };
  } catch (error) {
    console.error(`Service error getting ${type} collection ${id}:`, error);
    return { success: false, error: `Failed to retrieve ${type} collection` };
  }
}

export async function getCollectionWithFiles(type: string, id: number): Promise<ServiceResponse<any>> {
  try {
    const collectionResponse = await getCollectionById(type, id);
    if (!collectionResponse.success) {
      return collectionResponse;
    }
    
    let result;
    if (type === 'macro') {
      const files = await macroModel.getMacroFiles(id); 
      result = { files, macros: [] };
    } else {
      result = await collectionModel.getCollectionFiles(type, id);
    }
    
    return {
      success: true,
      data: {
        ...collectionResponse.data,
        files: result.files,
        macros: result.macros || []
      }
    };
  } catch (error) {
    console.error(`Service error getting ${type} collection with files ${id}:`, error);
    return { success: false, error: `Failed to retrieve ${type} collection with files` };
  }
}

export async function createCollection(type: string, name: string, description: string | null): Promise<ServiceResponse<any>> {
  try {
    if (!name) {
      return { success: false, error: 'Collection name is required' };
    }
    
    let insertId;
    if (type === 'macro') {
      insertId = await macroModel.createMacro(name, description);
    } else {
      insertId = await collectionModel.createCollection(type, name, description);
    }
    
    if (!insertId) {
      return { success: false, error: `Failed to create ${type} collection` };
    }
    
    const collectionResponse = await getCollectionById(type, insertId);
    if (!collectionResponse.success) {
      return { success: false, error: `${type} collection created but could not be retrieved` };
    }
    
    return { success: true, data: collectionResponse.data };
  } catch (error) {
    console.error(`Service error creating ${type} collection:`, error);
    return { success: false, error: `Failed to create ${type} collection` };
  }
}

export async function updateCollection(
  type: string,
  id: number, 
  name?: string, 
  description?: string | null,
  volume?: number
): Promise<ServiceResponse<any>> {
  try {
    let affectedRows = 0;
    if (type === 'macro') {
      affectedRows = await macroModel.updateMacro(id, name, description, volume);
    } else {
      affectedRows = await collectionModel.updateCollection(type, id, name, description);
    }

    if (affectedRows > 0) {
      return { success: true };
    } else {
      const checkResponse = await getCollectionById(type, id);
      if (!checkResponse.success) {
        return { success: false, notFound: true, error: `${type} collection not found` };
      }
      return { success: false, error: `Failed to update ${type} collection` };
    }
  } catch (error) {
    console.error(`Service error updating ${type} collection ${id}:`, error);
    return { success: false, error: `Failed to update ${type} collection` };
  }
}

export async function deleteCollection(type: string, id: number): Promise<ServiceResponse<void>> {
  try {
    const collectionResponse = await getCollectionById(type, id);
    if (!collectionResponse.success) {
      return collectionResponse;
    }
    
    let affectedRows;
    if (type === 'macro') {
      affectedRows = await macroModel.deleteMacro(id);
    } else {
      affectedRows = await collectionModel.deleteCollection(type, id);
    }
    
    if (!affectedRows) {
      return { success: false, error: `Failed to delete ${type} collection` };
    }
    
    return { success: true };
  } catch (error) {
    console.error(`Service error deleting ${type} collection ${id}:`, error);
    return { success: false, error: `Failed to delete ${type} collection` };
  }
}

/* Collection file management endpoints 
 ****************************************/

export async function addFileToCollection(
  type: string,
  collectionId: number,
  audioFileId: number,
  position: number | null = null,
  delay: number | null = null
): Promise<ServiceResponse<void>> {
  try {
    let affectedRows;
    if (type === 'macro') {
      // For macros, position represents delay
      affectedRows = await macroModel.addFileToMacro(collectionId, audioFileId, delay || 0);
    } else {
      affectedRows = await collectionModel.addFileToCollection(type, collectionId, audioFileId, position);
    }
    
    if (affectedRows === 0) {
      return { success: false, error: `Failed to add file to ${type} collection` };
    }
    return { success: true };
  } catch (error) {
    console.error(`Service error adding file ${audioFileId} to ${type} collection ${collectionId}:`, error);
    return { success: false, error: `Failed to add file to ${type} collection` };
  }
}

export async function addFilesToCollection(
  type: string,
  collectionId: number,
  audioFileIds: number[],
  startPosition: number | null = null
): Promise<ServiceResponse<void>> {
  try {
    if (!audioFileIds || audioFileIds.length === 0) {
      return { success: false, error: 'No files specified' };
    }
    let affectedRows;
    if (type === 'macro') {
      affectedRows = await macroModel.addFilesToMacro(collectionId, audioFileIds);
    } else {
      affectedRows = await collectionModel.addFilesToCollection(type, collectionId, audioFileIds, startPosition);
    }
    if (affectedRows === 0) {
      return { success: false, error: `Failed to add files to ${type} collection` };
    }
    return { success: true };
  } catch (error) {
    console.error(`Service error adding files to ${type} collection ${collectionId}:`, error);
    return { success: false, error: `Failed to add files to ${type} collection` };
  }
}

export async function removeFileFromCollection(
  type: string,
  collectionId: number, 
  audioFileId: number
): Promise<ServiceResponse<void>> {
  try {
    let affectedRows;
    if (type === 'macro') {
      affectedRows = await macroModel.removeFileFromMacro(collectionId, audioFileId);
    } else {
      affectedRows = await collectionModel.removeFileFromCollection(type, collectionId, audioFileId);
    }
    
    if (!affectedRows) {
      return { success: false, notFound: true, error: `${type} collection file not found` };
    }
    
    return { success: true };
  } catch (error) {
    console.error(`Service error removing file ${audioFileId} from ${type} collection ${collectionId}:`, error);
    return { success: false, error: `Failed to remove file from ${type} collection` };
  }
}

export async function updateCollectionFilePosition(
  type: string,
  collectionId: number,
  audioFileId: number,
  targetPosition: number
): Promise<ServiceResponse<void>> {
  try {
    if (typeof targetPosition !== 'number') {
      return { success: false, error: 'Invalid position' };
    }
    
    const affectedRows = await collectionModel.updateCollectionFilePosition(
      type, collectionId, audioFileId, targetPosition
    );
    
    if (!affectedRows) {
      return { success: false, notFound: true, error: `${type} collection file not found` };
    }
    
    return { success: true };
  } catch (error) {
    console.error(`Service error updating file position for ${audioFileId} in ${type} collection ${collectionId}:`, error);
    return { success: false, error: `Failed to update file position in ${type} collection` };
  }
}

export async function updateFileRangePosition(
  type: string,
  collectionId: number,
  sourceStartPosition: number,
  sourceEndPosition: number,
  targetPosition: number
): Promise<ServiceResponse<void>> {
  try {
    if (
      typeof sourceStartPosition !== 'number' || 
      typeof sourceEndPosition !== 'number' || 
      typeof targetPosition !== 'number'
    ) {
      return { success: false, error: 'Invalid position parameters' };
    }
    
    if (sourceStartPosition > sourceEndPosition) {
      return { success: false, error: 'Start position must be less than or equal to end position' };
    }
    
    const affectedRows = await collectionModel.updateFileRangePosition(
      type, collectionId, sourceStartPosition, sourceEndPosition, targetPosition
    );
    
    if (affectedRows === 0) {
      return { success: false, notFound: true, error: `No ${type} collection items found in the specified range` };
    }
    
    return { success: true };
  } catch (error) {
    console.error(`Service error moving items in ${type} collection ${collectionId}:`, error);
    return { success: false, error: `Failed to move ${type} collection items` };
  }
}

export async function updateFile(
  type: string,
  collectionId: number,
  audioFileId: number,
  params: {
    name?: string,
    file_path?: string,
    file_url?: string,  
    volume?: number,
    // For macro type
    delay?: number, 
    // for ambience type
    active?: boolean, 
  }
): Promise<ServiceResponse<void>> {
  try {
    let affectedRows = 0;
    
    if (type === 'macro') {
      // For macros, update the macro file properties
      affectedRows = await macroModel.updateMacroFile(
        collectionId, 
        audioFileId, 
        params.delay, 
        params.volume
      );
    } else {
      // For other collection types, update the audio file properties
      // First, verify the file exists in the collection
      const [existingFile] = await pool.execute(
        `SELECT * FROM collection_files WHERE collection_id = ? AND audio_file_id = ?`,
        [collectionId, audioFileId]
      );
      
      if (!(existingFile as any[])[0]) {
        return { success: false, notFound: true, error: `File not found in collection` };
      }
      
      // Track if we need to update the audio_files table
      let needsAudioFileUpdate = false;
      const audioFileParams: any = {};
      
      // If name is being updated and we have a file on disk, we need to rename the actual file
      if (params.name) {
        needsAudioFileUpdate = true;
        audioFileParams.name = params.name;
        
        // Get the current file record to access file_path
        const [fileRecord] = await pool.execute(
          `SELECT * FROM audio_files WHERE audio_file_id = ?`,
          [audioFileId]
        );
        
        const currentFile = (fileRecord as any[])[0];
        if (currentFile && currentFile.file_path) {
          try {
            const currentAbsolutePath = toAbsolutePath(currentFile.file_path);
            const fileDir = path.dirname(currentAbsolutePath);
            const fileExt = path.extname(currentAbsolutePath);
            
            // Create new file path with the new name but same extension
            const newFileName = `${params.name}${fileExt}`;
            const newAbsolutePath = path.join(fileDir, newFileName);
            
            // Check if file exists before trying to rename
            await fs.access(currentAbsolutePath);
            
            // Rename the file on disk
            await fs.rename(currentAbsolutePath, newAbsolutePath);
            
            // Update the file_path in params to reflect the new name
            const newRelativePath = toRelativePath(newAbsolutePath);
            audioFileParams.file_path = newRelativePath;
          } catch (fsError) {
            console.error(`Error renaming file:`, fsError);
            // Don't fail the whole operation if file renaming fails
            // Just update the database record without changing the file
          }
        }
      }
      
      if (params.file_path) {
        needsAudioFileUpdate = true;
        audioFileParams.file_path = params.file_path;
      }
      
      if (params.file_url) {
        needsAudioFileUpdate = true;
        audioFileParams.file_url = params.file_url;
      }
      
      // Update audio_files table if needed
      if (needsAudioFileUpdate) {
        const audioFileResult = await collectionModel.updateAudioFile(
          audioFileId,
          audioFileParams
        );
        affectedRows += audioFileResult;
      }
      
      // Update collection_files table properties if needed
      const collectionFileParams: any = {};
      if (params.active !== undefined) collectionFileParams.active = params.active;
      if (params.volume !== undefined) collectionFileParams.volume = params.volume;
      
      if (Object.keys(collectionFileParams).length > 0) {
        const collectionFileResult = await collectionModel.updateCollectionFile(
          collectionId,
          audioFileId,
          collectionFileParams
        );
        affectedRows += collectionFileResult;
      }
    }
    
    if (!affectedRows) {
      return { success: false, error: `No fields were updated` };
    }
    
    return { success: true };
  } catch (error) {
    console.error(`Service error updating file ${audioFileId} in ${type} collection ${collectionId}:`, error);
    return { success: false, error: `Failed to update file in ${type} collection` };
  }
}

export async function updateAudioFile(
  audioFileId: number,
  params: {
    name?: string,
    file_path?: string,
    file_url?: string
  }
): Promise<ServiceResponse<void>> {
  try {
    const audioFileParams: any = {};
    
    // If name is being updated and we have a file on disk, we need to rename the actual file
    if (params.name) {
      audioFileParams.name = params.name;
      
      // Get the current file record to access file_path
      const [fileRecord] = await pool.execute(
        `SELECT * FROM audio_files WHERE audio_file_id = ?`,
        [audioFileId]
      );
      
      const currentFile = (fileRecord as any[])[0];
      if (currentFile && currentFile.file_path) {
        try {
          const currentAbsolutePath = toAbsolutePath(currentFile.file_path);
          const fileDir = path.dirname(currentAbsolutePath);
          const fileExt = path.extname(currentAbsolutePath);
          
          // Create new file path with the new name but same extension
          const newFileName = `${params.name}${fileExt}`;
          const newAbsolutePath = path.join(fileDir, newFileName);
          
          // Check if file exists before trying to rename
          await fs.access(currentAbsolutePath);
          
          // Rename the file on disk
          await fs.rename(currentAbsolutePath, newAbsolutePath);
          
          // Update the file_path in params to reflect the new name
          const newRelativePath = toRelativePath(newAbsolutePath);
          audioFileParams.file_path = newRelativePath;
          
        } catch (fsError) {
          console.error(`Error renaming file:`, fsError);
          // Don't fail the whole operation if file renaming fails
          // Just update the database record without changing the file
        }
      }
    }
    
    if (params.file_path !== undefined) {
      audioFileParams.file_path = params.file_path;
    }
    
    if (params.file_url !== undefined) {
      audioFileParams.file_url = params.file_url;
    }
    
    if (Object.keys(audioFileParams).length === 0) {
      return { success: false, error: `No audio file fields to update` };
    }
    
    const affectedRows = await collectionModel.updateAudioFile(
      audioFileId,
      audioFileParams
    );
    
    if (!affectedRows) {
      return { success: false, error: `No audio file fields were updated` };
    }
    
    return { success: true };
  } catch (error) {
    console.error(`Service error updating audio file ${audioFileId}:`, error);
    return { success: false, error: `Failed to update audio file` };
  }
}

export async function updateCollectionFile(
  type: string,
  collectionId: number,
  audioFileId: number,
  params: {
    volume?: number,
    active?: boolean,
    delay?: number  // For macro type
  }
): Promise<ServiceResponse<void>> {
  try {
    let affectedRows = 0;
    
    if (type === 'macro') {
      // For macros, update the macro file properties
      affectedRows = await macroModel.updateMacroFile(
        collectionId, 
        audioFileId, 
        params.delay, 
        params.volume
      );
    } else {
      // First, verify the file exists in the collection
      const [existingFile] = await pool.execute(
        `SELECT * FROM collection_files WHERE collection_id = ? AND audio_file_id = ?`,
        [collectionId, audioFileId]
      );
      
      if (!(existingFile as any[])[0]) {
        return { success: false, notFound: true, error: `File not found in collection` };
      }
      
      // Update collection_files table properties if needed
      const collectionFileParams: any = {};
      if (params.active !== undefined) collectionFileParams.active = params.active;
      if (params.volume !== undefined) collectionFileParams.volume = params.volume;
      
      if (Object.keys(collectionFileParams).length > 0) {
        affectedRows = await collectionModel.updateCollectionFile(
          collectionId,
          audioFileId,
          collectionFileParams
        );
      } else {
        return { success: false, error: `No collection file fields to update` };
      }
    }
    
    if (!affectedRows) {
      return { success: false, error: `No collection file fields were updated` };
    }
    
    return { success: true };
  } catch (error) {
    console.error(`Service error updating file ${audioFileId} in ${type} collection ${collectionId}:`, error);
    return { success: false, error: `Failed to update file in ${type} collection` };
  }
}

/* Pack endpoints
 *****************/

export const getAllPacks = async (): Promise<ServiceResponse<any[]>> => {
  try {
    const packs = await collectionModel.getAllPacks();
    return { success: true, data: packs };
  } catch (error) {
    console.error('Service error getting all packs:', error);
    return { success: false, error: 'Failed to retrieve packs' };
  }
};

export const createPack = async (name: string, description: string | null): Promise<ServiceResponse<any>> => {
  try {
    if (!name) {
      return { success: false, error: 'Pack name is required' };
    }
    
    const insertId = await collectionModel.createPack(name, description);
    if (!insertId) {
      return { success: false, error: 'Failed to create pack' };
    }
    
    const pack = await collectionModel.getAllPacks();
    const createdPack = pack.find(p => p.pack_id === insertId);
    
    if (!createdPack) {
      return { success: false, error: 'Pack created but could not be retrieved' };
    }
    
    return { success: true, data: createdPack };
  } catch (error) {
    console.error('Service error creating pack:', error);
    return { success: false, error: 'Failed to create pack' };
  }
};

export const deletePack = async (packId: number): Promise<ServiceResponse<void>> => {
  try {
    const packs = await collectionModel.getAllPacks();
    const packExists = packs.some(pack => pack.pack_id === packId);
    
    if (!packExists) {
      return { success: false, notFound: true, error: 'Pack not found' };
    }
    
    const affectedRows = await collectionModel.deletePack(packId);
    if (!affectedRows) {
      return { success: false, error: 'Failed to delete pack' };
    }
    
    return { success: true };
  } catch (error) {
    console.error(`Service error deleting pack ${packId}:`, error);
    return { success: false, error: 'Failed to delete pack' };
  }
};

export const addCollectionToPack = async (
  packId: number,
  collectionId: number,
): Promise<ServiceResponse<void>> => {
  try {
    // Verify the pack exists
    const packs = await collectionModel.getAllPacks();
    
    const packExists = packs.some(pack => pack.pack_id === packId);
    
    if (!packExists) {
      return { success: false, notFound: true, error: 'Pack not found' };
    }
    
    // Verify the collection exists (without checking specific type)
    const collections = await pool.execute(
      `SELECT collection_id FROM collections WHERE collection_id = ?`,
      [collectionId]
    );
    
    if (!collections[0] || (collections[0] as any[]).length === 0) {
      return { success: false, notFound: true, error: 'Collection not found' };
    }
    
    const affectedRows = await collectionModel.addCollectionToPack(packId, collectionId);
    
    if (affectedRows === 0) {
      return { success: false, error: 'Failed to add collection to pack' };
    }
    
    return { success: true };
  } catch (error) {
    console.error(`Service error adding collection ${collectionId} to pack ${packId}:`, error);
    return { success: false, error: 'Failed to add collection to pack' };
  }
};

export async function getPackCollections(packId: number): Promise<ServiceResponse<any[]>> {
  try {
    // Verify the pack exists
    const packs = await collectionModel.getAllPacks();
    const packExists = packs.some(pack => pack.pack_id === packId);
    
    if (!packExists) {
      return { success: false, notFound: true, error: 'Pack not found' };
    }
    
    const collections = await collectionModel.getPackCollections(packId);
    return { success: true, data: collections };
  } catch (error) {
    console.error(`Service error getting collections for pack ${packId}:`, error);
    return { success: false, error: 'Failed to retrieve pack collections' };
  }
}

export async function addMacroToCollection(
  collectionId: number,
  macroId: number,
  position: number | null = null
): Promise<ServiceResponse<void>> {
  try {
    // Check if collection exists and is of sfx type
    const collectionResponse = await getCollectionById('sfx', collectionId);
    if (!collectionResponse.success) {
      return { success: false, notFound: true, error: 'SFX collection not found' };
    }
    
    // Check if macro exists
    const macroResponse = await getCollectionById('macro', macroId);
    if (!macroResponse.success) {
      return { success: false, notFound: true, error: 'Macro not found' };
    }
    
    const affectedRows = await collectionModel.addMacroToCollection(collectionId, macroId, position);
    
    if (affectedRows === 0) {
      return { success: false, error: 'Failed to add macro to SFX collection' };
    } else if (affectedRows === -1) {
      return { success: false, error: 'Macro already exists in this collection' };
    }
    
    return { success: true };
  } catch (error) {
    console.error(`Service error adding macro ${macroId} to SFX collection ${collectionId}:`, error);
    return { success: false, error: 'Failed to add macro to SFX collection' };
  }
}

export async function addMacrosToCollection(
  collectionId: number,
  macroIds: number[],
  startPosition: number | null = null
): Promise<ServiceResponse<void>> {
  try {
    if (!macroIds || macroIds.length === 0) {
      return { success: false, error: 'No macros specified' };
    }
    
    // Check if collection exists and is of sfx type
    const collectionResponse = await getCollectionById('sfx', collectionId);
    if (!collectionResponse.success) {
      return { success: false, notFound: true, error: 'SFX collection not found' };
    }
    
    // Check if all macros exist
    for (const macroId of macroIds) {
      const macroResponse = await getCollectionById('macro', macroId);
      if (!macroResponse.success) {
        return { success: false, notFound: true, error: `Macro ${macroId} not found` };
      }
    }
    
    const affectedRows = await collectionModel.addMacrosToCollection(collectionId, macroIds, startPosition);
    
    if (affectedRows === 0) {
      return { success: false, error: 'Failed to add macros to SFX collection' };
    }
    
    return { success: true };
  } catch (error) {
    console.error(`Service error adding macros to SFX collection ${collectionId}:`, error);
    return { success: false, error: 'Failed to add macros to SFX collection' };
  }
}

export async function getAllCollectionsWithFiles(type: string): Promise<ServiceResponse<any[]>> {
  try {
    let collections;
    if (type === 'macro') {
      collections = await macroModel.getAllMacros();
    } else {
      collections = await collectionModel.getAllCollections(type);
    }
    
    // For each collection, fetch its files
    const collectionsWithFiles = await Promise.all(
      collections.map(async (collection: any) => {
        let result;
        if (type === 'macro') {
          const files = await macroModel.getMacroFiles(collection.collection_id);
          result = { files, macros: [] };
        } else {
          result = await collectionModel.getCollectionFiles(type, collection.collection_id);
        }
        
        return {
          ...collection,
          files: result.files,
          macros: result.macros || []
        };
      })
    );
    
    return { success: true, data: collectionsWithFiles };
  } catch (error) {
    console.error(`Service error getting all ${type} collections with files:`, error);
    return { success: false, error: `Failed to retrieve ${type} collections with files` };
  }
}

export async function removeMacroFromCollection(
  collectionId: number, 
  macroId: number
): Promise<ServiceResponse<void>> {
  try {
    // Check if collection exists and is of sfx type
    const collectionResponse = await getCollectionById('sfx', collectionId);
    if (!collectionResponse.success) {
      return { success: false, notFound: true, error: 'SFX collection not found' };
    }
    
    // Check if macro exists
    const macroResponse = await getCollectionById('macro', macroId);
    if (!macroResponse.success) {
      return { success: false, notFound: true, error: 'Macro not found' };
    }
    
    const affectedRows = await collectionModel.removeMacroFromCollection(collectionId, macroId);
    
    if (!affectedRows) {
      return { success: false, notFound: true, error: 'Macro not found in this collection' };
    }
    
    return { success: true };
  } catch (error) {
    console.error(`Service error removing macro ${macroId} from SFX collection ${collectionId}:`, error);
    return { success: false, error: 'Failed to remove macro from SFX collection' };
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
  removeFileFromCollection,
  updateCollectionFilePosition,
  updateFileRangePosition,
  updateFile,
  updateAudioFile,
  updateCollectionFile,
  getAllPacks,
  createPack,
  deletePack,
  addCollectionToPack,
  getPackCollections,
  addMacroToCollection,
  addMacrosToCollection,
  removeMacroFromCollection,
};