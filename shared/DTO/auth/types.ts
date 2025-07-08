import { UserDTO } from "../users/types.js";

export interface LoginDTO {
  username: string;
  password: string;
}

export interface sessionDTO{
  token: string;
  createdAt: string;
  expiresAt: string;
}

export interface UserSessionDTO {
  session: sessionDTO;
  user: UserDTO;
}