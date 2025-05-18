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
  console.log(`[FILE UPLOAD] Creating upload middleware for path: ${uploadPath}, types: ${fileTypes.join(', ')}`);
  
  // Use the rootDir from server-config
  const uploadDir = path.join(rootDir, uploadPath);

  // Ensure the upload directory exists
  if (!fs.existsSync(uploadDir)) {
    console.log(`[FILE UPLOAD] Creating upload directory: ${uploadDir}`);
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // Configure storage
  const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
      try {
        console.log(`[FILE UPLOAD] Processing destination for file: ${file.originalname}`);
        // Use dynamic subdirectory based on folder_id if provided
        let targetDir = uploadDir;
        
        // Extract folder_id from request body or use default
        const folderId = req.body && req.body.folder_id 
          ? parseInt(req.body.folder_id) 
          : FOLDERS.UPLOAD;
        
        console.log(`[FILE UPLOAD] Using folder ID: ${folderId}`);

        // Use folder hierarchy from database
        const folderPath = await getFolderPath(folderId);
        if (folderPath) {
          const folderDir = path.join(uploadDir, folderPath);
          console.log(`[FILE UPLOAD] Using folder path: ${folderPath}`);
          if (!fs.existsSync(folderDir)) {
            console.log(`[FILE UPLOAD] Creating folder directory: ${folderDir}`);
            fs.mkdirSync(folderDir, { recursive: true });
          }
          targetDir = folderDir;
        }
        // Fallback to type-based directory if needed
        else if (req.body && req.body.type) {
          const typeDir = path.join(uploadDir, req.body.type);
          console.log(`[FILE UPLOAD] Using type directory: ${req.body.type}`);
          if (!fs.existsSync(typeDir)) {
            console.log(`[FILE UPLOAD] Creating type directory: ${typeDir}`);
            fs.mkdirSync(typeDir, { recursive: true });
          }
          targetDir = typeDir;
        }
        
        console.log(`[FILE UPLOAD] Final target directory: ${targetDir}`);
        cb(null, targetDir);
      } catch (error) {
        console.error('[FILE UPLOAD] Error setting upload destination:', error);
        cb(null, uploadDir); // Fallback to base upload directory on error
      }
    },
    filename: (req, file, cb) => {
      // Check if name is provided in request body
      if (req.body && req.body.name) {
        const providedName = req.body.name;
        console.log(`[FILE UPLOAD] Using provided name: ${providedName}`);
        
        // Extract extension from original filename to preserve it
        const extension = path.extname(file.originalname);
        
        // Create new filename with provided name + original extension
        const newFilename = `${providedName}${extension}`;
        console.log(`[FILE UPLOAD] Final filename: ${newFilename}`);
        cb(null, newFilename);
      } else {
        // Fall back to original filename if no name provided
        const originalName = file.originalname;
        console.log(`[FILE UPLOAD] Using original filename: ${originalName}`);
        cb(null, originalName);
      }
    }
  });

  // Configure file filter
  const fileFilter = (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    console.log(`[FILE UPLOAD] Filtering file: ${file.originalname} (${file.mimetype})`);
    // Check if the file type matches any of the allowed types
    if (fileTypes.some(type => file.mimetype.startsWith(type))) {
      console.log(`[FILE UPLOAD] File type accepted: ${file.mimetype}`);
      cb(null, true);
    } else {
      console.log(`[FILE UPLOAD] File type rejected: ${file.mimetype}`);
      cb(null, false);
    }
  };

  // Return the configured multer middleware
  console.log(`[FILE UPLOAD] Multer middleware created with max size: ${maxSize} bytes`);
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
