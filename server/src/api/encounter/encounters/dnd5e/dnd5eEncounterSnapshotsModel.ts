import { dnd5ePool, type SqlExecutor } from "src/db.js";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { DnD5eEncounterState } from "shared/domain/encounters/dnd5e/encounter.js";
import { type EncounterPhase, isEncounterPhase } from "shared/domain/encounters/coreEncounter.js";
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

/** A new encounter version advances history order. Cleanup can also normalize an old saved version. */
export async function saveSnapshot(
  encounterId: number,
  snapshot: DnD5eEncounterState,
  executor: SqlExecutor = dnd5ePool
): Promise<void> {
  await executor.execute<ResultSetHeader>(
    `UPDATE dnd5e.encounter_snapshots
     SET snapshot_at = IF(JSON_UNQUOTE(JSON_EXTRACT(snapshot, '$.version')) <=> ?, snapshot_at, CURRENT_TIMESTAMP),
         snapshot = ?
     WHERE encounter_id = ?`,
    [String(snapshot.version), JSON.stringify(normalizeDnD5eEncounterState(snapshot)), encounterId]
  );
}

/** The stored combat phase, or null when the encounter has no snapshot. */
export async function getPhase(encounterId: number): Promise<EncounterPhase | null> {
  const [rows] = await dnd5ePool.execute<RowDataPacket[]>(
    `SELECT JSON_UNQUOTE(JSON_EXTRACT(snapshot, '$.phase')) AS phase
     FROM dnd5e.encounter_snapshots
     WHERE encounter_id = ?`,
    [encounterId]
  );
  const phase: unknown = rows[0]?.phase;
  return isEncounterPhase(phase) ? phase : null;
}

/**
 * A campaign's encounters whose combat has ended, by the stored phase (never the status label),
 * most recently changed first.
 */
export async function getEndedEncounterIds(campaignId: number): Promise<number[]> {
  const [rows] = await dnd5ePool.execute<RowDataPacket[]>(
    `SELECT s.encounter_id
     FROM dnd5e.encounter_snapshots s
     JOIN core.encounters e ON e.id = s.encounter_id
     WHERE e.campaign_id = ? AND JSON_UNQUOTE(JSON_EXTRACT(s.snapshot, '$.phase')) = 'ended'
     ORDER BY s.snapshot_at DESC, s.encounter_id DESC`,
    [campaignId]
  );
  return rows.map((row) => row.encounter_id as number);
}

export default {
  createEncounterSnapshot,
  getSnapshot,
  saveSnapshot,
  getPhase,
  getEndedEncounterIds,
};
