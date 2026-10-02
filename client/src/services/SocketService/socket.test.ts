import { afterEach, expect, test, vi } from "vitest";

type FakeIo = { auth: unknown; disconnected: boolean; disconnect: () => void; on: () => void };
const created: FakeIo[] = [];
vi.mock("socket.io-client", () => ({
  io: (_url: string, options: { auth: unknown }) => {
    const socket: FakeIo = { auth: options.auth, disconnected: false, disconnect: () => { socket.disconnected = true; }, on: () => {} };
    created.push(socket);
    return socket;
  },
}));

const { disconnectSocket, getSocket } = await import("./socket.js");

afterEach(() => {
  disconnectSocket();
  created.length = 0;
});

test("a cached socket is reused for its own session and replaced, disconnected, when another account signs in (S1-R1)", () => {
  localStorage.setItem("sessionToken", "gm-token");
  const gmSocket = getSocket("/encounter");
  expect(getSocket("/encounter")).toBe(gmSocket);
  expect(created.map((socket) => socket.auth)).toEqual([{ token: "gm-token" }]);

  localStorage.setItem("sessionToken", "player-token");
  const playerSocket = getSocket("/encounter");

  expect(playerSocket).not.toBe(gmSocket);
  expect(created.map((socket) => socket.auth)).toEqual([{ token: "gm-token" }, { token: "player-token" }]);
  expect(created[0].disconnected).toBe(true);
  expect(created[1].disconnected).toBe(false);
});
