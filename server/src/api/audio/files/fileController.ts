import fileService from "./fileService.js";
import { Request, Response, NextFunction } from "express";
import { syncAudioLibrary } from "../../../utils/file-scanner.js";
import { transformAudioFileToDTO } from "../../../utils/format-transformers.js";
import fs from "fs";
import path from "path";
import { downloadAudioFile } from "src/services/fileDownload/fileDownload.js";
import { getFolderPath } from "../folders/folderModel.js";
import { FOLDERS } from "../folders/constants.js";
import * as mm from "music-metadata";
import { ValidationError, NotFoundError } from "src/api/HttpErrors.js";
import { AudioType } from "shared/audio/types.js";

/**
 * Get all audio files from the database
 * @route GET /api/audio/files
 * 
 * @returns {Object[]} 200 - Array of audio file objects
 * @throws {Error} 500 - Server error
 */
export const getAllAudioFiles = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const dbAudioFiles = await fileService.getAllAudioFiles();
    const audioFiles = dbAudioFiles.map((file) =>
      transformAudioFileToDTO(file)
    );
    res.status(200).json(audioFiles);
  } catch (error) {
    next(error);
  }
};

/**
 * Get a single audio file by ID
 * @route GET /api/audio/files/{id}
 * @param {number} req.params.id - The audio file ID
 * 
 * @returns {Object} 200 - Audio file object
 * @throws {ValidationError} 400 - Invalid ID format
 * @throws {NotFoundError} 404 - Audio file not found
 */
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

/**
 * Upload audio files to the server
 * @route POST /api/audio/files
 * 
 * @param {Express.Multer.File[]} req.files - Uploaded audio files
 * @param {string} [req.body.name] - Custom name for single audio file upload
 * @param {string} [req.body.type] - Audio files type
 * @param {number|string} [req.body.folder_id] - Folder ID to store the files in
 * @param {string} [req.body.url] - URL for the audio file
 * 
 * @returns {Object} 201 
 * @throws {ValidationError} 400 - Invalid file format or URL
 */
export const uploadAudioFiles = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const { folder_id: folderIdRaw, url } = req.body;
    const folder_id = folderIdRaw ? parseInt(folderIdRaw) : FOLDERS.UPLOAD;

    // Process all files with Promise.all
    const fileDataPromises = (req.files as Express.Multer.File[]).map(
      async (file) => {
        let { name, type } = req.body;
        let rel_path: string | null = null;
        let duration: number | null = null;

        // Validate URL if provided
        if (url && !isValidAudioUrl(url)) {
          throw new ValidationError("Invalid URL");
        }

        // Process uploaded file
        if (!file.mimetype.startsWith("audio/")) {
          await fs.promises.unlink(file.path).catch(() => {});
          throw new ValidationError("Uploaded file is not a valid audio file");
        }

        // Set default values from file metadata
        type = type || getAudioType(file.mimetype);
        name = name || path.parse(file.originalname).name;

        // Extract duration from file
        const meta = await mm.parseFile(file.path);
        duration = meta.format?.duration ?? null;

        // Construct the file path
        const folderPath = await getFolderPath(folder_id);
        const segment = folderPath ? `${folderPath}` : type;
        rel_path = `${segment}/${file.filename}`;

        // Return file data object for database
        return {
          name,
          rel_path,
          url: url ?? null,
          folder_id,
          duration,
        };
      }
    );

    // Wait for all file processing to complete
    const filesData = await Promise.all(fileDataPromises);

    // Create all file entries in the database
    await fileService.insertAudioFiles(filesData);
    return res.status(201).json();

  } catch (error) {
    next(error);
  }
};

/**
 * Download audio files from URLs
 * @route POST /api/audio/files/download-urls
 * @param {Object[]} req.body.files - Array of files to download
 * @param {string} req.body.files[].name - Name of the file
 * @param {number} [req.body.files[].folder_id] - Folder ID to store the file in
 * @param {string} req.body.files[].url - URL of the audio file to download
 *
 * @returns {Object} 202 - Download jobs enqueued; returns { jobIds: string[] } 
 * @throws {ValidationError} 400 - Invalid file data, missing required fields, or invalid URL
 */
