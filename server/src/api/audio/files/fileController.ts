import fileService from "./fileService.js";
import { Request, Response } from "express";
import { scanAudioFiles } from "../../../utils/file-scanner.js";
import { transformAudioFile } from "../../../utils/format-transformers.js";
import fs from "fs";
import path from "path";
import { downloadAudioFile } from "src/middleware/fileDownload.js";
import { getFolderPath } from "../folders/folderModel.js";
import { FOLDERS } from '../../../constants/folders.js';
import * as mm from 'music-metadata';

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

// Helper functions for validation
function isValidAudioUrl(url: string): boolean {
  try {
    // First check if it's a valid URL
    new URL(url);
    
    // Check if it's a known audio/video platform
    if (
      url.includes('youtube.com') || 
      url.includes('youtu.be') || 
      url.includes('soundcloud.com') ||
      url.includes('spotify.com') ||
      url.includes('bandcamp.com')
    ) {
      return true;
    }
    
    // Check if URL points to an audio file extension
    const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'];
    return audioExtensions.some(ext => url.toLowerCase().endsWith(ext));
  } catch {
    return false;
  }
}

function getAudioType(mimeType: string | undefined): string {
  if (!mimeType) return 'unknown';
  
  if (mimeType.includes('mp3')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('flac')) return 'flac';
  if (mimeType.includes('m4a') || mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('aac')) return 'aac';
  
  return 'audio';
}

// Create a new audio file
export const createAudioFile = async (req: Request, res: Response) => {
  console.log(`[FILE CREATION] Starting audio file creation process`);
  try {
    let { name, type, folder_id } = req.body;
    const { file_url } = req.body;

    console.log(`[FILE CREATION] Request data - Name: ${name}, Type: ${type}, URL: ${file_url}, Folder: ${folder_id}`);
    console.log(`[FILE CREATION] File upload present: ${req.file ? 'Yes' : 'No'}`);
    
    // Set default folder ID if not provided
    folder_id = folder_id ? parseInt(folder_id) : FOLDERS.UPLOAD;
    console.log(`[FILE CREATION] Using folder ID: ${folder_id}`);
    
    // Validate file URL if provided
    if (file_url) {
      console.log(`[FILE CREATION] Validating URL: ${file_url}`);
      if (!isValidAudioUrl(file_url)) {
        console.log(`[FILE CREATION] Invalid URL format: ${file_url}`);
        return res.status(400).json({
          success: false,
          message: "Invalid audio URL format or unsupported audio source",
          field: "file_url"
        });
      }
    }
    
    // Handle file upload if present
    let file_path = null;
    let duration = null;

    if (req.file) {
      console.log(`[FILE CREATION] Processing uploaded file: ${req.file.originalname} (${req.file.mimetype}, ${req.file.size} bytes)`);
      
      // Validate file MIME type
      if (!req.file.mimetype.startsWith('audio/')) {
        console.log(`[FILE CREATION] Invalid file type rejected: ${req.file.mimetype}`);
        // Clean up the invalid file
        try {
          fs.unlinkSync(req.file.path);
          console.log(`[FILE CREATION] Cleaned up invalid file: ${req.file.path}`);
        } catch (err) {
          console.error("[FILE CREATION] Error removing invalid file:", err);
        }
        
        return res.status(400).json({
          success: false,
          message: "Uploaded file is not a valid audio file",
          field: "audioFile"
        });
      }
      
      // If type not provided, determine from mimetype
      if (!type) {
        type = getAudioType(req.file.mimetype);
      }
      
      // If name not provided, extract from filename (without extension)
      if (!name) {
        name = path.parse(req.file.originalname).name;
      }
      
      // Extract audio metadata including duration
      try {
        console.log(`[FILE CREATION] Extracting audio metadata from: ${req.file.path}`);
        const metadata = await mm.parseFile(req.file.path);
        
        if (metadata && metadata.format && metadata.format.duration) {
          duration = metadata.format.duration;
          console.log(`[FILE CREATION] Extracted duration: ${duration} seconds`);
        } else {
          console.log(`[FILE CREATION] No duration found in metadata`);
        }
      } catch (metadataErr) {
        console.error(`[FILE CREATION] Error extracting metadata:`, metadataErr);
        // Continue without duration if extraction fails
      }
      
      // Get the folder path for building the correct relative path
      const folderPath = await getFolderPath(folder_id);
      console.log(`[FILE CREATION] Using folder path: ${folderPath || 'default'}`);
      
      // Store relative path from public directory
      // If folder path was used, include it in the file_path
      if (folderPath && folderPath !== '') {
        file_path = `/audio/${folderPath}/${req.file.filename}`;
      } else {
        file_path = `/audio/${type}/${req.file.filename}`;
      }
      console.log(`[FILE CREATION] File saved with path: ${file_path}`);
    } else {
      // Set default type if not provided
      type = type || 'any';
    }

    // At least one of file_path or file_url must be provided
    if (!file_path && !file_url) {
      console.log(`[FILE CREATION] Error: Neither file nor URL provided`);
      return res.status(400).json({
        success: false,
        message: "Either a file or a URL must be provided",
        fields: ["file", "file_url"]
      });
    }

    console.log(`[FILE CREATION] Creating DB record - Name: ${name || 'null'}, Type: ${type}, Path: ${file_path}, URL: ${file_url || 'none'}, Duration: ${duration || 'null'}`);
    const result = await fileService.createAudioFile(
      name,
      type,
      file_path,
      file_url || null,
      folder_id,
      duration
    );

    // Get the inserted ID
    const audioFileId = result.insertId;
    console.log(`[FILE CREATION] DB record created with ID: ${audioFileId}`);

    // If we have a URL and no uploaded file, download and cache it
    if (file_url && !file_path && audioFileId) {
      console.log(`[FILE CREATION] Initiating async download for URL: ${file_url}`);
      // Start download process without waiting (async)
      downloadAudioFile(audioFileId)
        .then(() => console.log(`[FILE CREATION] Successfully downloaded audio from ${file_url}`))
        .catch(err => console.error(`[FILE CREATION] Error downloading audio file: ${err.message}`));
    }

    console.log(`[FILE CREATION] Audio file creation completed successfully`);
    // Return a consistent response structure
    res.status(201).json({ 
      success: true, 
      message: "Audio file created successfully",
      data: {
        id: audioFileId || null
      }
    });
  } catch (error) {
    console.error("[FILE CREATION] Error creating audio file:", error);

    // If there was an uploaded file and an error occurred, delete the file
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
        console.log(`[FILE CREATION] Cleaned up uploaded file after error: ${req.file.path}`);
      } catch (unlinkErr) {
        console.error(
          "[FILE CREATION] Error deleting uploaded file after failed creation:",
          unlinkErr
        );
      }
    }

    res.status(500).json({ 
      success: false,
      message: "Failed to create audio file" 
    });
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
