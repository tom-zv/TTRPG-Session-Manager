import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { rootDir } from '../config/server-config.js';
import { getFolderPath } from '../api/audio/folders/folderModel.js';
import { FOLDERS } from '../constants/folders.js';

/**
 * Creates a multer middleware for file uploads
 * @param uploadPath - The relative path from the base directory where files will be stored
 * @param fileTypes - Array of MIME type prefixes to accept (e.g., ['audio/', 'image/'])
 * @param maxSize - Maximum file size in bytes (default: 1GB)
 * @returns Multer middleware
 */
export function createUploadMiddleware(
  uploadPath: string,
  fileTypes: string[] = ['audio/'],
  maxSize: number = 1024 * 1024 * 1024
) {
  // Use the rootDir from server-config
  const uploadDir = path.join(rootDir, uploadPath);

  // Ensure the upload directory exists
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // Configure storage
  const storage = multer.diskStorage({
    destination: async (req, _file, cb) => {
      try {
        // Use dynamic subdirectory based on folder_id if provided
        let targetDir = uploadDir;
        
        // Extract folder_id from request body or use default
        const folderId = req.body && req.body.folder_id 
          ? parseInt(req.body.folder_id) 
          : FOLDERS.UPLOAD;

        // Use folder hierarchy from database
        const folderPath = await getFolderPath(folderId);
        if (folderPath) {
          const folderDir = path.join(uploadDir, folderPath);
          if (!fs.existsSync(folderDir)) {
            fs.mkdirSync(folderDir, { recursive: true });
          }
          targetDir = folderDir;
        }
        // Fallback to type-based directory if needed
        else if (req.body && req.body.type) {
          const typeDir = path.join(uploadDir, req.body.type);
          if (!fs.existsSync(typeDir)) {
            fs.mkdirSync(typeDir, { recursive: true });
          }
          targetDir = typeDir;
        }
        
        cb(null, targetDir);
      } catch (error) {
        console.error('Error setting upload destination:', error);
        cb(null, uploadDir); // Fallback to base upload directory on error
      }
    },
    filename: (_req, file, cb) => {
      const originalName = file.originalname;
      cb(null, originalName);
    }
  });

  // Configure file filter
  const fileFilter = (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    // Check if the file type matches any of the allowed types
    if (fileTypes.some(type => file.mimetype.startsWith(type))) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  };

  // Return the configured multer middleware
  return multer({ 
    storage, 
    fileFilter,
    limits: {
      fileSize: maxSize,
    }
  });
}

// Pre-configured middleware for audio uploads
export const audioUpload = createUploadMiddleware('public/audio', ['audio/']);

// Pre-configured middleware for image uploads
export const imageUpload = createUploadMiddleware('public/images', ['image/']);
