import folderService from "./folderService.js";
import { Request, Response } from 'express';

export const getAllFolders = async (_req: Request, res: Response) => {
  try {
    const folders = await folderService.getAllFolders();
    res.status(200).json(folders);
  } catch (error) {
    console.error('Error getting folders:', error);
    res.status(500).json({ error: 'Failed to retrieve folders' });
  }
};

export const getFolderById = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid folder ID format' });
    }

    const folder = await folderService.getFolderById(id);
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    res.status(200).json(folder);
  } catch (error) {
    console.error('Error getting folder by ID:', error);
    res.status(500).json({ error: 'Failed to retrieve folder' });
  }
};

export const getFoldersByType = async (req: Request, res: Response) => {
  try {
    const folderType = req.params.type;
    if (!folderType) {
      return res.status(400).json({ error: 'Folder type is required' });
    }

    const folders = await folderService.getFoldersByType(folderType);
    res.status(200).json(folders);
  } catch (error) {
    console.error('Error getting folders by type:', error);
    res.status(500).json({ error: 'Failed to retrieve folders' });
  }
};

export const getSubFolders = async (req: Request, res: Response) => {
  try {
    const parentId = parseInt(req.params.parentId);
    if (isNaN(parentId)) {
      return res.status(400).json({ error: 'Invalid parent folder ID format' });
    }

    const folders = await folderService.getSubFolders(parentId);
    res.status(200).json(folders);
  } catch (error) {
    console.error('Error getting subfolders:', error);
    res.status(500).json({ error: 'Failed to retrieve subfolders' });
  }
};

export default {
  getAllFolders,
  getFolderById,
  getFoldersByType,
  getSubFolders
};
