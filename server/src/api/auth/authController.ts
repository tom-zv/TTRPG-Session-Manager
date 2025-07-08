import { Request, Response, NextFunction } from "express";
import authService from "./authService.js";
import { ValidationError } from "../HttpErrors.js";
import { userSessionToDTO, userToDto } from "src/utils/format-transformers/users-transformer.js";


export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      throw new ValidationError("Username and password required");
    }

    const userSession = await authService.login(username, password);

    const userSessionDTO = userSessionToDTO(userSession);
    res.status(200).json(userSessionDTO);
  } catch (error) {
    next(error);
  }
};

export const logout = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token =
      req.headers.authorization?.replace("Bearer ", "") || req.query.token;

    if (!token) {
      throw new ValidationError("Session token required");
    }

    await authService.logout(token as string);
    
    res.status(205).end();

  } catch (error) {
    next(error);
  }
};

export const registerUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { username, password, email, isDM } = req.body;

    if (!username || !password || !email || typeof isDM !== "boolean") {
      throw new ValidationError("Missing required fields");
    }

    const createdUser = await authService.registerUser({ username, password, email, isDM });

    const userDTO = userToDto(createdUser);

    res.status(201).json(userDTO);
  } catch (error) {
    next(error);
  }
};

export default {
  login,
  logout,
  registerUser
};
