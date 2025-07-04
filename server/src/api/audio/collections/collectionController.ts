import { Request, Response } from 'express';
import collectionService from './collectionService.js';
import fileService from '../files/fileService.js';
import { transformAudioFileToDTO, transformCollection, transformMacro } from 'src/utils/format-transformers.js';

const collectionTypes = ['playlist', 'sfx', 'ambience', 'macro'];

export const getAllCollections = async (req: Request, res: Response) => {
  const type = req.params.type;
  const includeFiles = req.query.includeFiles === 'true';
  // Validate collection type
  if (!collectionTypes.includes(type)) {
    return res.status(400).json({ error: 'Invalid collection type' });
  }
  
  try {
    let response;
    
    if (includeFiles) {
      response = await collectionService.getAllCollectionsWithFiles(type);
      if (response.success) {
        // Transform the collections with their items
        response.data = response.data ? response.data.map((collection) => {
          const baseCollection = transformCollection(collection);
          
          if (type !== 'sfx') {
            // For regular collections, just transform files
            baseCollection.items = collection.files.map(transformAudioFileToDTO);
          } else {
            // For SFX collections, combine files and macros into a unified items array
            const fileItems = collection.files.map(transformAudioFileToDTO);
            const macroItems = collection.macros.map(transformMacro);
            
            // Combine and sort by position
            baseCollection.items = [...fileItems, ...macroItems].sort((a, b) => a.position - b.position);
          }
          
          return baseCollection;
        }) : [];
      }
    } else {
      response = await collectionService.getAllCollections(type);
      if (response.success) {
        response.data = response.data ? response.data.map(transformCollection) : [];
      }
    }

    if (response.success) {
      res.status(200).json(response.data);
    } else {
      res.status(500).json({ error: response.error });
    }
  } catch (error) {
    console.error(`Error getting ${type} collections:`, error);
    res.status(500).json({ error: `Failed to retrieve ${type} collections` });
  }
};

export const getAllCollectionsAllTypes = async (_req: Request, res: Response) => {
  try {
    const response = await collectionService.getAllCollectionsAllTypes();

    if (response.success) {
      response.data = response.data ? response.data.map(transformCollection) : [];
      res.status(200).json(response.data);
    } else {
      res.status(500).json({ error: response.error });
    }
  } catch (error) {
    console.error('Error getting all collections:', error);
    res.status(500).json({ error: 'Failed to retrieve collections' });
  }
};

export const getCollectionById = async (req: Request, res: Response) => {
  const type = req.params.type;
  const id = parseInt(req.params.id);
  
  //console.log(`controller: Getting ${type} collection with ID: ${id}`);

  // Validate collection type
  if (!collectionTypes.includes(type)) {
    return res.status(400).json({ error: 'Invalid collection type' });
  }
  
  if (isNaN(id)) {
    return res.status(400).json({ error: `Invalid ${type} collection ID` });
  }
  
  try {
    const includeFiles = req.query.includeFiles === 'true';
    let response;
    
    if (includeFiles) {
      response = await collectionService.getCollectionWithFiles(type, id);
      
      if (response.success) {
        // For regular collections, just transform files
        if (type !== 'sfx') {
          response.data.items = response.data.files.map(transformAudioFileToDTO);
        } 
        // For SFX collections, combine files and macros into a unified items array
        else {
          const fileItems = response.data.files.map(transformAudioFileToDTO);
          const macroItems = response.data.macros.map(transformMacro);
          
          // Combine and sort by position
          response.data.items = [...fileItems, ...macroItems].sort((a, b) => a.position - b.position);
          
          //console.log("controller: SFX collection items:", response.data.items);
        }
        // Remove the separate arrays since we now have a unified items array
        delete response.data.files;
        delete response.data.macros;
    
        response.data.id = response.data.collection_id; 
        delete response.data.collection_id;
      }
    } else {
      response = await collectionService.getCollectionById(type, id);
    }
    
    //console.log("Controller: getCollectionById for type: ", type, " response.data: ", response.data);

    if (response.success) {
      res.status(200).json(response.data);
    } else if (response.notFound) {
      res.status(404).json({ error: response.error });
    } else {
      res.status(500).json({ error: response.error });
    }
  } catch (error) {
    console.error(`Error getting ${type} collection ${id}:`, error);
    res.status(500).json({ error: `Failed to retrieve ${type} collection` });
  }
};

