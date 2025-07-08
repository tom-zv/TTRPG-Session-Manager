import { RowDataPacket, ResultSetHeader } from "mysql2";
import { UserDB } from "./types.js";
import { corePool } from "src/db.js";


type DbRow<T> = T & RowDataPacket;
export type UserRow = DbRow<UserDB>;

export async function getUserById(id: number): Promise<UserDB | null> {
  const query = "SELECT * FROM users WHERE id = ?";

  const [rows] = await corePool.execute<UserRow[]>(query, [id]);

  return rows[0] ?? null;
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
  isDM: boolean
) {
  const query =
    "INSERT INTO users (username, password_hash, email, is_dm) VALUES (?, ?, ?, ?)";

  const [rows] = await corePool.execute<ResultSetHeader>(query, [
    username,
    password_hash,
    email,
    isDM,
  ]);

  return rows.insertId;
}

export async function updateLastLogin(userId: number) {
  const query = "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?";
  await corePool.execute(query, [userId]);
}

export default {
  getUserById,
  getUserByUsername,
  insertUserRecord,
  updateLastLogin,
  
};