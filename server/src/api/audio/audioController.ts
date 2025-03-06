import audioService from "./audioService.js";
import { Request, Response } from 'express';

// Get all audio files
export const getAllAudioFiles = async (req: Request, res: Response) => {
  try {
    const audioFiles = await audioService.getAllAudioFiles();
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

    const audioFile = await audioService.getAudioFile(id);
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
    const { title, type, file_path, file_url, folder_id } = req.body;
    
    if (!title || !type) {
      return res.status(400).json({ error: 'Title and type are required' });
    }

    const result = await audioService.createAudioFile(
      title,
      type,
      file_path,
      file_url,
      folder_id
    );

    res.status(201).json({
      message: 'Audio file created successfully',
      id: result.insertId
    });
  } catch (error) {
    console.error('Error creating audio file:', error);
    res.status(500).json({ error: 'Failed to create audio file' });
  }
};

