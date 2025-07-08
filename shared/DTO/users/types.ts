export type UserRegistrationDTO = {
    username: string,
    password: string,
    email?: string,
    isDM: boolean,
}

export interface UserDTO {
  id: number;
  username: string;
  email?: string;
  isDm: boolean;
  createdAt: string;
  lastLogin: string; 
}