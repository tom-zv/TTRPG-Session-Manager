import { pool } from "../../../db.js";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { AudioFile } from 'shared/types/types.js';

export async function getAllAudioFiles(): Promise<AudioFile[]> {
  const [rows] = await pool.execute('SELECT * FROM audio_files');
  return rows as AudioFile[] & RowDataPacket[];
}

export async function getAudioFile(id: number): Promise<AudioFile[]> {
  const [rows] = await pool.execute(
    'SELECT * FROM audio_files WHERE audio_file_id = ?', 
    [id]
  );
  return rows as AudioFile[] & RowDataPacket[];
}

export async function insertAudioFile(
  title: string,
  type: string,
  file_path: string | null,
  file_url: string | null,
  folder_id: number | null
): Promise<ResultSetHeader> {
  const query = `INSERT INTO audio_files 
  (title, audio_type, file_path, file_url, folder_id) VALUES (?,?,?,?,?)`;

  const [result] = await pool.execute(
    query, 
    [title, type, file_path, file_url, folder_id]
  );
  
  return result as ResultSetHeader;
}

export default {
  getAllAudioFiles,
  getAudioFile,
  insertAudioFile
};
