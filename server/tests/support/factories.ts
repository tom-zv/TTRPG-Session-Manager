import { randomUUID } from 'node:crypto';
import { login, registerUser } from '../../src/api/auth/authService.js';

export const factoryPassword = 'test-password-only';

async function createUser(isGM: boolean) {
  const username = `test-${randomUUID().slice(0, 24)}`;
  const user = await registerUser({
    username,
    password: factoryPassword,
    email: `${username}@example.test`,
    isGM,
  });
  const { sessionDb } = await login(username, factoryPassword);
  return { user, token: sessionDb.token };
}

export const createGm = () => createUser(true);
export const createPlayer = () => createUser(false);
