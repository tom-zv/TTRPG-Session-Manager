import fileService from "./fileService.js";
import { Request, Response } from 'express';
import { scanAudioFiles } from "../../../utils/file-scanner.js";
import fs from 'fs';

// Get all audio files
export const getAllAudioFiles = async (_req: Request, res: Response) => {
  try {
    const audioFiles = await fileService.getAllAudioFiles();
    res.status(200).json(audioFiles);
  } catch (error) {
    console.error('Error getting all audio files:', error);
    res.status(500).json({ error: 'Failed to retrieve audio files' });
  }
};

// Get audio file by ID
export const getAudioFileById = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }

    const audioFile = await fileService.getAudioFile(id);
    if (!audioFile || audioFile.length === 0) {
      return res.status(404).json({ error: 'Audio file not found' });
    }

    res.status(200).json(audioFile[0]);
  } catch (error) {
    console.error('Error getting audio file by ID:', error);
    res.status(500).json({ error: 'Failed to retrieve audio file' });
  }
};

// Create a new audio file
export const createAudioFile = async (req: Request, res: Response) => {
  try {
    const { title, type, file_url, folder_id } = req.body;
    
    // Validate required fields with specific field errors
    if (!title) {
      return res.status(400).json({ 
        fields: 'title',
        message: 'Title is required' 
      });
    }

    if (!type) {
      return res.status(400).json({ 
        fields: 'type',
        message: 'Type is required' 
      });
    }

    // Handle file upload if present
    let file_path = null; 
    if (req.file) {
      // Store relative path from public directory for easier client access
      file_path = `/audio/${type}/${req.file.filename}`;
    }

    // At least one of file_path or file_url must be provided
    if (!file_path && !file_url) {
      return res.status(400).json({ 
        fields: ['file', 'file_url'],
        message: 'Either a file or a URL must be provided'
      });
    }

    const result = await fileService.createAudioFile(
      title,
      type,
      file_path,
      file_url || null, 
      folder_id ? parseInt(folder_id) : null 
    );

    // Check if result exists and has insertId property
    if (result && typeof result.insertId !== 'undefined') {
      res.status(201).json(result.insertId);
    } else {
      // If no insertId, return a generic success response
      res.status(201).json({ success: true, message: 'Audio file created successfully' });
    }
  } catch (error) {
    console.error('Error creating audio file:', error);
    
    // If there was an uploaded file and an error occurred, delete the file
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkErr) {
        console.error('Error deleting uploaded file after failed creation:', unlinkErr);
      }
    }
    
    res.status(500).json({ error: 'Failed to create audio file' });
  }
};

export const scan = async (_req: Request, res: Response) => {
  scanAudioFiles();
  res.status(200).json({ message: 'Scan initiated' });
};

export default {
  getAllAudioFiles,
  getAudioFileById,
  createAudioFile,
  scan
};
