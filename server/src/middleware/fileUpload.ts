import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { rootDir } from '../config/server-config.js';
import { getFolderPath } from '../api/audio/folders/folderModel.js';
import { FOLDERS } from '../api/audio/folders/constants.js';

/**
 * Creates multer middleware for file uploads
 * @param uploadPath - Relative path from base directory for file storage
 * @param fileTypes - Accepted MIME type prefixes (e.g., ['audio/', 'image/'])
 * @param maxSize - Maximum file size in bytes (default: 1GB)
 */
export function createUploadMiddleware(
  uploadPath: string,
  fileTypes: string[] = ['audio/'],
  maxSize: number = 1024 * 1024 * 1024
) {
  const uploadDir = path.join(rootDir, uploadPath);

  // Ensure upload directory exists
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // Configure storage
  const storage = multer.diskStorage({
    destination: async (req, _file, cb) => {
      try {
        let targetDir = uploadDir;
        
        // Extract folder_id from request or use default
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
        else if (req.body && req.body.audioType) {
          const typeDir = path.join(uploadDir, req.body.audioType);
          if (!fs.existsSync(typeDir)) {
            fs.mkdirSync(typeDir, { recursive: true });
          }
          targetDir = typeDir;
        }
        
        cb(null, targetDir);
      } catch {
        cb(null, uploadDir); // Fallback to base directory on error
      }
    },
    filename: (req, file, cb) => {
      // Use provided name or original filename
      if (req.body && req.body.name) {
        const extension = path.extname(file.originalname);
        const newFilename = `${req.body.name}${extension}`;
        cb(null, newFilename);
      } else {
        cb(null, file.originalname);
      }
    }
  });

  // File type filter
  const fileFilter = (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const isAcceptedType = fileTypes.some(type => file.mimetype.startsWith(type));
    cb(null, isAcceptedType);
  };

  const upload = multer({ 
    storage, 
    fileFilter,
    limits: {
      fileSize: maxSize,
    }
  });

  return {
    single: (fieldName: string = 'file') => upload.single(fieldName),
    array: (fieldName: string = 'files', maxCount: number = 100) => upload.array(fieldName, maxCount),
    fields: (fields: { name: string; maxCount: number }[]) => upload.fields(fields),
    none: () => upload.none()
  };
}

// Pre-configured middleware for audio uploads
export const audioUpload = createUploadMiddleware('public', ['audio/']);

// Pre-configured middleware for image uploads
export const imageUpload = createUploadMiddleware('public', ['image/']);
