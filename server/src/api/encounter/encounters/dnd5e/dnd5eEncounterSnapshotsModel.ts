import { dnd5ePool } from "src/db.js";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { DnD5eEncounterState } from "shared/domain/encounters/dnd5e/encounter.js";

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

  return parsed;
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
    [JSON.stringify(snapshot), encounterId]
  );
}

export default {
  createEncounterSnapshot,
  getSnapshot,
  saveSnapshot,
};
