import { ResultSetHeader, RowDataPacket } from "mysql2";
import { corePool } from "src/db.js";
import { CampaignDB, CampaignMemberDB, CampaignUpdateDB } from "./types.js";

type CampaignRow = CampaignDB & RowDataPacket;
type MemberRow = CampaignMemberDB & RowDataPacket;

export async function insertCampaign(name: string, description: string | null, createdBy: number): Promise<number> {
  const [result] = await corePool.execute<ResultSetHeader>(
    "INSERT INTO core.campaigns (name, description, created_by) VALUES (?, ?, ?)",
    [name, description, createdBy],
  );
  return result.insertId;
}

export async function getCampaignById(id: number): Promise<CampaignDB | null> {
  const [rows] = await corePool.execute<CampaignRow[]>(
    `SELECT c.id, c.name, c.description, c.created_by, c.created_at,
       (SELECT COUNT(*) FROM core.campaign_members m WHERE m.campaign_id = c.id) AS member_count
     FROM core.campaigns c WHERE c.id = ?`,
    [id],
  );
  return rows[0] ?? null;
}

/** Every campaign with its roster size, by name. */
export async function getAllCampaigns(): Promise<CampaignDB[]> {
  const [rows] = await corePool.execute<CampaignRow[]>(
    `SELECT c.id, c.name, c.description, c.created_by, c.created_at,
       (SELECT COUNT(*) FROM core.campaign_members m WHERE m.campaign_id = c.id) AS member_count
     FROM core.campaigns c ORDER BY c.name, c.id`,
  );
  return rows;
}

/** The campaigns a user is a member of, by name. */
export async function getCampaignsForMember(userId: number): Promise<CampaignDB[]> {
  const [rows] = await corePool.execute<CampaignRow[]>(
    `SELECT c.id, c.name, c.description, c.created_by, c.created_at
     FROM core.campaigns c
     JOIN core.campaign_members m ON m.campaign_id = c.id
     WHERE m.user_id = ?
     ORDER BY c.name, c.id`,
    [userId],
  );
  return rows;
}

export async function isMember(campaignId: number, userId: number): Promise<boolean> {
  const [rows] = await corePool.execute<RowDataPacket[]>(
    "SELECT 1 FROM core.campaign_members WHERE campaign_id = ? AND user_id = ?",
    [campaignId, userId],
  );
  return rows.length > 0;
}

/** False when the campaign does not exist. */
export async function updateCampaign(id: number, data: CampaignUpdateDB): Promise<boolean> {
  const fields: string[] = [];
  const values: (string | number)[] = [];
  if (data.name !== undefined) { fields.push("name = ?"); values.push(data.name); }
  if (data.description !== undefined) { fields.push("description = ?"); values.push(data.description); }
  if (fields.length === 0) return (await getCampaignById(id)) !== null;
  const [result] = await corePool.execute<ResultSetHeader>(
    `UPDATE core.campaigns SET ${fields.join(", ")} WHERE id = ?`,
    [...values, id],
  );
  return result.affectedRows > 0;
}

export async function getMembers(campaignId: number): Promise<CampaignMemberDB[]> {
  const [rows] = await corePool.execute<MemberRow[]>(
    `SELECT m.campaign_id, m.user_id, u.username, m.added_at
     FROM core.campaign_members m
     JOIN core.users u ON u.id = m.user_id
     WHERE m.campaign_id = ?
     ORDER BY u.username`,
    [campaignId],
  );
  return rows;
}

/** Adding an existing member changes nothing. */
export async function addMember(campaignId: number, userId: number): Promise<void> {
  await corePool.execute<ResultSetHeader>(
    `INSERT INTO core.campaign_members (campaign_id, user_id) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE added_at = added_at`,
    [campaignId, userId],
  );
}

/** False when there was no such membership. */
export async function removeMember(campaignId: number, userId: number): Promise<boolean> {
  const [result] = await corePool.execute<ResultSetHeader>(
    "DELETE FROM core.campaign_members WHERE campaign_id = ? AND user_id = ?",
    [campaignId, userId],
  );
  return result.affectedRows > 0;
}

export default {
  insertCampaign,
  getCampaignById,
  getAllCampaigns,
  getCampaignsForMember,
  isMember,
  updateCampaign,
  getMembers,
  addMember,
  removeMember,
};