export const createCollection = async (req: Request, res: Response) => {
  const type = req.params.type;
  const { name, description } = req.body;
  
  // Validate collection type
  if (!collectionTypes.includes(type)) {
    return res.status(400).json({ error: 'Invalid collection type' });
  }
  
  if (!name) {
    return res.status(400).json({ 
      field: 'name',
      error: 'Collection name is required' 
    });
  }
  
  try {
    const response = await collectionService.createCollection(type, name, description || null);
    
    if (response.success) {
      res.status(201).json(response.data);
    } else {
      res.status(400).json({ error: response.error });
    }
  } catch (error) {
    console.error(`Error creating ${type} collection:`, error);
    res.status(500).json({ error: `Failed to create ${type} collection` });
  }
};

export const updateCollection = async (req: Request, res: Response) => {
  const type = req.params.type;
  const id = parseInt(req.params.id);
  const { name, description, volume } = req.body; 

  if (!collectionTypes.includes(type)) {
    return res.status(400).json({ error: 'Invalid collection type' });
  }
  if (isNaN(id)) {
    return res.status(400).json({ error: `Invalid ${type} collection ID` });
  }

  // All fields are now optional, but at least one must be provided
  if (
    name === undefined &&
    description === undefined &&
    volume === undefined
  ) {
    return res.status(400).json({ error: 'No update parameters provided' });
  }

  if (type === 'macro' && volume !== undefined && (typeof volume !== 'number' || volume < 0 || volume > 1)) {
    return res.status(400).json({ field: 'volume', error: 'Volume must be a number between 0 and 1' });
  }

  try {
    const response = await collectionService.updateCollection(type, id, name, description, volume);
    if (response.success) {
      res.status(200).json({ message: `${type} collection updated successfully` });
    } else if (response.notFound) {
      res.status(404).json({ error: response.error });
    } else {
      res.status(400).json({ error: response.error });
    }
  } catch (error) {
    console.error(`Error updating ${type} collection ${id}:`, error);
    res.status(500).json({ error: `Failed to update ${type} collection` });
  }
};

export const deleteCollection = async (req: Request, res: Response) => {
  const type = req.params.type;
  const id = parseInt(req.params.id);
  
  // Validate collection type
  if (!collectionTypes.includes(type)) {
    return res.status(400).json({ error: 'Invalid collection type' });
  }
  
  if (isNaN(id)) {
    return res.status(400).json({ error: `Invalid ${type} collection ID` });
  }
  
  try {
    const response = await collectionService.deleteCollection(type, id);
    
    if (response.success) {
      res.status(200).json({ message: `${type} collection deleted successfully` });
    } else if (response.notFound) {
      res.status(404).json({ error: response.error });
    } else {
      res.status(500).json({ error: response.error });
    }
  } catch (error) {
    console.error(`Error deleting ${type} collection ${id}:`, error);
    res.status(500).json({ error: `Failed to delete ${type} collection` });
  }
};


/* Collection file management endpoints 
 ****************************************/

export const addFileToCollection = async (req: Request, res: Response) => {
  const type = req.params.type;
  const collectionId = parseInt(req.params.id);
  const { audioFileId, position, delay } = req.body;
  
  // Validate collection type
  if (!collectionTypes.includes(type)) {
    return res.status(400).json({ error: 'Invalid collection type' });
  }
  
  if (isNaN(collectionId) || !audioFileId) {
    return res.status(400).json({ error: `Invalid ${type} collection ID or audio file ID` });
  }
  
  try {
    // Check if collection exists
    const collectionResponse = await collectionService.getCollectionById(type, collectionId);
    if (!collectionResponse.success) {
      return res.status(404).json({ error: `${type} collection not found` });
    }
    
    // Check if audio file exists
    const audioFile = await fileService.getAudioFile(audioFileId);
    if (!audioFile) {
      return res.status(404).json({ error: 'Audio file not found' });
    }
    
    const response = await collectionService.addFileToCollection(type, collectionId, audioFileId, position, delay);
    
    if (response.success) {
      res.status(201).json({ message: `Audio file added to ${type} collection` });
    } else {
      res.status(500).json({ error: response.error });
    }
  } catch (error) {
    console.error(`Error adding file to ${type} collection ${collectionId}:`, error);
    res.status(500).json({ error: `Failed to add file to ${type} collection` });
  }
};

