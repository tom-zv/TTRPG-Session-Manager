import fileModel from "./fileModel.js";
import { getFolderType } from "../folders/folderModel.js";
import { AudioFileDB } from "./types.js";
import fs from "fs/promises";
import path from "path";
import { toAbsolutePath, toRelativePath } from "../../../utils/path-utils.js";
import { NotFoundError, ValidationError } from "src/errors/HttpErrors.js";

export async function getAllAudioFiles(): Promise<AudioFileDB[]> {
  return await fileModel.getAllAudioFiles();
}

export async function getAudioFile(id: number): Promise<AudioFileDB> {
  return await fileModel.getAudioFile(id);
}

export async function createAudioFile({
  name,
  file_path,
  file_url,
  folder_id,
  duration,
}: {
  name: string;
  file_path: string | null;
  file_url: string | null;
  folder_id: number;
  duration?: number | null;
}): Promise<{ insertId: number }> {
  
  const type = await getFolderType(folder_id);

  return await fileModel.insertAudioFile(
    name,
    type,
    file_path,
    file_url,
    folder_id,
    duration
  );
}

export async function updateAudioFile(
  audioFileId: number,
  params: {
    name?: string;
    file_path?: string;
    file_url?: string;
  }
): Promise<AudioFileDB> {
  const audioFileParams: typeof params = {};

  // If name is being updated and we have a file on disk, we need to rename the actual file
  if (params.name) {
    audioFileParams.name = params.name;

    // Get the current file record to access file_path
    const fileRecord = await fileModel.getAudioFile(audioFileId);

    const currentFile = fileRecord;
    if (currentFile && currentFile.file_path) {
      try {
        const currentAbsolutePath = toAbsolutePath(currentFile.file_path);
        const fileDir = path.dirname(currentAbsolutePath);
        const fileExt = path.extname(currentAbsolutePath);

        // Create new file path with the new name but same extension
        const newFileName = `${params.name}${fileExt}`;
        const newAbsolutePath = path.join(fileDir, newFileName);

        // Check if file exists before trying to rename
        await fs.access(currentAbsolutePath);

        await fs.rename(currentAbsolutePath, newAbsolutePath);

        // Update the file_path in params to reflect the new name
        const newRelativePath = toRelativePath(newAbsolutePath);
        audioFileParams.file_path = newRelativePath;
      } catch (fsError) {
        console.error(`Error renaming file:`, fsError);
        // Don't fail the whole operation if file renaming fails
      }
    }
  }

  if (params.file_path !== undefined) {
    audioFileParams.file_path = params.file_path;
  }

  if (params.file_url !== undefined) {
    audioFileParams.file_url = params.file_url;
  }

  if (Object.keys(audioFileParams).length === 0) {
    throw new ValidationError();
  }

  const affectedRows = await fileModel.updateAudioFile(
    audioFileId,
    audioFileParams
  );

  if (!affectedRows) {
    throw new NotFoundError();
  }

  const file = getAudioFile(audioFileId);
  return file;
}

export default {
  getAllAudioFiles,
  getAudioFile,
  createAudioFile,
  updateAudioFile,
};
