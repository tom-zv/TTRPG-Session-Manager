import { sessionDTO, UserSessionDTO } from "shared/DTO/auth/types.js";
import { UserDTO } from "shared/DTO/users/types.js";
import { SessionDB, UserSessionDB } from "src/api/auth/types.js";
import { UserDB } from "src/api/users/types.js";

export function userToDto(user: UserDB): UserDTO {
  return {
    id: user.id,
    username: user.username,
    email: user.email || undefined,
    isDm: user.is_dm,
    createdAt: user.created_at,
    lastLogin: user.last_login
  };
}

export function sessionToDto(session: SessionDB): sessionDTO {
  return {
    token: session.token,
    createdAt: session.created_at,
    expiresAt: session.expires_at
  }
}
export function userSessionToDTO(userSession: UserSessionDB): UserSessionDTO{
  return {
    session: sessionToDto(userSession.sessionDb),
    user: userToDto(userSession.userDb)
  };
}
