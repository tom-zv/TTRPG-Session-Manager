export type UserRegistrationDTO = {
    username: string,
    password: string,
    email?: string,
    isGM: boolean,
}

/** What a GM sees when picking a user, for example to assign a character to a player. */
export interface UserSummaryDTO {
  id: number;
  username: string;
  isGm: boolean;
}

export interface UserDTO {
  id: number;
  username: string;
  email?: string;
  isGm: boolean;
  createdAt: string;
  lastLogin: string; 
}