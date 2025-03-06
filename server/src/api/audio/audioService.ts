import audioModel from "./audioModel.js";
import { QueryResult } from "../../db.js";
import { AudioFile } from "shared/types/audio.js";

export async function getAllAudioFiles(): Promise<AudioFile[]> {
  return await audioModel.getAllAudioFiles();
}

export async function getAudioFile(id: number): Promise<AudioFile[]> {
  return await audioModel.getAudioFile(id);
}

export async function createAudioFile(
  title: string,
  type: string,
  file_path?: string,
  file_url?: string,
  folder_id?: number
): Promise<QueryResult> {
  return await audioModel.insertAudioFile(title, type, file_path, file_url, folder_id);
}

export default {
  getAllAudioFiles,
  getAudioFile,
  createAudioFile
};