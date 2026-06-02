import fileModel, { FileInsertData } from "./fileModel.js";
import { getFolderType } from "../folders/folderModel.js";
import { AudioFileDB } from "../types.js";
import fs from "fs/promises";
import path from "path";
import { toAbsolutePath, toRelativePath } from "../../../utils/path-utils.js";
import { NotFoundError, ValidationError } from "src/api/HttpErrors.js";
import { PoolConnection } from "mysql2/promise";
import { sanitizeName } from "../../../utils/file-utils.js";

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
  let originalPath: string | undefined;
  let renamedPath: string | undefined;

  if (params.rel_path !== undefined) audioFileParams.rel_path = params.rel_path;
  if (params.url !== undefined) audioFileParams.url = params.url;

  if (params.name !== undefined) {
    if (typeof params.name !== "string" || !params.name.trim()) {
      throw new ValidationError("File name is required");
    }
    const currentFile = await fileModel.getAudioFile(fileId);
    if (!currentFile) throw new NotFoundError();

    const extension = currentFile.rel_path ? path.extname(currentFile.rel_path) : "";
    const stem = extension && params.name.toLowerCase().endsWith(extension.toLowerCase())
      ? params.name.slice(0, -extension.length)
      : params.name;
    audioFileParams.name = sanitizeName(stem, 128);

    if (currentFile.rel_path) {
      const currentAbsolutePath = toAbsolutePath(currentFile.rel_path);
      const newAbsolutePath = path.join(path.dirname(currentAbsolutePath),
        audioFileParams.name + extension);
      const newRelativePath = toRelativePath(newAbsolutePath);
      if (Array.from(newRelativePath).length > 256) {
        throw new ValidationError("Renamed file path is too long");
      }

      if (newAbsolutePath !== currentAbsolutePath) {
        // Edit dialogs include the unchanged old path alongside the new name.
        // Only an independently changed path conflicts with this rename.
        if (params.rel_path !== undefined && params.rel_path !== currentFile.rel_path &&
          params.rel_path !== newRelativePath) {
          throw new ValidationError("Cannot rename a file and change its path independently");
        }
        try {
          // Keep the original until the DB update succeeds, without overwriting a destination.
          await fs.link(currentAbsolutePath, newAbsolutePath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "EEXIST") {
            throw new ValidationError("A file with that name already exists");
          }
          throw error;
        }
        originalPath = currentAbsolutePath;
        renamedPath = newAbsolutePath;
        audioFileParams.rel_path = newRelativePath;
      }
    }
  }

  if (Object.keys(audioFileParams).length === 0) throw new ValidationError();

  try {
    const affectedRows = await fileModel.updateAudioFile(fileId, audioFileParams);
    if (!affectedRows) throw new NotFoundError();
  } catch (error) {
    if (renamedPath) await fs.unlink(renamedPath);
    throw error;
  }

  if (originalPath) {
    // The committed DB row already points to the complete new file.
    await fs.unlink(originalPath).catch((error) => {
      console.warn("Unable to remove the old file after renaming:", error);
    });
  }
  return getAudioFile(fileId);
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
