import { expect, test } from "vitest";
import { EncounterConnectionManager } from "./encounterConnectionManager.js";

test("Repeated tracking of one socket counts once, while a second socket keeps the encounter occupied after the first leaves.", () => {
  const connections = new EncounterConnectionManager();
  connections.addUser(12, "first");
  connections.addUser(12, "first");
  expect(connections.getUserCount(12)).toBe(1);

  connections.addUser(12, "second");
  expect(connections.getUserCount(12)).toBe(2);
  expect(connections.removeUser(12, "first")).toBe(false);
  expect(connections.getUserCount(12)).toBe(1);
  expect(connections.getEncounterIdBySocketId("first")).toBeNull();
  expect(connections.getEncounterIdBySocketId("second")).toBe(12);
});

test("A socket cannot belong to two encounters until it leaves its first encounter.", () => {
  const connections = new EncounterConnectionManager();
  connections.addUser(12, "socket");

  expect(() => connections.addUser(13, "socket")).toThrow();
  expect(connections.getEncounterIdBySocketId("socket")).toBe(12);
  expect(connections.getUserCount(12)).toBe(1);
  expect(connections.getUserCount(13)).toBe(0);

  expect(connections.removeUser(12, "socket")).toBe(true);
  connections.addUser(13, "socket");
  expect(connections.getEncounterIdBySocketId("socket")).toBe(13);
  expect(connections.getUserCount(13)).toBe(1);
});

test("Disconnect identifies an encounter for inactivity only after its last socket leaves, and repeated removal is harmless.", () => {
  const connections = new EncounterConnectionManager();
  connections.addUser(12, "first");
  connections.addUser(12, "second");
  connections.addUser(13, "other");

  expect(connections.removeUserBySocketId("first")).toBeNull();
  expect(connections.removeUserBySocketId("first")).toBeNull();
  expect(connections.getUserCount(12)).toBe(1);
  expect(connections.removeUserBySocketId("second")).toBe(12);
  expect(connections.removeUserBySocketId("second")).toBeNull();
  expect(connections.getUserCount(12)).toBe(0);
  expect(connections.getEncounterIdBySocketId("other")).toBe(13);
  expect(connections.getUserCount(13)).toBe(1);
});
