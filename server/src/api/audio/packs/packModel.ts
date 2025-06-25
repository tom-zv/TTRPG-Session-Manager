import { audioPool } from "src/db.js";
import { RowDataPacket, ResultSetHeader } from "mysql2";

export async function getAllPacks(): Promise<RowDataPacket[]> {
  const [result] = await audioPool.execute(`SELECT * FROM audio_packs`);
  return result as RowDataPacket[];
}

export async function createPack(
  name: string,
  description: string | null
): Promise<number> {
  const [result] = await audioPool.execute(
    `INSERT INTO audio_packs (name, description) VALUES (?, ?)`,
    [name, description]
  );
  return (result as ResultSetHeader).insertId || 0;
}

export async function deletePack(packId: number): Promise<number> {
  const [result] = await audioPool.execute(
    `DELETE FROM audio_packs WHERE pack_id = ?`,
    [packId]
  );
  return (result as ResultSetHeader).affectedRows || 0;
}

export async function addCollectionToPack(
  packId: number,
  collectionId: number,
): Promise<number> {
  const connection = await audioPool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      `INSERT INTO audio_pack_collections (pack_id, collection_id) VALUES (?, ?)`,
      [packId, collectionId]
    );
    await connection.commit();
    return (result as ResultSetHeader).affectedRows || 0;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ER_DUP_ENTRY') {
      return -1;
    }
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getPackCollections(packId: number): Promise<RowDataPacket[]> {
  const [result] = await audioPool.execute(
    `SELECT c.id, c.name, c.description, c.type
     FROM collections c
     JOIN audio_pack_collections apc ON c.id = apc.collection_id
     WHERE apc.pack_id = ?
     ORDER BY c.type, c.name ASC`,
    [packId]
  );
  return result as RowDataPacket[];
}

export default {
  getAllPacks,
  createPack,
  deletePack,
  addCollectionToPack,
  getPackCollections
};
