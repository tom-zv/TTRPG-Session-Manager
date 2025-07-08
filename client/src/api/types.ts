// api/types.ts
import type { UserDTO } from "shared/DTO/users/types.js";
import type { UserSessionDTO } from "shared/DTO/auth/types.js";

// This file contains type definitions for the API responses and requests.


// Basic type aliases
export type User = UserDTO;
export type UserSession = UserSessionDTO