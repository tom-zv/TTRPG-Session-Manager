import { ValidationError } from "src/api/HttpErrors.js";

export function validateUserInput({
  username,
  password,
  email,
}: {
  username?: string;
  password?: string;
  email?: string;
}) {
  // DB limits: username: 32, email: 128
  if (username !== undefined) {
    if (typeof username !== "string" || username.length < 1) {
      throw new ValidationError("Invalid username");
    }
    if (username.length > 32) {
      throw new ValidationError("Username must be at most 32 characters");
    }
  }
  if (password !== undefined) {
    if (typeof password !== "string" || password.length < 6) {
      throw new ValidationError("Password must be at least 6 characters");
    }
    if (password.length > 128) {
      throw new ValidationError("Password must be at most 128 characters");
    }
  }
  if (email !== undefined) {
    if (typeof email !== "string" || email.length < 3) {
      throw new ValidationError("Invalid email format");
    }
    if (email.length > 128) {
      throw new ValidationError("Email must be at most 128 characters");
    }
    // Simple email regex: checks for non-whitespace before/after '@', and at least one '.' after '@'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ValidationError("Invalid email format");
    }
  }
}