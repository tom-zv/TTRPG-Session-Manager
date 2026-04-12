import { dnd5ePool } from "src/db.js";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { DnD5eEncounterState } from "shared/domain/encounters/dnd5e/encounter.js";

export type DnD5eEncounterSnapshotsDB = {
  encounter_id: number;
  initial_snapshot: DnD5eEncounterState | null;
  initial_snapshot_at: string | null;
  active_snapshot: DnD5eEncounterState | null;
  active_snapshot_at: string | null;
};

export async function createEncounterSnapshot(
  encounterId: number,
  initialSnapshot: DnD5eEncounterState
): Promise<void> {
  await dnd5ePool.execute<ResultSetHeader>(
    `INSERT INTO dnd5e.encounter_snapshots 
     (encounter_id, initial_snapshot, initial_snapshot_at) 
     VALUES (?, ?, CURRENT_TIMESTAMP)`,
    [encounterId, JSON.stringify(initialSnapshot)]
  );
}


export async function getInitialSnapshot(
  encounterId: number
): Promise<DnD5eEncounterState | null> {
  const [rows] = await dnd5ePool.execute<RowDataPacket[]>(
    `SELECT initial_snapshot 
     FROM dnd5e.encounter_snapshots 
     WHERE encounter_id = ?`,
    [encounterId]
  );

  if (!rows[0] || !rows[0].initial_snapshot) {
    return null;
  }

  return rows[0].initial_snapshot;

}

export async function getActiveSnapshot(
  encounterId: number,
): Promise<DnD5eEncounterState | null> {
  const [rows] = await dnd5ePool.execute<RowDataPacket[]>(
    `SELECT active_snapshot
     FROM dnd5e.encounter_snapshots 
     WHERE encounter_id = ?`,
    [encounterId]
  );

  if (!rows[0] || !rows[0].active_snapshot) {
    return null;
  }

  return rows[0].active_snapshot;

}

export async function getEncounterSnapshots(
  encounterId: number
): Promise<DnD5eEncounterSnapshotsDB | null> {
  const [rows] = await dnd5ePool.execute<RowDataPacket[]>(
    `SELECT * FROM dnd5e.encounter_snapshots WHERE encounter_id = ?`,
    [encounterId]
  );

  return (rows[0] as DnD5eEncounterSnapshotsDB) || null;
}

/**
 * Returns active if available, otherwise initial snapshot
 * Also returns which snapshot type was actually used.
 * 
 * @param encounterId - The encounter ID
 * @returns Object with encounterState and which snapshotType was used, or null if not found
 */
export async function getSnapshot(
  encounterId: number
): Promise<{ encounterState: DnD5eEncounterState; returnedSnapshotType: 'active' | 'initial' } | null> {
  const [rows] = await dnd5ePool.execute<RowDataPacket[]>(
    `SELECT 
      COALESCE(active_snapshot, initial_snapshot) as snapshot,
      CASE 
        WHEN active_snapshot IS NOT NULL THEN 'active'
        ELSE 'initial'
      END as snapshot_type
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
  
  return {
    encounterState: parsed,
    returnedSnapshotType: rows[0].snapshot_type as 'active' | 'initial'
  };
}

export async function updateEncounterSnapshots(
  encounterId: number,
  updates: {
    initial_snapshot?: DnD5eEncounterState;
    active_snapshot?: DnD5eEncounterState;
  }
): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.initial_snapshot !== undefined) {
    fields.push('initial_snapshot = ?');
    fields.push('initial_snapshot_at = CURRENT_TIMESTAMP');
    values.push(JSON.stringify(updates.initial_snapshot));
  }

  if (updates.active_snapshot !== undefined) {
    fields.push('active_snapshot = ?');
    fields.push('active_snapshot_at = CURRENT_TIMESTAMP');
    values.push(JSON.stringify(updates.active_snapshot));
  }

  if (fields.length === 0) {
    throw new Error('No updates provided');
  }

  values.push(encounterId);

  const query = `
    UPDATE dnd5e.encounter_snapshots 
    SET ${fields.join(', ')}
    WHERE encounter_id = ?
  `;

  await dnd5ePool.execute<ResultSetHeader>(query, values);
}

export async function clearActiveSnapshot(encounterId: number): Promise<void> {
  await dnd5ePool.execute<ResultSetHeader>(
    `UPDATE dnd5e.encounter_snapshots 
     SET active_snapshot = NULL,
         active_snapshot_at = NULL
     WHERE encounter_id = ?`,
    [encounterId]
  );
}

export default {
  createEncounterSnapshot,
  getInitialSnapshot,
  getActiveSnapshot,
  getSnapshot,
  getEncounterSnapshots,
  updateEncounterSnapshots,
  clearActiveSnapshot,
};
