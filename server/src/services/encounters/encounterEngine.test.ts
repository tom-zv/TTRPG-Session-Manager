import { afterEach, expect, test, vi } from "vitest";
import type { DnD5eEncounterEvent } from "shared/domain/encounters/dnd5e/events/types.js";
import {
  addEntity, combatProfile, damage, encounterEntity, encounterRequest, encounterState, encounterUser, removeEntity,
} from "../../../tests/fixtures/encounters.js";
import { RecordingEncounterEngine } from "../../../tests/support/encounterEngine.js";

const gm = encounterUser();
const bury = (targetId: number): DnD5eEncounterEvent => ({ type: "moveToGrave", values: { targetId } });
const setHidden = (targetId: number, hidden: boolean): DnD5eEncounterEvent => ({
  type: "setHidden", values: { targetId, hidden },
});
const phaseEvent = (type: "startCombat" | "nextTurn" | "endCombat" | "resetEncounter"): DnD5eEncounterEvent => ({
  type, values: {},
});

afterEach(() => vi.restoreAllMocks());

test("Dispatch advances the stored version by one and returns the request ID, encounter ID and applied events, including when baseVersion is stale.", async () => {
  const engine = new RecordingEncounterEngine(encounterState(undefined, { version: 7 }));
  const request = encounterRequest([damage(0, 3)], { baseVersion: 4 });

  const operation = await engine.dispatch(request, gm);

  expect(operation).toMatchObject({
    encounterId: request.encounterId,
    causedByRequestId: request.requestId,
    version: 8,
    appliedEvents: [damage(0, 3)],
  });
  const state = engine.snapshot();
  expect(state.version).toBe(8);
  expect(state.entityStates[0].currentHp).toBe(7);
  expect(engine.snapshots).toEqual([state]);
});

test("Retrying a committed request ID returns its original operation without reapplying or persisting it.", async () => {
  const engine = new RecordingEncounterEngine();
  const request = encounterRequest([damage(0, 2)]);
  const original = await engine.dispatch(request, gm);
  await engine.dispatch(encounterRequest([damage(0, 1)]), gm);
  const latest = engine.snapshot();

  expect(await engine.dispatch(request, gm)).toEqual(original);
  expect(latest.version).toBe(2);
  expect(latest.entityStates[0].currentHp).toBe(7);
  expect(engine.snapshot()).toEqual(latest);
  expect(engine.snapshots.map(({ version }) => version)).toEqual([1, 2]);
});

test("Only the last 500 committed request IDs suppress reapplication; retrying a retained ID does not refresh its age.", async () => {
  const engine = new RecordingEncounterEngine();
  const oldest = encounterRequest([damage(0, 1)]);
  const original = await engine.dispatch(oldest, gm);
  const nextOldest = encounterRequest([setHidden(1, true)]);
  const nextOperation = await engine.dispatch(nextOldest, gm);
  for (let index = 2; index < 500; index++) {
    await engine.dispatch(encounterRequest([setHidden(1, index % 2 === 0)]), gm);
  }

  expect(await engine.dispatch(oldest, gm)).toEqual(original);
  expect(engine.snapshot().version).toBe(500);

  await engine.dispatch(encounterRequest([setHidden(1, false)]), gm);
  expect(await engine.dispatch(nextOldest, gm)).toEqual(nextOperation);
  expect((await engine.dispatch(oldest, gm)).version).toBe(502);
  expect(engine.snapshot().entityStates[0].currentHp).toBe(8);
  expect(engine.snapshots).toHaveLength(502);
});

test("A pending snapshot save keeps the previous state visible and dispatch unresolved until persistence succeeds.", async () => {
  const engine = new RecordingEncounterEngine();
  const before = engine.snapshot();
  let saving!: () => void;
  const saveStarted = new Promise<void>((resolve) => { saving = resolve; });
  let release!: () => void;
  const savePending = new Promise<void>((resolve) => { release = resolve; });
  engine.beforeSnapshotSave = () => {
    saving();
    return savePending;
  };

  let resolved = false;
  const pending = engine.dispatch(encounterRequest([damage(0, 3)]), gm).then((operation) => {
    resolved = true;
    return operation;
  });

  try {
    await Promise.race([saveStarted, pending]);
    expect(resolved).toBe(false);
    expect(engine.snapshot()).toEqual(before);
    expect(engine.snapshots).toEqual([]);
  } finally {
    release();
    await pending;
  }

  expect((await pending).version).toBe(1);
  expect(engine.snapshot().entityStates[0].currentHp).toBe(7);
  expect(engine.snapshots).toEqual([engine.snapshot()]);
});

