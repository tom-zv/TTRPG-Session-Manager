import { corePool, withTransaction, type SqlExecutor } from "src/db.js";
import { ExecuteValues, QueryResult, ResultSetHeader, RowDataPacket } from "mysql2";
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
    "INSERT INTO encounters (system_id, campaign_id, name, description, location, difficulty, gm_notes) VALUES (?, ?, ?, ?, ?, ?, ?)";
  const values: ExecuteValues[] = [
    data.system_id,
    data.campaign_id,
    data.name,
    data.description ?? null,
    data.location ?? null,
    data.difficulty ?? null,
    JSON.stringify(data.gm_notes)
  ];

  const [result] = await corePool.execute<ResultSetHeader>(query, values);

  return result.insertId;
}

/** One campaign's encounters of a game system, newest first. */
export async function getCampaignEncountersBySystem(campaignId: number, systemName: SystemType): Promise<EncounterDB[]> {
  const query = `
    SELECT e.id, s.name as \`system\`, e.campaign_id, e.name, e.description, e.status, e.location,
        e.difficulty, e.gm_notes, e.created_at,
        (SELECT COALESCE(SUM(ee.copies), 0) FROM core.encounter_entities ee WHERE ee.encounter_id = e.id) AS entity_count
    FROM core.encounters e
    JOIN core.systems s ON s.id = e.system_id
    WHERE e.campaign_id = ? AND s.name = ?
    ORDER BY e.created_at DESC, e.id DESC
  `;

  const [rows] = await corePool.execute<EncounterDB[] & QueryResult>(query, [campaignId, systemName]);
  return rows;
}
export async function getEncounterDetailsById(
  id: number
): Promise<EncounterDB | null> {
  const query = `SELECT e.id, s.name as \`system\`, e.campaign_id, e.name, e.description, e.status, e.location,
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
  const values: ExecuteValues[] = [];

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

/**
 * Record which entities an encounter uses, replacing what was recorded before.
 * @param copiesByEntityId - number of copies in the encounter, per entity ID
 */
export async function replaceEncounterEntities(
  encounterId: number,
  copiesByEntityId: Map<number, number>,
  transaction?: SqlExecutor
): Promise<void> {
  const replace = async (executor: SqlExecutor) => {
    await executor.execute("DELETE FROM core.encounter_entities WHERE encounter_id = ?", [encounterId]);
    for (const [entityId, copies] of copiesByEntityId) {
      await executor.execute(
        "INSERT INTO core.encounter_entities (encounter_id, entity_id, copies) VALUES (?, ?, ?)",
        [encounterId, entityId, copies]
      );
    }
  };
  // Inside the caller's transaction when given one; otherwise in a transaction of its own.
  if (transaction) await replace(transaction);
  else await withTransaction(corePool, replace);
}

/** Encounters that contain at least one copy of this entity. */
export async function getEncounterIdsUsingEntity(entityId: number): Promise<number[]> {
  const [rows] = await corePool.execute<RowDataPacket[]>(
    "SELECT encounter_id FROM core.encounter_entities WHERE entity_id = ?",
    [entityId]
  );
  return rows.map((row) => row.encounter_id as number);
}

export default {
  getSystemId,
  replaceEncounterEntities,
  getEncounterIdsUsingEntity,
  insertEncounter,
  getCampaignEncountersBySystem,
  getEncounterDetailsById,
  updateEncounter,
  deleteEncounter,
};
