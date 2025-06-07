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
  rel_path,
  url,
  folder_id,
  duration,
}: {
  name: string;
  rel_path: string | null;
  url: string | null;
  folder_id: number;
  duration?: number | null;
}): Promise<{ insertId: number }> {
  
  const type = await getFolderType(folder_id);

  return await fileModel.insertAudioFile(
    name,
    type,
    rel_path,
    url,
    folder_id,
    duration
  );
}

export async function updateAudioFile(
  audioFileId: number,
  params: {
    name?: string;
    rel_path?: string;
    url?: string;
  }
): Promise<AudioFileDB> {
  const audioFileParams: typeof params = {};

  // If name is being updated and we have a file on disk, we need to rename the actual file
  if (params.name) {
    audioFileParams.name = params.name;

    // Get the current file record to access rel_path
    const fileRecord = await fileModel.getAudioFile(audioFileId);

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
