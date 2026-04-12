export type UserRegistrationDTO = {
    username: string,
    password: string,
    email?: string,
    isGM: boolean,
}

export interface UserDTO {
  id: number;
  username: string;
  email?: string;
  isGm: boolean;
  createdAt: string;
  lastLogin: string; 
}