test("A failed snapshot save preserves state and version and permits the same request ID to succeed exactly once on retry.", async () => {
  const engine = new RecordingEncounterEngine();
  const before = engine.snapshot();
  const failure = new Error("Snapshot unavailable");
  const request = encounterRequest([damage(0, 3), removeEntity(1)]);
  engine.beforeSnapshotSave = async () => { throw failure; };

  await expect(engine.dispatch(request, gm)).rejects.toBe(failure);
  expect(engine.snapshot()).toEqual(before);
  expect(engine.snapshots).toEqual([]);
  expect(engine.memberships).toEqual([]);

  engine.beforeSnapshotSave = undefined;
  const operation = await engine.dispatch(request, gm);
  expect(operation.version).toBe(1);
  expect(await engine.dispatch(request, gm)).toEqual(operation);
  expect(engine.snapshot().entityStates.map(({ currentHp }) => currentHp)).toEqual([7]);
  expect(engine.snapshots).toEqual([engine.snapshot()]);
  expect(engine.memberships).toEqual([new Map([[100, 1]])]);
});

test("A failure after an earlier event changed the draft commits none of the request and leaves its ID retryable. (Missing target or wrong-phase later event.)", async () => {
  for (const { phase, lateEvent, error } of [
    { phase: "running", lateEvent: bury(999), error: /not found/ },
    { phase: "setup", lateEvent: phaseEvent("nextTurn"), error: /not running/ },
  ] as const) {
    const engine = new RecordingEncounterEngine(encounterState(undefined, { phase }));
    const before = engine.snapshot();
    const firstEvent = damage(0, 3);
    const failing = encounterRequest([firstEvent, lateEvent]);

    await expect(engine.dispatch(failing, gm)).rejects.toThrow(error);
    expect(engine.snapshot()).toEqual(before);
    expect(engine.snapshots).toEqual([]);
    expect(engine.memberships).toEqual([]);

    const operation = await engine.dispatch({ ...failing, requestedEvents: [firstEvent] }, gm);
    expect(operation).toMatchObject({ version: 1, appliedEvents: [firstEvent] });
    expect(engine.snapshot().entityStates[0].currentHp).toBe(7);
    expect(engine.snapshots).toEqual([engine.snapshot()]);
  }
});

test("Adding or removing copies persists the complete template-to-copy membership counts. (Include removal of the last copy.)", async () => {
  const engine = new RecordingEncounterEngine();

  await engine.dispatch(encounterRequest([addEntity(100)]), gm);
  await engine.dispatch(encounterRequest([removeEntity(0)]), gm);
  await engine.dispatch(encounterRequest([removeEntity(2)]), gm);

  expect(engine.memberships).toEqual([
    new Map([[100, 2], [101, 1]]),
    new Map([[100, 1], [101, 1]]),
    new Map([[101, 1]]),
  ]);
  expect(engine.snapshot().entityStates.map(({ templateId }) => templateId)).toEqual([101]);
});

test("HP, turn, grave and visibility changes leave membership untouched, as does a batch that restores identical copy counts.", async () => {
  const engine = new RecordingEncounterEngine();

  await engine.dispatch(encounterRequest([damage(0, 3)]), gm);
  await engine.dispatch(encounterRequest([phaseEvent("nextTurn")]), gm);
  expect(engine.snapshot().currentTurn).toBe(1);
  await engine.dispatch(encounterRequest([bury(0)]), gm);
  await engine.dispatch(encounterRequest([setHidden(0, true)]), gm);
  await engine.dispatch(encounterRequest([removeEntity(1), addEntity(101)]), gm);

  const snapshot = engine.snapshot();
  expect(snapshot.entityStates).toMatchObject([
    { instanceId: 0, templateId: 100, currentHp: 7, inGrave: true, hidden: true },
    { instanceId: 2, templateId: 101 },
  ]);
  expect(engine.snapshots.map(({ version }) => version)).toEqual([1, 2, 3, 4, 5]);
  expect(engine.memberships).toEqual([]);
});

