import authModel from "./authModel.js";
import userModel from "../users/userModel.js";
import * as argon2 from "argon2";
import crypto from 'crypto';
import { NotFoundError, UnauthorizedError, ValidationError } from "../HttpErrors.js";
import { UserSessionDB } from "./types.js";
import usersModel from "../users/userModel.js";
import { UserDB } from "../users/types.js";


export async function registerUser(UserData: {
    username: string,
    password: string,
    email: string,
    isDM: boolean,
}) : Promise<UserDB>{
    
    const user = await usersModel.getUserByUsername(UserData.username);

    if (user) throw new ValidationError(`User name ${UserData.username} already exists`);

    const password_hash = await argon2.hash(UserData.password);

    const insertId = await usersModel.insertUserRecord(UserData.username, password_hash, UserData.email, UserData.isDM);

    if (!insertId) {
        throw new Error("Failed to register user");
    }

    const createdUser = await usersModel.getUserById(insertId);
    if (!createdUser) {
        throw new Error("Failed to retrieve created user");
    }
    
    return createdUser;
}

export async function login(username: string, password: string): Promise<UserSessionDB> {
  const userDb = await userModel.getUserByUsername(username);
  
  if (!userDb) {
    throw new UnauthorizedError("Incorrect username or password");
  }

  const isPasswordValid = await argon2.verify(userDb.password_hash, password);

  if (!isPasswordValid) {
    throw new UnauthorizedError("Incorrect username or password");
  }

  // Generate a random token
  const token = crypto.randomBytes(32).toString('hex');
  
  // Set expiration date to 10 years from now (effectively indefinite)
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 10);
  
  const affectedRows = await authModel.createSession(token, userDb.id, expiresAt);

  if (affectedRows !== 1) {
    throw new Error("Failed to create session");
  }
  
  const sessionDb = await authModel.getSessionByToken(token);
  await userModel.updateLastLogin(userDb.id);

  return {sessionDb, userDb}
}

export async function logout(token: string): Promise<void>{
  const session = await authModel.getSessionByToken(token);

  if (!session) {
    throw new NotFoundError("Session not found");
  }

  await authModel.deleteSession(token);
  
}

export default {
  registerUser,
  login,
  logout
};