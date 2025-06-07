import fileService from "./fileService.js";
import { Request, Response, NextFunction } from "express";
import { scanAudioFiles } from "../../../utils/file-scanner.js";
import { transformAudioFileToDTO } from "../../../utils/format-transformers.js";
import fs from "fs";
import path from "path";
import { downloadAudioFile } from "src/services/fileDownload/fileDownload.js";
import { getFolderPath } from "../folders/folderModel.js";
import { FOLDERS } from "../../../constants/folders.js";
import * as mm from "music-metadata";
import { ValidationError, NotFoundError } from "src/errors/HttpErrors.js";

// Get all audio files
export const getAllAudioFiles = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const dbAudioFiles = await fileService.getAllAudioFiles();
    const audioFiles = dbAudioFiles.map((file) => transformAudioFileToDTO(file));
    res.status(200).json(audioFiles);
  } catch (error) {
    next(error);
  }
};

// Get audio file by ID
export const getAudioFile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      throw new ValidationError("Invalid ID format");
    }

    const audioFile = await fileService.getAudioFile(id);
    if (!audioFile) {
      throw new NotFoundError();
    }

    // Transform to frontend format
    const transformedFile = transformAudioFileToDTO(audioFile);
    res.status(200).json(transformedFile);

  } catch (error) {
    next(error);
  }
};

// Helper functions for validation
function isValidAudioUrl(url: string): boolean {
  try {
    // First check if it's a valid URL
    new URL(url);

    // Check if it's a known audio/video platform
    if (
      url.includes("youtube.com") ||
      url.includes("youtu.be") ||
      url.includes("soundcloud.com") ||
      url.includes("spotify.com") ||
      url.includes("bandcamp.com")
    ) {
      return true;
    }

    // Check if URL points to an audio file extension
    const audioExtensions = [".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac"];
    return audioExtensions.some((ext) => url.toLowerCase().endsWith(ext));
  } catch {
    return false;
  }
}

function getAudioType(mimeType: string | undefined): string {
  if (!mimeType) return "unknown";

  if (mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("flac")) return "flac";
  if (mimeType.includes("m4a") || mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("aac")) return "aac";

  return "audio";
}

// Create a new audio file
export const createAudioFile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Extract and normalize input parameters
    const {folder_id: folderIdRaw, url} = req.body;
    let { name, type, } = req.body;
    const folder_id = folderIdRaw ? parseInt(folderIdRaw) : FOLDERS.UPLOAD;
    let rel_path: string | null = null;
    let duration: number | null = null;

    // Validate URL if provided
    if (url && !isValidAudioUrl(url)) {
      throw new ValidationError("Invalid URL");
    }

    // Process uploaded file if present
    if (req.file) {
      // Verify audio MIME type
      if (!req.file.mimetype.startsWith("audio/")) {
        await fs.promises.unlink(req.file.path).catch(() => {});
        throw new ValidationError("Uploaded file is not a valid audio file");
      }

      // Set default values from file metadata
      type = type || getAudioType(req.file.mimetype);
      name = name || path.parse(req.file.originalname).name;
      
      // Extract duration from file
      const meta = await mm.parseFile(req.file.path);
      duration = meta.format?.duration ?? null;

      // Construct the file path
      const folderPath = await getFolderPath(folder_id);
      const segment = folderPath ? `${folderPath}` : type;
      rel_path = `/audio/${segment}/${req.file.filename}`;
    }

    // Require either a file upload or URL
    if (!req.file && !url) {
      throw new ValidationError("Either a file upload or a URL must be provided");
    }

    // Store in database
    const fileData = {
      name: name,
      rel_path,
      url: url ?? null,
      folder_id: folder_id,
      duration: duration
    };
    
    // Initiate background download for URL-only entries 
    if (url && !rel_path ) {
      const jobId = await downloadAudioFile(fileData).catch((err) =>
        console.error(`[FILE CREATION] Download failed: ${err.message}`)
      );
      // return 202 Accepted to indicate processing (download) initiated.
      return res.status(202).json({jobId});
    }
    
    const { insertId } = await fileService.createAudioFile(
      fileData
    );
    return res.status(201).json({ id: insertId });
    
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file?.path) {
      fs.unlink(req.file.path, () => {});
    }
    return next(error);
  }
};


// Update an audio file
export const updateAudioFile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      throw new ValidationError("Invalid ID format");
    }

    const { name, rel_path, url } = req.body;

    // Check if any update params provided
    if (!name && rel_path === undefined && url === undefined) {
      throw new ValidationError("No update parameters provided");
    }

    const response = await fileService.updateAudioFile(id, {
      name,
      rel_path,
      url,
    });

    res.status(200).json(response); 
  } catch (error) {
    next(error);
  }
};

// Fix scan to use next
export const scan = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await scanAudioFiles();
    res.status(200).json();
  } catch (error) {
    next(error);
  }
};

export default {
  getAllAudioFiles,
  getAudioFile,
  createAudioFile,
  scan,
  updateAudioFile,
};