test("A membership-save rejection leaves memory and version unchanged and the request ID retryable. (No claim of stored rollback; 02-F002.)", async () => {
  const engine = new RecordingEncounterEngine();
  const before = engine.snapshot();
  const failure = new Error("Membership unavailable");
  const request = encounterRequest([addEntity(100)]);
  engine.membershipSaveError = failure;

  await expect(engine.dispatch(request, gm)).rejects.toBe(failure);
  expect(engine.snapshot()).toEqual(before);
  expect(engine.memberships).toEqual([]);

  engine.membershipSaveError = undefined;
  const operation = await engine.dispatch(request, gm);
  expect(operation.version).toBe(1);
  expect(await engine.dispatch(request, gm)).toEqual(operation);
  expect(engine.snapshot().entityStates.filter(({ templateId }) => templateId === 100)).toHaveLength(2);
  expect(engine.snapshots.at(-1)).toEqual(engine.snapshot());
  expect(engine.memberships).toEqual([new Map([[100, 2], [101, 1]])]);
});

test.todo("02-F002: A membership persistence failure leaves the stored snapshot and membership at the previous operation");

test("Phase changes mirror active, completed and planned status, while ordinary combat changes do not rewrite status.", async () => {
  const engine = new RecordingEncounterEngine(encounterState(undefined, { phase: "setup" }));
  const send = (event: DnD5eEncounterEvent) => engine.dispatch(encounterRequest([event]), gm);

  await send(phaseEvent("startCombat"));
  expect(engine.snapshot().phase).toBe("running");
  expect(engine.statuses).toEqual(["active"]);

  await send(damage(0, 3));
  await send({ type: "setInitiative", values: { targetId: 1, initiative: 30 } });
  await send(phaseEvent("nextTurn"));
  expect(engine.statuses).toEqual(["active"]);

  await send(phaseEvent("endCombat"));
  expect(engine.snapshot().phase).toBe("ended");
  expect(engine.statuses).toEqual(["active", "completed"]);

  await send(phaseEvent("resetEncounter"));
  expect(engine.snapshot().phase).toBe("setup");
  expect(engine.statuses).toEqual(["active", "completed", "planned"]);
  expect(engine.snapshots.map(({ version }) => version)).toEqual([1, 2, 3, 4, 5, 6]);
});

test("Only starting combat selects the campaign's current encounter and only a reset after a start clears it; ending keeps it and a repeated start reports nothing.", async () => {
  const engine = new RecordingEncounterEngine(encounterState(undefined, { phase: "setup" }));
  const commit = (event: DnD5eEncounterEvent) => engine.commit(encounterRequest([event]), gm);

  expect((await commit(damage(0, 1))).currentEncounterChangedIn).toBeNull();
  const start = encounterRequest([phaseEvent("startCombat")]);
  expect((await engine.commit(start, gm)).currentEncounterChangedIn).toBe(1);
  expect((await engine.commit(start, gm)).currentEncounterChangedIn).toBeNull();
  expect((await commit(phaseEvent("nextTurn"))).currentEncounterChangedIn).toBeNull();
  expect((await commit(phaseEvent("endCombat"))).currentEncounterChangedIn).toBeNull();
  expect((await commit(phaseEvent("resetEncounter"))).currentEncounterChangedIn).toBe(1);
  // A reset during setup changes no phase and asks nothing of the selection.
  expect((await commit(phaseEvent("resetEncounter"))).currentEncounterChangedIn).toBeNull();
  expect((await commit(phaseEvent("startCombat"))).currentEncounterChangedIn).toBe(1);
  expect((await commit(phaseEvent("resetEncounter"))).currentEncounterChangedIn).toBe(1);

  expect(engine.selections).toEqual(["select", "clearIfCurrent", "select", "clearIfCurrent"]);
  expect(engine.transactions).toEqual(["committed", "committed", "committed", "committed"]);
});

