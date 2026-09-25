import { expect, test } from "vitest";
import { asToken, createHttpAgent } from "../../support/http.js";

test.each([
  ["regular signup", {}],
  ["a submitted role", { isGM: true }],
])("%s creates a player who can sign in", async (_case, extra) => {
  const agent = createHttpAgent();
  const credentials = { username: "new-player", password: "test-password" };
  const created = await agent.post("/api/auth/register")
    .send({ ...credentials, email: "player@example.test", ...extra }).expect(201);
  expect(created.body.isGm).toBe(false);

  const login = await agent.post("/api/auth/login").send(credentials).expect(200);
  expect(login.body.user.isGm).toBe(false);
  await asToken(agent.get("/api/users"), login.body.session.token).expect(403);
});
