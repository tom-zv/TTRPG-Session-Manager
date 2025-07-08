import { RowDataPacket, ResultSetHeader } from "mysql2";
import { corePool } from "src/db.js";
import { SessionDB } from "./types.js";
import { UserRow } from "../users/userModel.js";
import { UserDB } from "../users/types.js";


type SessionRow = SessionDB & RowDataPacket;
type userSessionRow = SessionRow & UserRow;

export async function getSessionByToken(token: string): Promise<SessionDB>{
  const query = "SELECT * FROM sessions WHERE token = ?";

  const [rows] = await corePool.execute<SessionRow[]>(query, [token]);
  return rows[0] ?? null;
}

export async function getUserByToken(token: string): Promise<UserDB | null> {
  const query = `SELECT u.*
                 FROM users u
                 join sessions s on u.id = s.user_id
                 WHERE s.token = ?`

  const [rows] = await corePool.execute<userSessionRow[]>(query, [token]);
  return rows[0] ?? null;
}

export async function createSession(
  token: string,
  user_id: number,
  expires_at: Date
): Promise<number> {
  const query = `
    INSERT INTO sessions (token, user_id, expires_at)
    VALUES (?, ?, ?)
  `;

  try {
    const [result] = await corePool.execute<ResultSetHeader>(
      query,
      [token, user_id, expires_at]
    );

    if (result.affectedRows !== 1) {
      throw new Error('Failed to create session');
    }

    return result.affectedRows;

  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === 'ER_DUP_ENTRY') {
      throw new Error('Session token collision — please retry');
    }
    throw new Error('Database error creating session');
  }
}

export async function deleteSession(token: string): Promise<void> {
  const query = "DELETE FROM sessions WHERE token = ?";
  
  try {
    const [result] = await corePool.execute<ResultSetHeader>(query, [token]);
    
    if (result.affectedRows === 0) {
      throw new Error('Session not found');
    }

  } catch {
    throw new Error('Database error deleting session');
  }
}


export default {
  getSessionByToken,
  getUserByToken,
  createSession,
  deleteSession
};