export const addFilesToCollection = async (req: Request, res: Response) => {
  const type = req.params.type;
  const collectionId = parseInt(req.params.id);
  const { audioFileIds, startPosition } = req.body;
  
  // Validate collection type
  if (!collectionTypes.includes(type)) {
    return res.status(400).json({ error: 'Invalid collection type' });
  }
  
  if (isNaN(collectionId) || !Array.isArray(audioFileIds) || audioFileIds.length === 0) {
    return res.status(400).json({ error: `Invalid ${type} collection ID or audio file IDs` });
  }
  
  try {
    // Check if collection exists
    const collectionResponse = await collectionService.getCollectionById(type, collectionId);
    if (!collectionResponse.success) {
      return res.status(404).json({ error: `${type} collection not found` });
    }
    
    const response = await collectionService.addFilesToCollection(
      type, 
      collectionId, 
      audioFileIds, 
      startPosition !== undefined ? startPosition : null
    );
    
    if (response.success) {
      res.status(201).json({ message: `Added ${audioFileIds.length} files to ${type} collection` });
    } else {
      res.status(500).json({ error: response.error });
    }
  } catch (error) {
    console.error(`Error adding files to ${type} collection ${collectionId}:`, error);
    res.status(500).json({ error: `Failed to add files to ${type} collection` });
  }
};

export const removeFileFromCollection = async (req: Request, res: Response) => {
  const type = req.params.type;
  const collectionId = parseInt(req.params.id);
  const audioFileId = parseInt(req.params.fileId);
  
  // Validate collection type
  if (!collectionTypes.includes(type)) {
    return res.status(400).json({ error: 'Invalid collection type' });
  }
  
  if (isNaN(collectionId) || isNaN(audioFileId)) {
    return res.status(400).json({ error: `Invalid ${type} collection ID or audio file ID` });
  }
  
  try {
    const response = await collectionService.removeFileFromCollection(type, collectionId, audioFileId);
    
    if (response.success) {
      res.status(200).json({ message: `Audio file removed from ${type} collection` });
    } else if (response.notFound) {
      res.status(404).json({ error: response.error });
    } else {
      res.status(500).json({ error: response.error });
    }
  } catch (error) {
    console.error(`Error removing file from ${type} collection ${collectionId}:`, error);
    res.status(500).json({ error: `Failed to remove file from ${type} collection` });
  }
};

export const updateCollectionFilePosition = async (req: Request, res: Response) => {
  const type = req.params.type;
  const collectionId = parseInt(req.params.id);
  const audioFileId = parseInt(req.params.fileId);
  const { targetPosition } = req.body;

  // Validate collection type
  if (!collectionTypes.includes(type)) {
    return res.status(400).json({ error: 'Invalid collection type' });
  }
  
  if (isNaN(collectionId) || isNaN(audioFileId)) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }
  
  try {
    const response = await collectionService.updateCollectionFilePosition(
      type, collectionId, audioFileId, targetPosition
    );
    
    if (response.success) {
      res.status(200).json({ message: `Position updated successfully in ${type} collection` });
    } else if (response.notFound) {
      res.status(404).json({ error: response.error });
    } else {
      res.status(400).json({ error: response.error });
    }
  } catch (error) {
    console.error(`Error updating file position in ${type} collection ${collectionId}:`, error);
    res.status(500).json({ error: `Failed to update file position in ${type} collection` });
  }
};

