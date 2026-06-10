import { dnd5ePool } from "src/db.js";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { DnD5eEncounterState } from "shared/domain/encounters/dnd5e/encounter.js";
import { normalizeDnD5eEncounterState } from "shared/domain/encounters/dnd5e/normalizeEncounterState.js";

export async function createEncounterSnapshot(
  encounterId: number,
  snapshot: DnD5eEncounterState
): Promise<void> {
  await dnd5ePool.execute<ResultSetHeader>(
    `INSERT INTO dnd5e.encounter_snapshots 
     (encounter_id, snapshot, snapshot_at) 
     VALUES (?, ?, CURRENT_TIMESTAMP)`,
    [encounterId, JSON.stringify(snapshot)]
  );
}

export async function getSnapshot(
  encounterId: number
): Promise<DnD5eEncounterState | null> {
  const [rows] = await dnd5ePool.execute<RowDataPacket[]>(
    `SELECT snapshot
     FROM dnd5e.encounter_snapshots 
     WHERE encounter_id = ?`,
    [encounterId]
  );

  if (!rows[0] || !rows[0].snapshot) {
    return null;
  }

  const snapshot = rows[0].snapshot;
  const parsed = typeof snapshot === 'string' 
    ? JSON.parse(snapshot) 
    : snapshot as DnD5eEncounterState;
  
  if (!parsed.id) parsed.id = encounterId;
  if (!parsed.system) parsed.system = "dnd5e";

  return normalizeDnD5eEncounterState(parsed);
}

export async function saveSnapshot(
  encounterId: number,
  snapshot: DnD5eEncounterState
): Promise<void> {
  await dnd5ePool.execute<ResultSetHeader>(
    `UPDATE dnd5e.encounter_snapshots 
     SET snapshot = ?,
         snapshot_at = CURRENT_TIMESTAMP
     WHERE encounter_id = ?`,
    [JSON.stringify(normalizeDnD5eEncounterState(snapshot)), encounterId]
  );
}

/** Encounters whose state contains at least one copy of this entity template. */
export async function getEncounterIdsUsingTemplate(templateId: number): Promise<number[]> {
  const [rows] = await dnd5ePool.execute<RowDataPacket[]>(
    `SELECT encounter_id
     FROM dnd5e.encounter_snapshots
     WHERE JSON_CONTAINS(JSON_EXTRACT(snapshot, '$.entityStates[*].templateId'), CAST(? AS JSON))`,
    [String(templateId)]
  );

  return rows.map((row) => row.encounter_id as number);
}

export default {
  createEncounterSnapshot,
  getSnapshot,
  saveSnapshot,
  getEncounterIdsUsingTemplate,
};
