import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { DnD5eEncounterState } from "shared/domain/encounters/dnd5e/encounter.js";
import snapshotModel from "src/api/encounter/encounters/dnd5e/dnd5eEncounterSnapshotsModel.js";
import encounterModel from "src/api/encounter/encounters/encounterModel.js";
import { encounterRequest, encounterState, encounterUser } from "../../../tests/fixtures/encounters.js";
import connections from "./encounterConnectionManager.js";
import type { IEncounterEngine } from "./encounterEngine.js";
import { EncounterEngineManager } from "./encounterEngineManager.js";
import { EncounterNotFoundError } from "./encounterSystems.js";

const encounterId = 12;
const socketId = "encounter-manager-test-socket";
const inactivityWindow = 5 * 60 * 1000;
const gm = encounterUser();
let manager: EncounterEngineManager;

function modelStorage() {
  let stored = encounterState(undefined, { id: encounterId });
  const metadata = vi.spyOn(encounterModel, "getEncounterDetailsById").mockResolvedValue({
    id: encounterId,
    system: "dnd5e",
    campaign_id: 1,
    name: "Test encounter",
    description: "",
    status: "active",
    location: "",
    difficulty: "",
    gm_notes: [],
    created_at: "",
  });
  const load = vi.spyOn(snapshotModel, "getSnapshot").mockImplementation(async () => structuredClone(stored));
  const writes: { id: number; snapshot: DnD5eEncounterState }[] = [];
  const save = vi.spyOn(snapshotModel, "saveSnapshot").mockImplementation(async (id, state) => {
    stored = structuredClone(state);
    writes.push({ id, snapshot: stored });
  });
  const memberships: { id: number; copies: Map<number, number> }[] = [];
  vi.spyOn(encounterModel, "replaceEncounterEntities").mockImplementation(async (id, copies) => {
    memberships.push({ id, copies: new Map(copies) });
  });
  return { metadata, load, save, writes, memberships };
}

const setTempHp = (engine: IEncounterEngine, tempHp: number) =>
  engine.dispatch(encounterRequest([{ type: "setTempHp", values: { targetId: 0, sourceId: 1, tempHp } }], {
    encounterId,
  }), gm);

function leaveAndStartExpiry() {
  expect(connections.removeUserBySocketId(socketId)).toBe(encounterId);
  manager.startInactivityTimeout(encounterId);
}

