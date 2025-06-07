import { audioPool } from "../../../db.js";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { AudioFileDB } from './types.js';

export async function getAllAudioFiles(): Promise<AudioFileDB[]> {
  const [rows] = await audioPool.execute('SELECT * FROM files');
  return rows as AudioFileDB[] & RowDataPacket[];
}

export async function getAudioFile(id: number): Promise<AudioFileDB> {
  const [rows] = await audioPool.execute(
    'SELECT * FROM files WHERE id = ?', 
    [id]
  );
  // Return first row or null if no results
  return (rows as RowDataPacket[])[0] as AudioFileDB;
}

export async function insertAudioFile(
  name: string | null,
  type: string,
  rel_path: string | null,
  url: string | null,
  folder_id: number | null,
  duration?: number | null
): Promise<ResultSetHeader> {
  const query = `INSERT INTO files 
  (name, audio_type, rel_path, url, folder_id, duration) VALUES (?,?,?,?,?,?)`;

  const [result] = await audioPool.execute(
    query, 
    [name, type, rel_path, url, folder_id, duration]
  );
  
  return result as ResultSetHeader;
}

export async function updateAudioFile(
  audioFileId: number,
  params: {
    name?: string;
    rel_path?: string;
    url?: string;
    duration?: number;
  }
): Promise<number> {
  // Build dynamic query based on provided params
  const updateFields: string[] = [];
  const fields: (string | number)[] = [];

  if (params.name !== undefined) {
    updateFields.push('name = ?');
    fields.push(params.name);
  }

  if (params.rel_path !== undefined) {
    updateFields.push('rel_path = ?');
    fields.push(params.rel_path);
  }
  
  if (params.url !== undefined) {
    updateFields.push('url = ?');
    fields.push(params.url);
  }

  if (params.duration !== undefined){
    updateFields.push("duration = ?");
    fields.push(params.duration);
  }
  
  // If no fields to update, return early
  if (updateFields.length === 0) {
    return 0;
  }
  
  // Add parameter for WHERE clause
  fields.push(audioFileId);
  
  const [result] = await audioPool.execute(
    `UPDATE files SET ${updateFields.join(', ')} 
     WHERE id = ?`,
    fields
  );
  
  return (result as ResultSetHeader).affectedRows || 0;
}

export async function deleteAudioFile(id: number): Promise<ResultSetHeader> {
  const [result] = await audioPool.execute(
    'DELETE FROM files WHERE id = ?', 
    [id]
  );
  return result as ResultSetHeader;
}

export default {
  getAllAudioFiles,
  getAudioFile,
  insertAudioFile,
  updateAudioFile,
  deleteAudioFile,
};
