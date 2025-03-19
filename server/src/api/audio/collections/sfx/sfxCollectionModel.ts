import { pool } from "src/db.js";
import { RowDataPacket } from "mysql2";

export async function getAllSfxCollections(): Promise<RowDataPacket[]> {
  const [result] = await pool.execute('SELECT * FROM sfx_collections');
  return result as RowDataPacket[];
}

export default {
  getAllSfxCollections
};
