import { RowDataPacket, ResultSetHeader } from "mysql2";
import { UserDB } from "./types.js";
import { corePool } from "src/db.js";
import { type UserPreferences, mergeUserPreferences } from "shared/domain/users/preferences.js";
import { readJsonObjectColumn } from "src/utils/jsonColumn.js";
import { NotFoundError } from "src/api/HttpErrors.js";


type DbRow<T> = T & RowDataPacket;
export type UserRow = DbRow<UserDB>;

export async function getUserById(id: number): Promise<UserDB | null> {
  const query = "SELECT * FROM users WHERE id = ?";

  const [rows] = await corePool.execute<UserRow[]>(query, [id]);

  return rows[0] ?? null;
}

export async function getAllUsers(): Promise<UserDB[]> {
  const [rows] = await corePool.execute<UserRow[]>("SELECT * FROM users ORDER BY username");
  return rows;
}

export async function getUserByUsername(
  username: string
): Promise<UserDB | null> {
  const query = "SELECT * FROM users WHERE username = ?";

  const [rows] = await corePool.execute<UserRow[]>(query, [username]);
  
  return rows[0] ?? null;
}

export async function insertUserRecord(
  username: string,
  password_hash: string,
  email: string,
  isGM: boolean
) {
  const query =
    "INSERT INTO users (username, password_hash, email, is_gm) VALUES (?, ?, ?, ?)";

  const [rows] = await corePool.execute<ResultSetHeader>(query, [
    username,
    password_hash,
    email,
    isGM,
  ]);

  return rows.insertId;
}

export async function updateLastLogin(userId: number) {
  const query = "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?";
  await corePool.execute(query, [userId]);
}

export default {
  getPreferences,
  patchPreferences,
  getUserById,
  getAllUsers,
  getUserByUsername,
  insertUserRecord,
  updateLastLogin,
  
};

export async function getPreferences(userId: number): Promise<UserPreferences> {
  const user = await getUserById(userId);
  if (!user) throw new NotFoundError("User not found");
  return readJsonObjectColumn(user.preferences) as UserPreferences;
}

export async function patchPreferences(userId: number, patch: Pick<UserPreferences, "encounterDefaults">): Promise<UserPreferences> {
  const connection = await corePool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<RowDataPacket[]>(
      "SELECT preferences FROM core.users WHERE id = ? FOR UPDATE", [userId],
    );
    if (!rows[0]) throw new NotFoundError("User not found");
    const preferences = mergeUserPreferences(readJsonObjectColumn(rows[0].preferences) as UserPreferences, patch);
    await connection.execute("UPDATE core.users SET preferences = ? WHERE id = ?", [JSON.stringify(preferences), userId]);
    await connection.commit();
    return preferences;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