export const updateFileRangePosition = async (req: Request, res: Response) => {
  const type = req.params.type;
  const collectionId = parseInt(req.params.id);
  const { sourceStartPosition, sourceEndPosition, targetPosition } = req.body;
  
  // Validate collection type
  if (!collectionTypes.includes(type)) {
    return res.status(400).json({ error: 'Invalid collection type' });
  }
  
  if (isNaN(collectionId)) {
    return res.status(400).json({ error: `Invalid ${type} collection ID` });
  }
  
  if (
    typeof sourceStartPosition !== 'number' || 
    typeof sourceEndPosition !== 'number' || 
    typeof targetPosition !== 'number'
  ) {
    return res.status(400).json({ error: 'Invalid position parameters' });
  }
  
  try {
    const response = await collectionService.updateFileRangePosition(
      type,
      collectionId,
      sourceStartPosition,
      sourceEndPosition,
      targetPosition
    );
    
    if (response.success) {
      res.status(200).json({ message: `${type} collection items moved successfully` });
    } else if (response.notFound) {
      res.status(404).json({ error: response.error });
    } else {
      res.status(400).json({ error: response.error });
    }
  } catch (error) {
    console.error(`Error moving files in ${type} collection ${collectionId}:`, error);
    res.status(500).json({ error: `Failed to move files in ${type} collection` });
  }
};

export const updateFile = async (req: Request, res: Response) => {
  const type = req.params.type;
  const collectionId = parseInt(req.params.id);
  const audioFileId = parseInt(req.params.fileId);
  
  const { active, volume, delay } = req.body;

  if (isNaN(collectionId) || isNaN(audioFileId)) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  // Collect only collection‐file parameters
  const collectionFileParams: {active?: boolean, volume?: number, delay?: number} = {};
  if (active !== undefined) collectionFileParams.active = active;
  if (volume !== undefined) collectionFileParams.volume = volume;
  if (delay !== undefined && type === 'macro') collectionFileParams.delay = delay;

  if (Object.keys(collectionFileParams).length === 0) {
    return res.status(400).json({ error: 'No update parameters provided' });
  }

  try {
    const response = await collectionService.updateCollectionFile(
      type,
      collectionId,
      audioFileId,
      collectionFileParams
    );

    if (response.success) {
      return res.status(200).json({
        message: `File updated successfully in ${type} collection`
      });
    } else if (response.notFound) {
      return res.status(404).json({ error: response.error });
    } else {
      return res.status(400).json({ error: response.error });
    }
  } catch (error) {
    console.error(`Error updating file in ${type} collection ${collectionId}:`, error);
    return res.status(500).json({
      error: `Failed to update file in ${type} collection`
    });
  }
};

export const addMacroToCollection = async (req: Request, res: Response) => {
  const collectionId = parseInt(req.params.id);
  const { macroId, position } = req.body;
  
  if (isNaN(collectionId) || !macroId) {
    return res.status(400).json({ error: 'Invalid collection ID or macro ID' });
  }
  
  try {
    const response = await collectionService.addMacroToCollection(
      collectionId,
      macroId,
      position !== undefined ? position : null
    );
    
    if (response.success) {
      res.status(201).json({ 
        message: 'Macro added to SFX collection',
        macro_id: macroId 
      });
    } else if (response.notFound) {
      res.status(404).json({ error: response.error });
    } else {
      res.status(400).json({ error: response.error });
    }
  } catch (error) {
    console.error(`Error adding macro to SFX collection ${collectionId}:`, error);
    res.status(500).json({ error: 'Failed to add macro to SFX collection' });
  }
};

export const addMacrosToCollection = async (req: Request, res: Response) => {
  const collectionId = parseInt(req.params.id);
  const { macroIds, startPosition } = req.body;
  
  if (isNaN(collectionId) || !Array.isArray(macroIds) || macroIds.length === 0) {
    return res.status(400).json({ error: 'Invalid collection ID or macro IDs' });
  }
  
  try {
    const response = await collectionService.addMacrosToCollection(
      collectionId,
      macroIds,
      startPosition !== undefined ? startPosition : null
    );
    
    if (response.success) {
      res.status(201).json({ 
        message: `Added ${macroIds.length} macros to SFX collection` 
      });
    } else if (response.notFound) {
      res.status(404).json({ error: response.error });
    } else {
      res.status(400).json({ error: response.error });
    }
  } catch (error) {
    console.error(`Error adding macros to SFX collection ${collectionId}:`, error);
    res.status(500).json({ error: 'Failed to add macros to SFX collection' });
  }
};

