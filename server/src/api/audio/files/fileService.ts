import fileModel from "./fileModel.js";
import { QueryResult } from "../../../db.js";
import { AudioFile } from 'shared/types/types.js';

export async function getAllAudioFiles(): Promise<AudioFile[]> {
  return await fileModel.getAllAudioFiles();
}

export async function getAudioFile(id: number): Promise<AudioFile[]> {
  return await fileModel.getAudioFile(id);
}

export async function createAudioFile(
  name: string,
  type: string,
  file_path: string | null,
  file_url: string | null,
  folder_id: number | null
): Promise<QueryResult> {
  return await fileModel.insertAudioFile(name, type, file_path, file_url, folder_id);
}

export default {
  getAllAudioFiles,
  getAudioFile,
  createAudioFile
};
