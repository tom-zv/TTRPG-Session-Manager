import { executeQuery, QueryResult } from "../../../db.js";
import { AudioFile } from 'shared/types/types.js';

////////////////////////////////
// Audio file model functions //
export async function getAllAudioFiles(): Promise<AudioFile[]> {
  return await executeQuery<AudioFile>('SELECT * FROM audio_files');
}

export async function getAudioFile(id: number): Promise<AudioFile[]> {
  return await executeQuery<AudioFile>('SELECT * FROM audio_files WHERE audio_file_id = ?', [id]);
}

export async function insertAudioFile(
  title: string,
  type: string,
  file_path: string | null,
  file_url: string | null,
  folder_id: number | null
): Promise<QueryResult> {
  const query = `INSERT INTO audio_files 
  (title, audio_type, file_path, file_url, folder_id) VALUES (?,?,?,?,?)`;

  const result = await executeQuery<QueryResult>(query, [title, type, file_path, file_url, folder_id]);
  return result[0] || { insertId: 0 }; 
}

export default {
  getAllAudioFiles,
  getAudioFile,
  insertAudioFile
};