export const downloadAudioUrls = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Define type for file input
    interface AudioFileInput {
      name: string;
      url: string;
      folder_id: number;
      audio_type?: AudioType;
    }

    let filesToProcess: AudioFileInput[] = [];

    if (req.body.files) {
      if (!Array.isArray(req.body.files) || req.body.files.length === 0) {
        throw new ValidationError("files must be a non-empty array");
      }
      filesToProcess = req.body.files as AudioFileInput[];
    } else {
      throw new ValidationError("files property is required in request body");
    }

    // Validate each file entry
    for (const file of filesToProcess) {

      if (!file.folder_id) {
        file.folder_id = FOLDERS.UPLOAD;
      } else if (typeof file.folder_id === "string") {
        file.folder_id = parseInt(file.folder_id);
      }

      if (!file.url) {
        throw new ValidationError(`URL is required for file "${file.name}"`);
      }

      if (!isValidAudioUrl(file.url)) {
        throw new ValidationError(`Invalid URL for file "${file.name}"`);
      }
    }

    // Process downloads
    const jobIds: string[] = [];
    for (const file of filesToProcess) {
      try {
        const jobId = await downloadAudioFile({
          ...file,
          url: file.url,
        });
        jobIds.push(jobId);
      } catch (err) {
        console.error(
          `[DOWNLOAD AUDIO URL] Download failed for ${file.name}: ${
            err instanceof Error ? err.message : err
          }`
        );
      }
    }

    return res.status(202).json({jobIds});
  } catch (error) {
    next(error);
  }
};

/**
 * Update an existing audio file
 * @route PUT /api/audio/files/{id}
 * 
 * @param {number} req.params.id - The audio file ID to update
 * @param {string} [req.body.name] - New name for the audio file
 * @param {string} [req.body.rel_path] - New relative path for the audio file
 * @param {string} [req.body.url] - New URL for the audio file
 * 
 * @returns {Object} 200 - Updated audio file information
 * @throws {ValidationError} 400 - Invalid ID format or no update parameters
 * @throws {NotFoundError} 404 - Audio file not found
 */
export const updateAudioFile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
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

/**
 * Delete a single audio file by ID
 * @route DELETE /api/audio/files/{id}
 * @param {number} req.params.id - The audio file ID to delete
 * @returns {Object} 200 - { success: true, deletedCount: number }
 * @throws {ValidationError} 400 - Invalid ID format
 * @throws {NotFoundError} 404 - Audio file not found
 */
export const deleteAudioFile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      throw new ValidationError("Invalid ID format");
    }

    // Use the batch deletion function with a single ID
    const result = await fileService.deleteAudioFiles([id]);

    if (result.deletedCount === 0) {
      throw new NotFoundError();
    }

    res.status(200).json({
      success: true,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete multiple audio files
 * @route DELETE /api/audio/files
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next middleware function
 * @param {number[]} req.body.fileIds - Array of audio file IDs to delete
 * @returns {Object} 200 - { success: boolean, deletedCount: number, errors: string[] }
 * @throws {ValidationError} 400 - Invalid or empty fileIds array
 */
export const deleteAudioFiles = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { fileIds } = req.body;

    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      throw new ValidationError("fileIds must be a non-empty array");
    }

    // Validate that all IDs are numbers
    if (
      !fileIds.every((id) => typeof id === "number" && Number.isInteger(id))
    ) {
      throw new ValidationError("All file IDs must be integers");
    }

    const result = await fileService.deleteAudioFiles(fileIds);

    res.status(200).json({
      success: result.success,
      deletedCount: result.deletedCount,
      errors: result.errors,
    });
  } catch (error) {
    next(error);
  }
};


/**
 * Scan the file system to synchronize audio library
 * @route POST /api/audio/files/scan
 * 
 * @returns {Object} 200 - Empty response indicating successful scan
 * @throws {Error} 500 - Server error during scan
 */
export const scan = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await syncAudioLibrary();
    res.status(200).json();
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

export default {
  getAllAudioFiles,
  getAudioFile,
  uploadAudioFiles,
  downloadAudioUrls, 
  updateAudioFile,
  deleteAudioFile,
  deleteAudioFiles,
  scan,
};

