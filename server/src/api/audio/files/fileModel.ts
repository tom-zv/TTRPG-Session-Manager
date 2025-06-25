import { audioPool } from "../../../db.js";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { AudioFileDB } from "../types.js";
import { PoolConnection } from "mysql2/promise";

export async function getAllAudioFiles(): Promise<AudioFileDB[]> {
  const [rows] = await audioPool.execute("SELECT * FROM files");
  return rows as AudioFileDB[] & RowDataPacket[];
}

export async function getAudioFile(id: number): Promise<AudioFileDB> {
  const [rows] = await audioPool.execute("SELECT * FROM files WHERE id = ?", [
    id,
  ]);
  // Return first row or null if no results
  return (rows as RowDataPacket[])[0] as AudioFileDB;
}

export interface FileInsertData {
  name: string;
  audio_type: string;
  folder_id: number;
  rel_path: string | null;
  url: string | null;
  duration?: number | null;
}

export async function insertAudioFiles(
  files: FileInsertData[],
  connection?: PoolConnection
): Promise<ResultSetHeader> {

  if (files.length === 0) {
    return {
      affectedRows: 0, insertId: 0, warningStatus: 0,
    } as ResultSetHeader;
  }

  const db = connection ?? audioPool;

  const query = `INSERT INTO files 
    (name, audio_type, rel_path, url, folder_id, duration) VALUES ?`;

  const values = files.map((file) => [
    file.name,
    file.audio_type,
    file.rel_path,
    file.url,
    file.folder_id,
    file.duration,
  ]);

  const [result] = await db.query(query, [values]);
  return result as ResultSetHeader;
}

export async function updateAudioFile(
  fileId: number,
  params: {
    name?: string;
    rel_path?: string;
    url?: string;
    duration?: number;
  }
): Promise<number> {
  const updateFields: string[] = [];
  const fields: (string | number)[] = [];

  if (params.name !== undefined) {
    updateFields.push("name = ?");
    fields.push(params.name);
  }

  if (params.rel_path !== undefined) {
    updateFields.push("rel_path = ?");
    fields.push(params.rel_path);
  }

  if (params.url !== undefined) {
    updateFields.push("url = ?");
    fields.push(params.url);
  }

  if (params.duration !== undefined) {
    updateFields.push("duration = ?");
    fields.push(params.duration);
  }

  if (updateFields.length === 0) {
    return 0;
  }

  fields.push(fileId);

  const [result] = await audioPool.execute(
    `UPDATE files SET ${updateFields.join(", ")} 
     WHERE id = ?`,
    fields
  );

  return (result as ResultSetHeader).affectedRows || 0;
}

export async function deleteAudioFiles(
  fileIds: number[]
): Promise<{ deletedCount: number }> {
  if (fileIds.length === 0) {
    return { deletedCount: 0 };
  }

  const connection = await audioPool.getConnection();
  try {
    await connection.beginTransaction();
    const placeholders = fileIds.map(() => "?").join(", ");

    const [result] = await connection.execute<ResultSetHeader>(
      `DELETE FROM files WHERE id IN (${placeholders})`,
      fileIds
    );

    await connection.commit();
    return { deletedCount: result.affectedRows };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export default {
  getAllAudioFiles,
  getAudioFile,
  insertAudioFiles,
  updateAudioFile,
  deleteAudioFiles,
};
