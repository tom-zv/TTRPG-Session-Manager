import { UserDB } from "../users/types.js";

export interface SessionDB {
  token: string;
  user_id: number;
  created_at: string;
  expires_at: string;
}

export interface UserSessionDB {
  sessionDb: SessionDB;
  userDb: UserDB;
}
