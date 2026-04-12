import { corePool } from "src/db.js";
import { QueryResult, ResultSetHeader, RowDataPacket } from "mysql2";
import { EncounterDB, encounterUpdateDataDB, EncounterInsertData } from "./types.js";
import type { SystemType } from "shared/domain/encounters/coreEncounter.js";

export async function getSystemId(systemName: SystemType): Promise<number> {
  const query = "SELECT id FROM core.systems WHERE name = ?";
  const [rows] = await corePool.execute<RowDataPacket[]>(query, [systemName]);
  
  if (!rows[0]) {
    throw new Error(`System '${systemName}' not found`);
  }
  
  return rows[0].id as number;
}

export async function insertEncounter(
  data: EncounterInsertData
): Promise<number> {
  const query =
    "INSERT INTO encounters (system_id, name, description, location, difficulty, gm_notes) VALUES (?, ?, ?, ?, ?, ?)";
  const values = [
    data.system_id,
    data.name,
    data.description,
    data.location,
    data.difficulty,
    JSON.stringify(data.gm_notes)
  ];

  const [result] = await corePool.execute<ResultSetHeader>(query, values);

  return result.insertId;
}

export async function getAllEncountersBySystem(systemName: SystemType): Promise<EncounterDB[]> {
  const query = `
    SELECT e.id, s.name as \`system\`, e.name, e.description, e.status, e.location, 
        e.difficulty, e.gm_notes, e.created_at
    FROM core.encounters e
    JOIN core.systems s ON s.id = e.system_id
    WHERE s.name = ?
    ORDER BY e.created_at DESC
  `;

  const [rows] = await corePool.execute<EncounterDB[] & QueryResult>(query, [systemName]);
  return rows;
}
export async function getEncounterDetailsById(
  id: number
): Promise<EncounterDB | null> {
  const query = `SELECT e.id, s.name as \`system\`, e.name, e.description, e.status, e.location, 
                    e.difficulty, e.gm_notes, e.created_at
                 FROM core.encounters e
                 JOIN core.systems s ON s.id = e.system_id
                 WHERE e.id = ?`;
                 
  const [rows] = await corePool.execute<EncounterDB[] & RowDataPacket[]>(query, [id]);

  return rows[0] ?? null;
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
      // JSON.stringify gm_notes to match insertEncounter behavior
      if (key === 'gm_notes') {
        values.push(JSON.stringify(value));
      } else {
        values.push(value);
      }
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
  getSystemId,
  insertEncounter,
  getAllEncountersBySystem,
  getEncounterDetailsById,
  updateEncounter,
  deleteEncounter,
};
