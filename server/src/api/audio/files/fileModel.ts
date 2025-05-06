import { pool } from "../../../db.js";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { AudioFileDB } from './types.js';

export async function getAllAudioFiles(): Promise<AudioFileDB[]> {
  const [rows] = await pool.execute('SELECT * FROM audio_files');
  return rows as AudioFileDB[] & RowDataPacket[];
}

export async function getAudioFile(id: number): Promise<AudioFileDB> {
  const [rows] = await pool.execute(
    'SELECT * FROM audio_files WHERE audio_file_id = ?', 
    [id]
  );
  return rows as AudioFileDB & RowDataPacket[];
}

export async function insertAudioFile(
  name: string,
  type: string,
  file_path: string | null,
  file_url: string | null,
  folder_id: number | null
): Promise<ResultSetHeader> {
  const query = `INSERT INTO audio_files 
  (name, audio_type, file_path, file_url, folder_id) VALUES (?,?,?,?,?)`;

  const [result] = await pool.execute(
    query, 
    [name, type, file_path, file_url, folder_id]
  );
  
  return result as ResultSetHeader;
}

export async function updateAudioFile(
  audioFileId: number,
  params: {
    name?: string;
    file_path?: string;
    file_url?: string;
  }
): Promise<number> {
  // Build dynamic query based on provided params
  const updateFields: string[] = [];
  const fields: any[] = [];
  
  console.log('updateAudioFile MODEL params:', params);

  if (params.name !== undefined) {
    updateFields.push('name = ?');
    fields.push(params.name);
  }

  if (params.file_path !== undefined) {
    updateFields.push('file_path = ?');
    fields.push(params.file_path);
  }
  
  if (params.file_url !== undefined) {
    updateFields.push('file_url = ?');
    fields.push(params.file_url);
  }
  
  // If no fields to update, return early
  if (updateFields.length === 0) {
    return 0;
  }
  
  // Add parameter for WHERE clause
  fields.push(audioFileId);
  
  const [result] = await pool.execute(
    `UPDATE audio_files SET ${updateFields.join(', ')} 
     WHERE audio_file_id = ?`,
    fields
  );
  
  return (result as ResultSetHeader).affectedRows || 0;
}

export default {
  getAllAudioFiles,
  getAudioFile,
  insertAudioFile,
  updateAudioFile
};