test("A failed selection write fails the start: the encounter stays in setup with its version, nothing is stored and the same request succeeds once on retry.", async () => {
  const engine = new RecordingEncounterEngine(encounterState(undefined, { phase: "setup", version: 3 }));
  const start = encounterRequest([phaseEvent("startCombat")]);
  engine.selectionSaveError = new Error("selection write failed");

  await expect(engine.commit(start, gm)).rejects.toThrow("selection write failed");
  expect(engine.snapshot()).toMatchObject({ phase: "setup", version: 3 });
  expect(engine.snapshots).toEqual([]);
  expect(engine.statuses).toEqual([]);
  expect(engine.transactions).toEqual(["rolledBack"]);

  engine.selectionSaveError = undefined;
  const committed = await engine.commit(start, gm);
  expect(committed).toMatchObject({ operation: { version: 4 }, currentEncounterChangedIn: 1 });
  expect(engine.snapshot().phase).toBe("running");
  expect(engine.statuses).toEqual(["active"]);
  expect(engine.selections).toEqual(["select"]);
});

test("A status mirror failure still returns the committed operation and dedupes its retry.", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const engine = new RecordingEncounterEngine(encounterState(undefined, { phase: "setup" }));
  const failure = new Error("Status mirror unavailable");
  engine.statusSaveError = failure;
  const request = encounterRequest([phaseEvent("startCombat")]);

  const operation = await engine.dispatch(request, gm);
  expect(operation).toMatchObject({ version: 1, appliedEvents: request.requestedEvents });
  expect(engine.snapshot().phase).toBe("running");
  expect(engine.snapshots).toEqual([engine.snapshot()]);
  expect(log).toHaveBeenCalledWith(expect.any(String), failure);

  engine.statusSaveError = undefined;
  expect(await engine.dispatch(request, gm)).toEqual(operation);
  expect(engine.snapshots).toEqual([engine.snapshot()]);
  expect(engine.statuses).toEqual([]);
});

test("An HP follow-up failure still returns the committed operation and dedupes its retry.", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const engine = new RecordingEncounterEngine(
    encounterState([encounterEntity(0, { currentHp: 6 })]),
    async (ids) => ids.map((id) => combatProfile(id, { role: "pc" })),
  );
  const failure = new Error("Carried HP unavailable");
  engine.carriedHpSaveError = failure;
  const request = encounterRequest([phaseEvent("endCombat")]);

  const operation = await engine.dispatch(request, gm);
  expect(operation).toMatchObject({ version: 1, appliedEvents: request.requestedEvents });
  expect(engine.snapshot()).toMatchObject({ phase: "ended", entityStates: [{ currentHp: 6 }] });
  expect(engine.snapshots).toEqual([engine.snapshot()]);
  expect(engine.statuses).toEqual(["completed"]);
  expect(log).toHaveBeenCalledWith(expect.any(String), failure);

  engine.carriedHpSaveError = undefined;
  expect(await engine.dispatch(request, gm)).toEqual(operation);
  expect(engine.snapshots).toEqual([engine.snapshot()]);
  expect(engine.carriedHp).toEqual([]);
});

test("Cleanup persists the current state and complete membership without advancing its version.", async () => {
  const engine = new RecordingEncounterEngine(encounterState([
    encounterEntity(0), encounterEntity(1, { templateId: 100 }), encounterEntity(2),
  ], { version: 7 }));
  await engine.dispatch(encounterRequest([damage(0, 3), bury(1)]), gm);
  const current = engine.snapshot();

  await engine.cleanup();

  expect(current.version).toBe(8);
  expect(current.entityStates[1].inGrave).toBe(true);
  expect(engine.snapshots).toEqual([current, current]);
  expect(engine.memberships).toEqual([new Map([[100, 2], [102, 1]])]);
  expect(engine.snapshot()).toEqual(current);
});

test("Mutating the constructor input or a returned snapshot cannot alter subsequent dispatched state.", async () => {
  const initial = encounterState();
  const engine = new RecordingEncounterEngine(initial);
  initial.entityStates[0].conditions?.push({ name: "Poisoned", duration: null, startedOnRound: null });
  initial.initiativeOrder.reverse();
  initial.version = 10;
  const snapshot = engine.snapshot();
  snapshot.entityStates[0].currentHp = 1;
  snapshot.entityStates[0].conditions?.push({ name: "Charmed", duration: null, startedOnRound: null });
  snapshot.initiativeOrder.reverse();

  await engine.dispatch(encounterRequest([damage(0, 3)]), gm);

  expect(engine.snapshot()).toMatchObject({
    version: 1,
    initiativeOrder: [0, 1],
    entityStates: [{ currentHp: 7, conditions: [] }, { currentHp: 10, conditions: [] }],
  });
  expect(engine.snapshots).toEqual([engine.snapshot()]);
});
