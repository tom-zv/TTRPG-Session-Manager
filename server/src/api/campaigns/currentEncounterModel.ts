import { ResultSetHeader, RowDataPacket } from "mysql2";
import { corePool, type SqlExecutor } from "src/db.js";

/**
 * `core.campaign_current_encounters`: at most one row per campaign, naming the encounter its
 * players are shown. Writes take the executor of the transaction that stores the start or reset,
 * so the selection and the encounter state commit together.
 */

/** The campaign's current encounter, or null while its players wait. */
export async function getCurrentEncounterId(campaignId: number, executor: SqlExecutor = corePool): Promise<number | null> {
  const [rows] = await executor.execute<RowDataPacket[]>(
    "SELECT encounter_id FROM core.campaign_current_encounters WHERE campaign_id = ?",
    [campaignId],
  );
  return rows[0] ? (rows[0].encounter_id as number) : null;
}

/**
 * Make an encounter its own campaign's current one, replacing the previous one. The campaign comes
 * from the encounter row, never from the caller. Returns that campaign.
 */
export async function setCurrentEncounter(executor: SqlExecutor, encounterId: number): Promise<number> {
  const [rows] = await executor.execute<RowDataPacket[]>(
    "SELECT campaign_id FROM core.encounters WHERE id = ?",
    [encounterId],
  );
  if (!rows[0]) throw new Error(`Encounter ${encounterId} not found`);
  const campaignId = rows[0].campaign_id as number;
  await executor.execute<ResultSetHeader>(
    `INSERT INTO core.campaign_current_encounters (campaign_id, encounter_id) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE encounter_id = VALUES(encounter_id), started_at = CURRENT_TIMESTAMP`,
    [campaignId, encounterId],
  );
  return campaignId;
}

/**
 * Clear the selection only while this encounter is still current: a reset of A after B was started
 * leaves B alone. Returns the campaign that changed, or null when nothing did.
 */
export async function clearIfCurrent(executor: SqlExecutor, encounterId: number): Promise<number | null> {
  const [rows] = await executor.execute<RowDataPacket[]>(
    "SELECT campaign_id FROM core.campaign_current_encounters WHERE encounter_id = ? FOR UPDATE",
    [encounterId],
  );
  if (!rows[0]) return null;
  const [result] = await executor.execute<ResultSetHeader>(
    "DELETE FROM core.campaign_current_encounters WHERE encounter_id = ?",
    [encounterId],
  );
  return result.affectedRows > 0 ? (rows[0].campaign_id as number) : null;
}

export default {
  getCurrentEncounterId,
  setCurrentEncounter,
  clearIfCurrent,
};
