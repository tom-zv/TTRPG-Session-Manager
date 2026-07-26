import { expect, test } from 'vitest';
import type { UserSessionDTO } from 'shared/DTO/auth/types.js';
import { createGm, factoryPassword } from '../../support/factories.js';
import { asToken, createHttpAgent } from '../../support/http.js';

test('a factory user can log in and authenticate; anonymous requests receive a JSON 401', async () => {
  const { user } = await createGm();
  const http = createHttpAgent();
  const login = await http.post('/api/auth/login')
    .send({ username: user.username, password: factoryPassword })
    .expect(200);
  const session = login.body as UserSessionDTO;
  expect(session.session.token).toMatch(/^[a-f0-9]{64}$/);
  expect(session.user).toMatchObject({ id: user.id, username: user.username, isGm: true });

  const authenticated = await asToken(http.get('/api/auth/user-session'), session.session.token)
    .expect(200);
  expect(authenticated.body).toMatchObject({
    user: { id: user.id, username: user.username, isGm: true },
    session: { token: session.session.token },
  });

  const anonymous = await http.get('/api/auth/user-session')
    .expect('Content-Type', /json/)
    .expect(401);
  expect(anonymous.body).toEqual({ message: expect.any(String) });
  expect(anonymous.body.message).not.toBe('');
});