beforeEach(() => {
  vi.useFakeTimers();
  manager = new EncounterEngineManager();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  connections.removeUserBySocketId(socketId);
  manager.discardEngine(encounterId);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test("Concurrent loads share one engine and later loads retain its dispatched state.", async () => {
  const { load } = modelStorage();
  let release!: () => void;
  const holdLoad = new Promise<void>((resolve) => { release = resolve; });
  const initial = encounterState();
  load.mockImplementationOnce(async () => {
    await holdLoad;
    return initial;
  });

  const first = manager.getOrLoadEngine(encounterId);
  const second = manager.getOrLoadEngine(encounterId);
  release();
  const [engine, concurrentEngine] = await Promise.all([first, second]);

  expect(concurrentEngine).toBe(engine);
  expect(load).toHaveBeenCalledExactlyOnceWith(encounterId);
  const operation = await setTempHp(engine, 4);
  const loadedAgain = await manager.getOrLoadEngine(encounterId);
  expect(loadedAgain).toBe(engine);
  expect(loadedAgain.snapshot()).toMatchObject({ version: operation.version, entityStates: [{ tempHp: 4 }, { tempHp: 0 }] });
  expect(load).toHaveBeenCalledTimes(1);
});

test("A rejected initial load rejects its waiters but does not poison a later load attempt.", async () => {
  const { load } = modelStorage();
  const failure = new Error("Snapshot read unavailable");
  load.mockRejectedValueOnce(failure);

  const first = manager.getOrLoadEngine(encounterId);
  const second = manager.getOrLoadEngine(encounterId);
  await Promise.all([expect(first).rejects.toBe(failure), expect(second).rejects.toBe(failure)]);
  expect(manager.getEngine(encounterId)).toBeNull();

  const engine = await manager.getOrLoadEngine(encounterId);
  expect(engine.snapshot()).toEqual(encounterState());
  expect(manager.getEngine(encounterId)).toBe(engine);
});

test("An inactive engine persists and is evicted only after five minutes, and a later load reconstructs stored state.", async () => {
  const { writes, memberships } = modelStorage();
  const engine = await manager.getOrLoadEngine(encounterId);
  connections.addUser(encounterId, socketId);
  await setTempHp(engine, 4);
  const current = engine.snapshot();
  leaveAndStartExpiry();

  await vi.advanceTimersByTimeAsync(inactivityWindow - 1);
  expect(manager.getEngine(encounterId)).toBe(engine);
  expect(writes).toEqual([{ id: encounterId, snapshot: current }]);
  expect(memberships).toEqual([]);

  await vi.advanceTimersByTimeAsync(1);
  expect(manager.getEngine(encounterId)).toBeNull();
  expect(writes).toEqual([
    { id: encounterId, snapshot: current },
    { id: encounterId, snapshot: current },
  ]);
  expect(memberships).toEqual([{ id: encounterId, copies: new Map([[100, 1], [101, 1]]) }]);

  const reloaded = await manager.getOrLoadEngine(encounterId);
  expect(reloaded).not.toBe(engine);
  expect(reloaded.snapshot()).toEqual(current);
});

test("Reacquiring an engine cancels its inactivity expiry and a later last-leave starts a fresh five-minute window.", async () => {
  const { writes } = modelStorage();
  const engine = await manager.getOrLoadEngine(encounterId);
  connections.addUser(encounterId, socketId);
  leaveAndStartExpiry();
  await vi.advanceTimersByTimeAsync(inactivityWindow - 1);

  expect(await manager.getOrLoadEngine(encounterId)).toBe(engine);
  // The socket is tracked after reacquiring the engine in the join flow.
  await vi.advanceTimersByTimeAsync(1);
  expect(manager.getEngine(encounterId)).toBe(engine);
  expect(writes).toEqual([]);

  connections.addUser(encounterId, socketId);
  leaveAndStartExpiry();
  await vi.advanceTimersByTimeAsync(inactivityWindow - 1);
  expect(manager.getEngine(encounterId)).toBe(engine);
  expect(writes).toEqual([]);

  await vi.advanceTimersByTimeAsync(1);
  expect(manager.getEngine(encounterId)).toBeNull();
  expect(writes).toEqual([{ id: encounterId, snapshot: engine.snapshot() }]);
});

test("Inactive-only cleanup retains an engine when a socket is present before cleanup or arrives during its pending save.", async () => {
  const { save, writes, memberships } = modelStorage();
  const engine = await manager.getOrLoadEngine(encounterId);
  const current = engine.snapshot();
  connections.addUser(encounterId, socketId);

  await manager.cleanupEngine(encounterId, { onlyIfInactive: true });
  expect(manager.getEngine(encounterId)).toBe(engine);
  expect(writes).toEqual([]);
  expect(memberships).toEqual([]);

  connections.removeUserBySocketId(socketId);
  let started!: () => void;
  const saveStarted = new Promise<void>((resolve) => { started = resolve; });
  let release!: () => void;
  const holdSave = new Promise<void>((resolve) => { release = resolve; });
  save.mockImplementationOnce(async (id, snapshot) => {
    started();
    await holdSave;
    writes.push({ id, snapshot: structuredClone(snapshot) });
  });

  const cleanup = manager.cleanupEngine(encounterId, { onlyIfInactive: true });
  try {
    await Promise.race([saveStarted, cleanup]);
    connections.addUser(encounterId, socketId);
    expect(manager.getEngine(encounterId)).toBe(engine);
    expect(writes).toEqual([]);
  } finally {
    release();
    await cleanup;
  }

  expect(writes).toEqual([{ id: encounterId, snapshot: current }]);
  expect(memberships).toEqual([{ id: encounterId, copies: new Map([[100, 1], [101, 1]]) }]);
  expect(manager.getEngine(encounterId)).toBe(engine);
  expect(engine.snapshot()).toEqual(current);
});

test("A failed cleanup retains the engine and its state for a later successful cleanup.", async () => {
  const { save, writes, memberships } = modelStorage();
  const engine = await manager.getOrLoadEngine(encounterId);
  await setTempHp(engine, 4);
  const current = engine.snapshot();
  const failure = new Error("Cleanup write unavailable");
  save.mockRejectedValueOnce(failure);

  await expect(manager.cleanupEngine(encounterId, { onlyIfInactive: true })).rejects.toBe(failure);
  expect(manager.getEngine(encounterId)).toBe(engine);
  expect(engine.snapshot()).toEqual(current);
  expect(writes).toEqual([{ id: encounterId, snapshot: current }]);
  expect(memberships).toEqual([]);

  await manager.cleanupEngine(encounterId, { onlyIfInactive: true });
  expect(manager.getEngine(encounterId)).toBeNull();
  expect(writes).toEqual([
    { id: encounterId, snapshot: current },
    { id: encounterId, snapshot: current },
  ]);
  expect(memberships).toEqual([{ id: encounterId, copies: new Map([[100, 1], [101, 1]]) }]);
});

test("Discarding a deleted encounter cancels expiry and drops its engine without saving it.", async () => {
  const { metadata, writes, memberships } = modelStorage();
  await manager.getOrLoadEngine(encounterId);
  connections.addUser(encounterId, socketId);
  leaveAndStartExpiry();
  const timersBeforeDiscard = vi.getTimerCount();

  metadata.mockResolvedValue(null);
  manager.discardEngine(encounterId);

  expect(manager.getEngine(encounterId)).toBeNull();
  expect(vi.getTimerCount()).toBe(timersBeforeDiscard - 1);
  await expect(manager.getOrLoadEngine(encounterId)).rejects.toBeInstanceOf(EncounterNotFoundError);
  await vi.advanceTimersByTimeAsync(inactivityWindow);
  expect(writes).toEqual([]);
  expect(memberships).toEqual([]);
});

test.todo("02-F003: Inactivity cleanup cannot overwrite an operation committed after a rejoin");
