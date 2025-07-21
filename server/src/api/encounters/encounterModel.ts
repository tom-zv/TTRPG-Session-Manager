import { corePool } from "src/db.js";
import { QueryResult, ResultSetHeader, RowDataPacket } from "mysql2";
import { EncounterDB, encounterUpdateDataDB, EncounterInsertData } from "./types.js";

export async function insertEncounter(
  data: EncounterInsertData
): Promise<number> {
  const query =
    "INSERT INTO encounters (name, description, location, difficulty) VALUES (?, ?, ?, ?)";
  const values = [data.name, data.description, data.location, data.difficulty];

  const [result] = await corePool.execute<ResultSetHeader>(query, values);

  return result.insertId;
}

export async function getAllEncounters(): Promise<EncounterDB[]> {
  const query = `
    SELECT id, name, description, status, location, 
        difficulty, round_count, dm_notes, created_at
    FROM core.encounters
    ORDER BY created_at DESC
  `;

  const [rows] = await corePool.execute<EncounterDB[] & QueryResult>(query);
  return rows;
}
export async function getEncounterById(
  id: number
): Promise<EncounterDB | null> {
  const query = `SELECT id, name, description, status, location, 
                    difficulty, round_count, dm_notes, created_at 
                 FROM core.encounters WHERE id = ?`;
                 
  const [rows] = await corePool.execute<EncounterDB[] & RowDataPacket[]>(query, [id]);

  return rows[0] ?? null;
}

export async function assignEntitiesToEncounter(
  encounterId: number,
  entityIds: number[]
): Promise<boolean> {
  if (!entityIds.length) return true;

  const rows = entityIds.map((id) => [encounterId, id]);
  const query = `INSERT INTO core.encounter_entities (encounter_id, entity_id) VALUES ?`;

  const [result] = await corePool.execute<ResultSetHeader>(query, [rows]);

  return result.affectedRows === entityIds.length;
}

export async function updateEncounter(
  id: number,
  data: encounterUpdateDataDB
): Promise<boolean> {
  // Build dynamic SET clause and values array
  const updateFields: string[] = [];
  const values: (string | unknown)[] = [];

  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined) {
      updateFields.push(`${key} = ?`);
      values.push(value);
    }
  });

  if (updateFields.length === 0) {
    return true;
  }

  values.push(id);

  const query = `UPDATE core.encounters SET ${updateFields.join(", ")} WHERE id = ?`;
  const [result] = await corePool.execute<ResultSetHeader>(query, values);

  return result.affectedRows > 0;
}

export async function deleteEncounter(id: number): Promise<boolean> {
  const query = "DELETE FROM core.encounters WHERE id = ?";
  const [result] = await corePool.execute<ResultSetHeader>(query, [id]);

  return result.affectedRows > 0;
}

export default {
  insertEncounter,
  getAllEncounters,
  getEncounterById,
  assignEntitiesToEncounter,
  updateEncounter,
  deleteEncounter,
  
};
