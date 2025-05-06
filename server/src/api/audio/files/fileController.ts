import fileService from "./fileService.js";
import { Request, Response } from "express";
import { scanAudioFiles } from "../../../utils/file-scanner.js";
import { transformAudioFile } from "../../../utils/format-transformers.js";
import fs from "fs";
import path from "path";
import { downloadAudioFile } from "src/middleware/fileDownload.js";
import { getFolderPath } from "../folders/folderModel.js";
import { FOLDERS } from '../../../constants/folders.js';

// Get all audio files
export const getAllAudioFiles = async (_req: Request, res: Response) => {
  try {
    const dbAudioFiles = await fileService.getAllAudioFiles();

    // Transform each DB record to match the frontend format
    const audioFiles = dbAudioFiles.map((file) => transformAudioFile(file));

    res.status(200).json(audioFiles);
  } catch (error) {
    console.error("Error getting all audio files:", error);
    res.status(500).json({ error: "Failed to retrieve audio files" });
  }
};

// Get audio file by ID
export const getAudioFile = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid ID format" });
    }

    const audioFile = await fileService.getAudioFile(id);
    if (!audioFile) {
      return res.status(404).json({ error: "Audio file not found" });
    }

    // Transform to frontend format
    const transformedFile = transformAudioFile(audioFile);

    res.status(200).json(transformedFile);
  } catch (error) {
    console.error("Error getting audio file by ID:", error);
    res.status(500).json({ error: "Failed to retrieve audio file" });
  }
};

// Create a new audio file
export const createAudioFile = async (req: Request, res: Response) => {
  try {
    let { name, type, file_url, folder_id } = req.body;
    
    // Set default folder ID if not provided
    folder_id = folder_id ? parseInt(folder_id) : FOLDERS.UPLOAD;
    
    // Set default type if not provided
    type = type || 'any';
    
    // Handle file upload if present
    let file_path = null;
    if (req.file) {
      // If name not provided, extract from filename (without extension)
      if (!name) {
        name = path.parse(req.file.originalname).name;
      }
      
      // Get the folder path for building the correct relative path
      const folderPath = await getFolderPath(folder_id);
      
      // Store relative path from public directory
      // If folder path was used, include it in the file_path
      if (folderPath && folderPath !== '') {
        file_path = `/audio/${folderPath}/${req.file.filename}`;
      } else {
        file_path = `/audio/${type}/${req.file.filename}`;
      }
    }

    // Use a placeholder name if still not provided
    if (!name) {
      name = `unnamed-audio-${Date.now()}`;
    }

    // At least one of file_path or file_url must be provided
    if (!file_path && !file_url) {
      return res.status(400).json({
        fields: ["file", "file_url"],
        message: "Either a file or a URL must be provided",
      });
    }

    const result = await fileService.createAudioFile(
      name,
      type,
      file_path,
      file_url || null,
      folder_id
    );

    // Get the inserted ID
    const audioFileId = result.insertId;

    // If we have a URL and no uploaded file, download and cache it
    if (file_url && !file_path && audioFileId) {
      // Start download process without waiting (async)
      downloadAudioFile(audioFileId)
        .then(() => console.log(`Successfully downloaded audio from ${file_url}`))
        .catch(err => console.error(`Error downloading audio file: ${err.message}`));
    }

    // Return the ID of the created file
    if (audioFileId) {
      res.status(201).json({ 
        id: audioFileId,
        message: "Audio file created successfully" 
      });
    } else {
      res.status(201).json({ 
        success: true, 
        message: "Audio file created successfully" 
      });
    }
  } catch (error) {
    console.error("Error creating audio file:", error);

    // If there was an uploaded file and an error occurred, delete the file
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkErr) {
        console.error(
          "Error deleting uploaded file after failed creation:",
          unlinkErr
        );
      }
    }

    res.status(500).json({ error: "Failed to create audio file" });
  }
};

// Update an audio file
export const updateAudioFile = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid ID format" });
    }

    const { name, file_path, file_url } = req.body;

    // Check if any update params provided
    if (!name && file_path === undefined && file_url === undefined) {
      return res.status(400).json({ error: "No update parameters provided" });
    }

    const response = await fileService.updateAudioFile(id, {
      name,
      file_path,
      file_url,
    });

    if (response.success) {
      res.status(200).json({ message: "Audio file updated successfully" });
    } else {
      res.status(response.notFound ? 404 : 400).json({ error: response.error });
    }
  } catch (error) {
    console.error("Error updating audio file:", error);
    res.status(500).json({ error: "Failed to update audio file" });
  }
};

export const scan = async (_req: Request, res: Response) => {
  scanAudioFiles();
  res.status(200).json({ message: "Scan initiated" });
};

export default {
  getAllAudioFiles,
  getAudioFile,
  createAudioFile,
  scan,
  updateAudioFile,
};
