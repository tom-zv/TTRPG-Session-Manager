import folderService from "./folderService.js";
import { folderToDTO } from "../../../utils/format-transformers/audio-transformer.js";
import { Request, Response, NextFunction } from 'express';
import { ValidationError, NotFoundError } from "src/api/HttpErrors.js";

export const getAllFolders = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const dbFolders = await folderService.getAllFolders();
    const foldersDTO = dbFolders.map(folder => folderToDTO(folder));
    res.status(200).json(foldersDTO);
  } catch (error) {
    next(error);
  }
};

export const getFolderById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      throw new ValidationError("Invalid folder ID format");
    }

    const dbFolder = await folderService.getFolderById(id);
    
    if (!dbFolder) {
      throw new NotFoundError();
    }

    const folderDTO = folderToDTO(dbFolder);
    res.status(200).json(folderDTO);
  } catch (error) {
    next(error);
  }
};

export const getSubFolders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parentId = parseInt(req.params.parentId);
    if (isNaN(parentId)) {
      throw new ValidationError("Invalid parent folder ID format");
    }

    const dbFolders = await folderService.getSubFolders(parentId);
    const foldersDTO = dbFolders.map(folder => folderToDTO(folder));
    
    res.status(200).json(foldersDTO);
  } catch (error) {
    next(error);
  }
};

export const createFolder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, parentFolderId, folderType } = req.body;
    if (!name || typeof name !== 'string' || name.trim() === '') {
      throw new ValidationError("Folder name is required and must be a non-empty string");
    }

    if (parentFolderId !== undefined && (typeof parentFolderId !== 'number' || !Number.isInteger(parentFolderId))) {
      throw new ValidationError("Invalid parentFolderId format");
    }

    // Validate folder name for file system compatibility
    //
    // Control regex is specifically used here since it is an invalid char in fs 
    // eslint-disable-next-line no-control-regex
    const invalidChars = /[<>:"/\\|?*\x00-\x1F]/g;
    if (invalidChars.test(name)) {
      throw new ValidationError("Folder name contains invalid characters");
    }

    const validFolderTypes = ['music', 'sfx', 'ambience', 'root', 'any'];
    if (folderType !== undefined && (typeof folderType !== 'string' || !validFolderTypes.includes(folderType))) {
      throw new ValidationError(`Invalid folderType`);
    }

    const dbFolder = await folderService.createFolder(name, parentFolderId, folderType);
    if (!dbFolder) {
      throw new Error("Failed to create folder");
    }
    
    const folderDTO = folderToDTO(dbFolder);
    res.status(201).json(folderDTO);
  } catch (error) {
    // Handle specific database errors
    if (error instanceof Error && 'code' in error && error.code === 'ER_NO_REFERENCED_ROW_2') {
      next(new ValidationError("Invalid parentFolderId"));
    } 
    // Handle filesystem errors
    else if (error instanceof Error && 'code' in error) {
      const fsErrorCode = error.code;
      if (fsErrorCode === 'EEXIST') {
        next(new ValidationError("A folder with this name already exists"));
      } else {
        next(error);
      }
    } else {
      next(error);
    }
  }
};

export const deleteFolder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      throw new ValidationError("Invalid folder ID format");
    }

    const result = await folderService.deleteFolders([id]);
    
    if (result.deletedCount === 0) {
      throw new NotFoundError();
    }

    res.status(200).json({ 
      deletedCount: result.deletedCount
    });
  } catch (error) {
    next(error);
  }
};

export const deleteFolders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { folderIds } = req.body;
    
    if (!Array.isArray(folderIds) || folderIds.length === 0) {
      throw new ValidationError("folderIds must be a non-empty array");
    }
    
    // Validate that all IDs are numbers
    if (!folderIds.every(id => typeof id === 'number' && Number.isInteger(id))) {
      throw new ValidationError("All folder IDs must be integers");
    }

    const result = await folderService.deleteFolders(folderIds);
    
    res.status(200).json({ 
      success: result.success,
      deletedCount: result.deletedCount,
      errors: result.errors
    });
  } catch (error) {
    next(error);
  }
};

export const updateFolder = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { name } = req.body;

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid folder ID format' });
    }
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: 'Folder name is required and must be a non-empty string.' });
    }
    // eslint-disable-next-line no-control-regex
    const invalidChars = /[<>:"/\\|?*\x00-\x1F]/g;
    if (invalidChars.test(name)) {
      return res.status(400).json({ 
        error: 'Folder name contains invalid characters. Avoid: < > : " / \\ | ? *' 
      });
    }

    const updatedFolder = await folderService.updateFolder(id, name);
    if (!updatedFolder) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    const folderDTO = folderToDTO(updatedFolder);
    res.status(200).json(folderDTO);
  } catch (error) {
    console.error('Error updating folder:', error);
    res.status(500).json({ error: 'Failed to update folder' });
  }
};

export default {
  getAllFolders,
  getFolderById,
  getSubFolders,
  createFolder,
  deleteFolder,
  deleteFolders,
  updateFolder
};
