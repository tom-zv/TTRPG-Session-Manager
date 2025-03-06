import { executeQuery, QueryResult } from "../../db.js";
import { AudioFile } from "shared/types/audio.js";

// Define functions as standalone first
export async function getAllAudioFiles(): Promise<AudioFile[]> {
  return await executeQuery<AudioFile>('SELECT * FROM audio_files');
}

export async function getAudioFile(id: number): Promise<AudioFile[]> {
  return await executeQuery<AudioFile>('SELECT * FROM audio_files WHERE audio_file_id = ?', [id]);
}

export async function insertAudioFile(
  title: string,
  type: string,
  file_path?: string,
  file_url?: string,
  folder_id?: number
): Promise<QueryResult> {
  const query = `INSERT INTO audio_files 
  (title, audio_type, file_path, file_url, folder_id) VALUES (?,?,?,?,?)`;

  return (await executeQuery<QueryResult>(query, [title, type, file_path, file_url, folder_id]))[0];
}

// Also export as a default object if you want
export default {
  getAllAudioFiles,
  getAudioFile,
  insertAudioFile
};
