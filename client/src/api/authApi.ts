import { LoginDTO } from "shared/DTO/auth/types.js";
import type { User, UserSession }  from "./types.js";
import { UserRegistrationDTO } from "shared/DTO/users/types.js";


const AUTH_API_URL = `/api/auth`;
const USERS_API_URL = `/api/users`;

export async function login(credentials: LoginDTO): Promise<UserSession>{
  const response = await fetch(`${AUTH_API_URL}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Login failed');
  }

  return response.json();
}

export async function logout(token: string) {
  const response = await fetch(`${AUTH_API_URL}/logout`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Logout failed');
  }

  return true;
}

export async function registerUser(userData: UserRegistrationDTO): Promise<User>{
  const response = await fetch(`${USERS_API_URL}/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(userData),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Registration failed');
  }

  return response.json();
}

export async function getCurrentUser(token: string) {
  const response = await fetch(`${AUTH_API_URL}/user-session`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    credentials: 'include',
  });

  if (!response.ok) {
    if (response.status === 401) {
      return null; // Not authenticated
    }
    const error = await response.json();
    throw new Error(error.message || 'Failed to get current user');
  }

  return response.json();
}