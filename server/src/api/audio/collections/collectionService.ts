import collectionModel from './collectionModel.js';
import { pool } from "src/db.js";

// Interface for standardized service responses
export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  notFound?: boolean;
}

export async function getAllCollections(type: string): Promise<ServiceResponse<any[]>> {
  try {
    const collections = await collectionModel.getAllCollections(type);
    return { success: true, data: collections };
  } catch (error) {
    console.error(`Service error getting all ${type} collections:`, error);
    return { success: false, error: `Failed to retrieve ${type} collections` };
  }
}

export async function getCollectionById(type: string, id: number): Promise<ServiceResponse<any>> {
  try {
    const collections = await collectionModel.getCollectionById(type, id);
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
    
    const result = await collectionModel.getCollectionFiles(type, id);
    
    return {
      success: true,
      data: {
        ...collectionResponse.data,
        files: result.files,
        macros: result.macros
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
    
    const insertId = await collectionModel.createCollection(type, name, description);
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
  name: string, 
  description: string | null
): Promise<ServiceResponse<any>> {
  try {
    if (!name) {
      return { success: false, error: 'Collection name is required' };
    }
    
    const collectionResponse = await getCollectionById(type, id);
    if (!collectionResponse.success) {
      return collectionResponse;
    }
    
    const affectedRows = await collectionModel.updateCollection(type, id, name, description);
    if (!affectedRows) {
      return { success: false, error: `Failed to update ${type} collection` };
    }
    
    const updatedCollectionResponse = await getCollectionById(type, id);
    return { success: true, data: updatedCollectionResponse.data };
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
    
    const affectedRows = await collectionModel.deleteCollection(type, id);
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
  position: number | null = null
): Promise<ServiceResponse<void>> {
  try {
    const affectedRows = await collectionModel.addFileToCollection(type, collectionId, audioFileId, position);
    
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
    
    const affectedRows = await collectionModel.addFilesToCollection(type, collectionId, audioFileIds, startPosition);
    
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
    const affectedRows = await collectionModel.removeFileFromCollection(type, collectionId, audioFileId);
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

export default {
  getAllCollections,
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
  getAllPacks,
  createPack,
  deletePack,
  addCollectionToPack,
  getPackCollections
};