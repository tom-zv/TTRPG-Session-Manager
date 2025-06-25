import fileModel, { FileInsertData } from "./fileModel.js";
import { getFolderType } from "../folders/folderModel.js";
import { AudioFileDB } from "../types.js";
import fs from "fs/promises";
import path from "path";
import { toAbsolutePath, toRelativePath } from "../../../utils/path-utils.js";
import { NotFoundError, ValidationError } from "src/api/HttpErrors.js";
import { PoolConnection } from "mysql2/promise";

export async function getAllAudioFiles(): Promise<AudioFileDB[]> {
  return await fileModel.getAllAudioFiles();
}

export async function getAudioFile(id: number): Promise<AudioFileDB> {
  return await fileModel.getAudioFile(id);
}

type AudioFileInsertRequest = Omit<FileInsertData, 'audio_type'> & {
  audio_type?: string;
};

export async function insertAudioFiles(
  filesData: AudioFileInsertRequest[],
  connection?: PoolConnection
): Promise<{ insertId: number; affectedRows: number }> {
  if (filesData.length === 0) {
    return { insertId: 0, affectedRows: 0 };
  }

  // Process each file to get its folder type
  const processedFiles = await Promise.all(
    filesData.map(async (fileData) => {
      let audio_type: string;

      if (!fileData.audio_type) {
        const folderType = await getFolderType(fileData.folder_id);
        if (!folderType) {
          throw new ValidationError(`Folder with id ${fileData.folder_id} does not exist`);
        }
        audio_type = folderType;
        if (audio_type == 'root') audio_type ='any';
        
      } else {
        audio_type = fileData.audio_type;
      }
      return {
        name: fileData.name,
        audio_type,
        rel_path: fileData.rel_path,
        url: fileData.url,
        folder_id: fileData.folder_id,
        duration: fileData.duration,
      };
    })
  );

  const result = await fileModel.insertAudioFiles(processedFiles, connection);

  return {
    insertId: result.insertId,
    affectedRows: result.affectedRows,
  };
}

export async function updateAudioFile(
  fileId: number,
  params: {
    name?: string;
    rel_path?: string;
    url?: string;
  }
): Promise<AudioFileDB> {
  const audioFileParams: typeof params = {};

  // Rename file-system file
  if (params.name) {
    audioFileParams.name = params.name;

    // Get the current file record to access rel_path
    const fileRecord = await fileModel.getAudioFile(fileId);

    const currentFile = fileRecord;
    if (currentFile && currentFile.rel_path) {
      try {
        const currentAbsolutePath = toAbsolutePath(currentFile.rel_path);
        const fileDir = path.dirname(currentAbsolutePath);
        const fileExt = path.extname(currentAbsolutePath);

        // Create new file path with the new name but same extension
        const newFileName = `${params.name}${fileExt}`;
        const newAbsolutePath = path.join(fileDir, newFileName);

        // Check if file exists before trying to rename
        await fs.access(currentAbsolutePath);

        await fs.rename(currentAbsolutePath, newAbsolutePath);

        // Update the rel_path in params to reflect the new name
        const newRelativePath = toRelativePath(newAbsolutePath);
        audioFileParams.rel_path = newRelativePath;
      } catch (fsError) {
        console.error(`Error renaming file:`, fsError);
        // Don't fail the whole operation if file renaming fails
      }
    }
  }

  if (params.rel_path !== undefined) {
    audioFileParams.rel_path = params.rel_path;
  }

  if (params.url !== undefined) {
    audioFileParams.url = params.url;
  }

  if (Object.keys(audioFileParams).length === 0) {
    throw new ValidationError();
  }

  const affectedRows = await fileModel.updateAudioFile(
    fileId,
    audioFileParams
  );

  if (!affectedRows) {
    throw new NotFoundError();
  }

  const file = getAudioFile(fileId);
  return file;
}

export async function deleteAudioFiles(fileIds: number[]): Promise<{ success: boolean, deletedCount: number, errors?: string[] }> {
  const errors: string[] = [];
  const filesToDelete: string[] = [];
  
  // First gather all files to delete
  for (const fileId of fileIds) {
    try {
      const file = await fileModel.getAudioFile(fileId);
      if (!file) {
        errors.push(`File with ID ${fileId} not found`);
        continue;
      }
      
      if (file.rel_path) {
        try {
          const absolutePath = toAbsolutePath(file.rel_path);
          await fs.access(absolutePath); 
          filesToDelete.push(absolutePath);
        } catch {
          // File doesn't exist - just continue
        }
      }
    } catch (error) {
      errors.push(`Error processing file ID ${fileId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  // Then delete files from filesystem in parallel
  await Promise.allSettled(
    filesToDelete.map(filepath => 
      fs.unlink(filepath).catch(err => 
        errors.push(`Error deleting file ${filepath}: ${err.message}`)
      )
    )
  );
  
  // Finally delete from database
  const result = await fileModel.deleteAudioFiles(fileIds);
  
  return {
    success: errors.length === 0,
    deletedCount: result.deletedCount,
    errors: errors.length > 0 ? errors : undefined
  };
}

export default {
  getAllAudioFiles,
  getAudioFile,
  insertAudioFiles,
  updateAudioFile,
  deleteAudioFiles
};