export const deleteMacroFromCollection = async (req: Request, res: Response) => {
  const collectionId = parseInt(req.params.id);
  const macroId = parseInt(req.params.macroId);
  
  if (isNaN(collectionId) || isNaN(macroId)) {
    return res.status(400).json({ error: 'Invalid collection ID or macro ID' });
  }
  
  try {
    const response = await collectionService.removeMacroFromCollection(collectionId, macroId);
    
    if (response.success) {
      res.status(200).json({ message: 'Macro removed from SFX collection successfully' });
    } else if (response.notFound) {
      res.status(404).json({ error: response.error });
    } else {
      res.status(500).json({ error: response.error });
    }
  } catch (error) {
    console.error(`Error removing macro ${macroId} from SFX collection ${collectionId}:`, error);
    res.status(500).json({ error: 'Failed to remove macro from SFX collection' });
  }
};

/* Pack endpoints
 ******************/
export const getAllPacks = async (_req: Request, res: Response) => {
  try {
    const response = await collectionService.getAllPacks();

    ///console.log('Controller: getAllPacks response:', response);

    if (response.success) {
      res.status(200).json(response.data);
    } else {
      res.status(500).json({ error: response.error });
    }
  } catch (error) {
    console.error('Error getting all packs:', error);
    res.status(500).json({ error: 'Failed to retrieve packs' });
  }
};

export const createPack = async (req: Request, res: Response) => {
  const { name, description } = req.body;
  
  if (!name) {
    return res.status(400).json({ 
      field: 'name',
      error: 'Pack name is required' 
    });
  }
  
  try {
    const response = await collectionService.createPack(name, description || null);
    
    if (response.success) {
      res.status(201).json(response.data);
    } else {
      res.status(400).json({ error: response.error });
    }
  } catch (error) {
    console.error('Error creating pack:', error);
    res.status(500).json({ error: 'Failed to create pack' });
  }
};

export const deletePack = async (req: Request, res: Response) => {
  const packId = parseInt(req.params.id);
  
  if (isNaN(packId)) {
    return res.status(400).json({ error: 'Invalid pack ID' });
  }
  
  try {
    const response = await collectionService.deletePack(packId);
    
    if (response.success) {
      res.status(200).json({ message: 'Pack deleted successfully' });
    } else if (response.notFound) {
      res.status(404).json({ error: response.error });
    } else {
      res.status(500).json({ error: response.error });
    }
  } catch (error) {
    console.error(`Error deleting pack ${packId}:`, error);
    res.status(500).json({ error: 'Failed to delete pack' });
  }
};

export const addCollectionToPack = async (req: Request, res: Response) => {
  const packId = parseInt(req.params.id);
  const { collectionId } = req.body;
  
  if (isNaN(packId) || !collectionId) {
    return res.status(400).json({ error: 'Invalid pack ID or collection ID' });
  }
  
  try {
    const response = await collectionService.addCollectionToPack(
      packId, 
      collectionId 
    );
    
    if (response.success) {
      res.status(201).json({ message: 'Collection added to pack successfully' });
    } else if (response.notFound) {
      res.status(404).json({ error: response.error });
    } else {
      res.status(500).json({ error: response.error });
    }
  } catch (error) {
    console.error(`Error adding collection ${collectionId} to pack ${packId}:`, error);
    res.status(500).json({ error: 'Failed to add collection to pack' });
  }
};

export const getPackCollections = async (req: Request, res: Response) => {
  const packId = parseInt(req.params.id);
  
  if (isNaN(packId)) {
    return res.status(400).json({ error: 'Invalid pack ID' });
  }
  
  try {
    const response = await collectionService.getPackCollections(packId);
    
    if (response.success) {
      res.status(200).json(response.data);
    } else if (response.notFound) {
      res.status(404).json({ error: response.error });
    } else {
      res.status(500).json({ error: response.error });
    }
  } catch (error) {
    console.error(`Error getting collections for pack ${packId}:`, error);
    res.status(500).json({ error: 'Failed to retrieve pack collections' });
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
  deleteMacroFromCollection,
  getAllPacks,
  createPack,
  deletePack,
  addCollectionToPack,
  getPackCollections
};