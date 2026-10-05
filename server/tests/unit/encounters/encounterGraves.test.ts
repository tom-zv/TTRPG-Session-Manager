import assert from "node:assert/strict";
import { afterEach, vi, test } from "vitest";
import { DnD5eEncounterEngine } from "../../../src/services/encounters/dnd5e/dnd5eEncounterEngine.js";
import type { CombatProfileLoader } from "../../../src/services/encounters/dnd5e/dnd5eRequestHandler.js";
import type { EntityCombatProfile } from "../../../src/api/encounter/entities/dnd5e/dnd5eEntityModel.js";
import { registerEncounterLifecycleHandlers } from "../../../src/socket/namespaces/encounters/encounterLifecycleHandlers.js";
import { EncounterNotFoundError } from "../../../src/services/encounters/encounterSystems.js";
import type { EncounterJoinAck } from "../../../../shared/sockets/encounters/types.js";
import type { DnD5eEncounterState } from "../../../../shared/domain/encounters/dnd5e/encounter.js";
import type { DnD5eEncounterEvent } from "../../../../shared/domain/encounters/dnd5e/events/types.js";
import { DnD5eEventProcessor } from "../../../../shared/domain/encounters/dnd5e/events/EventProcessor.js";
import { makeEntityStateful } from "../../../../shared/domain/encounters/dnd5e/events/modules/global.js";
import { resolveEncounterSettings } from "../../../../shared/domain/encounters/dnd5e/settings.js";
import type { UserDB } from "../../../src/api/users/types.js";
import type { EncounterOperation } from "../../../../shared/sockets/encounters/types.js";
import { LiveOperationQueue } from "../../../../client/src/pages/EncounterManager/services/LiveOperationQueue.js";
import { dnd5ePool, corePool } from "../../../src/db.js";
import dnd5eEntityModel from "../../../src/api/encounter/entities/dnd5e/dnd5eEntityModel.js";
import userModel from "../../../src/api/users/userModel.js";
import encounterModel from "../../../src/api/encounter/encounters/encounterModel.js";
import campaignModel from "../../../src/api/campaigns/campaignModel.js";
import currentEncounterModel from "../../../src/api/campaigns/currentEncounterModel.js";
import encounterService from "../../../src/api/encounter/encounters/encounterService.js";
import snapshotModel from "../../../src/api/encounter/encounters/dnd5e/dnd5eEncounterSnapshotsModel.js";
import encounterEngineManager from "../../../src/services/encounters/encounterEngineManager.js";
import { EventEmitter } from "node:events";
import type { Namespace, Socket } from "socket.io";
import { registerEncounterRequestHandlers } from "../../../src/socket/namespaces/encounters/encounterRequestHandlers.js";
import { EncounterErrorCode, type EncounterError } from "../../../../shared/sockets/encounters/errors.js";
import type { SocketAck } from "../../../../shared/sockets/types.js";
import entityModel from "../../../src/api/encounter/entities/entityModel.js";
import entityService from "../../../src/api/encounter/entities/entityService.js";

afterEach(() => vi.restoreAllMocks());

const gm: UserDB = { id: 1, username: "DM", password_hash: "", email: "", is_gm: true, last_login: "", created_at: "" };
const player: UserDB = { ...gm, id: 2, is_gm: false };
const profile = (id: number, role: EntityCombatProfile["role"] = "creature", settings: EntityCombatProfile["settings"] = {}): EntityCombatProfile =>
  ({ id, name: `Template ${id}`, hp: 10, currentHp: null, role, settings, controllerUserIds: [] });
const defaultProfiles: CombatProfileLoader = async (ids) => ids.map((id) => profile(id));

function state(count = 3, auto = false): DnD5eEncounterState {
  return {
    id: 12, system: "dnd5e", version: 0, phase: "running", currentRound: 1, currentTurn: 0,
    settings: { ...resolveEncounterSettings(), automation: { zeroHpTransfer: auto ? "auto" : "manual" } },
    initiativeOrder: Array.from({ length: count }, (_, index) => index),
    nextInstanceId: count,
    entityStates: Array.from({ length: count }, (_, index) => ({ ...makeEntityStateful(index + 100, index, 10), initiative: 20 - index })),
  };
}

class Engine extends DnD5eEncounterEngine {
  saved: DnD5eEncounterState[] = [];
  protected async persistStatus(): Promise<void> {}
  protected async persistMembership(): Promise<void> {}
  protected async persistSnapshot(snapshot: DnD5eEncounterState): Promise<void> {
    this.saved.push(structuredClone(snapshot));
  }
}

function request(events: DnD5eEncounterEvent[], requestId = crypto.randomUUID()) {
  return { encounterId: 12, requestId, requestedEvents: events };
}
const bury = (targetId: number): DnD5eEncounterEvent => ({ type: "moveToGrave", values: { targetId } });
const damage = (targetId: number, amount = 10): DnD5eEncounterEvent => ({ type: "damage", values: { sourceId: 1, targetId, amount } });

test("malformed socket payloads are rejected through the acknowledgement, not by throwing", async () => {
  const socket = Object.assign(new EventEmitter(), { id: "socket-1", data: { user: player } });
  registerEncounterRequestHandlers({} as Namespace, socket as unknown as Socket);
  const rejections: unknown[] = [];
  const onRejection = (reason: unknown) => { rejections.push(reason); };
  process.on("unhandledRejection", onRejection);
  const acks: SocketAck[] = [];
  const errors: EncounterError[] = [];
  socket.on("error", () => {}); // An EventEmitter throws on an unhandled "error" event; a real socket does not.
  socket.emit = ((event: string, payload: EncounterError) => { if (event === "error") errors.push(payload); return true; }) as typeof socket.emit;
  const listener = socket.listeners("encounter:request")[0] as (payload: unknown, ack?: unknown) => Promise<void>;
  for (const payload of [null, undefined, "text", 42, {}, { encounterId: 12 }, { encounterId: 12, requestId: "a" },
    { encounterId: 12, requestId: "a", requestedEvents: "nope" }]) {
    await listener(payload, (ack: SocketAck) => acks.push(ack));
  }
  await listener(null, "not a function");
  await new Promise((resolve) => setImmediate(resolve));
  process.off("unhandledRejection", onRejection);
  assert.deepEqual(rejections, []);
  assert.equal(acks.length, 8);
  assert(acks.every((ack) => !ack.success));
  assert.equal(errors.length, 9);
  assert(errors.every((error) => error.code === EncounterErrorCode.INVALID_REQUEST));
});

test("an entity template in use by an encounter cannot be deleted", async () => {
  const remove = vi.spyOn(entityModel, "deleteEntity").mockImplementation(async () => true);
  const usage = vi.spyOn(encounterModel, "getEncounterIdsUsingEntity").mockImplementation(async () => [12, 15]);
  await assert.rejects(entityService.deleteEntity(100), (error: { statusCode?: number; message: string }) =>
    error.statusCode === 409 && /2 encounters/.test(error.message));
  assert.equal(remove.mock.calls.length, 0);
  usage.mockImplementation(async () => []);
  assert.equal(await entityService.deleteEntity(100), true);
  assert.equal(remove.mock.calls.length, 1);
});

test("new encounters copy DM defaults into independent snapshots", async () => {
  vi.spyOn(userModel, "getPreferences").mockImplementation(async () => ({ encounterDefaults: { dnd5e: { automation: { zeroHpTransfer: "auto" } } } }));
  vi.spyOn(campaignModel, "getCampaignById").mockImplementation(async (id) => ({ id, name: "Table", description: null, created_by: null, created_at: "" }));
  vi.spyOn(encounterModel, "insertEncounter").mockImplementation(async () => 12);
  let created: DnD5eEncounterState | undefined;
  vi.spyOn(snapshotModel, "createEncounterSnapshot").mockImplementation(async (_id: number, snapshot: DnD5eEncounterState) => { created = structuredClone(snapshot); });
  await encounterService.insertEncounter("dnd5e", { system_id: 1, campaign_id: 3, name: "Test" } as Parameters<typeof encounterService.insertEncounter>[1], gm);
  assert.equal(created?.settings.automation.zeroHpTransfer, "auto");
});

test("entity settings PATCH only locks and updates the entity row, preserving unrelated JSON", async () => {
  const statements: string[] = [];
  let written = "";
  const connection = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    execute: async (sql: string, params: unknown[]) => {
      statements.push(sql);
      if (sql.startsWith("SELECT")) return [[{ settings: { future: { color: "blue" }, combat: { deathSaves: true } } }]];
      written = String(params[0]);
      return [{}];
    },
  };
  vi.spyOn(dnd5ePool, "getConnection").mockImplementation((async () => connection) as unknown as typeof dnd5ePool.getConnection);
  await dnd5eEntityModel.patchSettings(100, { combat: { deathSaves: false } });
  assert.deepEqual(JSON.parse(written), { future: { color: "blue" }, combat: { deathSaves: false } });
  assert.equal(statements.length, 2);
  assert(statements[0].includes("FOR UPDATE"));
  assert(statements[1].startsWith("UPDATE dnd5e.entities SET settings"));
});

test("personal preference PATCH preserves other preference namespaces in a transaction", async () => {
  let written = "";
  const connection = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    execute: async (sql: string, params: unknown[]) => {
      if (sql.startsWith("SELECT")) return [[{ preferences: JSON.stringify({ theme: "dark", audio: { volume: 0.2 } }) }]];
      written = String(params[0]);
      return [{}];
    },
  };
  vi.spyOn(corePool, "getConnection").mockImplementation((async () => connection) as unknown as typeof corePool.getConnection);
  await userModel.patchPreferences(1, { encounterDefaults: { dnd5e: { automation: { zeroHpTransfer: "auto" } } } });
  assert.equal(JSON.parse(written).audio.volume, 0.2);
  assert.equal(JSON.parse(written).theme, "dark");
});

test("three clients replay burial/restoration, dedupe delivery and reconnect from snapshots", async () => {
  const engine = new Engine(state(2), defaultProfiles);
  const clients = Array.from({ length: 3 }, () => {
    let snapshot = engine.snapshot();
    let notifications = 0;
    const queue = new LiveOperationQueue<DnD5eEncounterEvent>({
      getVersion: () => snapshot.version, isReady: () => true,
      apply: (operation) => {
        operation.appliedEvents.forEach((event: DnD5eEncounterEvent) => DnD5eEventProcessor.applyEvent(snapshot, event));
        snapshot.version = operation.version;
        notifications++;
      },
      resync: async () => { snapshot = engine.snapshot(); }, onError: (error) => { throw error; },
    });
    return { queue, snapshot: () => snapshot, notifications: () => notifications };
  });
  const operation = await engine.dispatch(request([bury(0), bury(1)]), gm);
  clients.forEach((client) => { client.queue.receive(operation); client.queue.receive(operation); });
  clients.forEach((client) => {
    assert.deepEqual(client.snapshot(), engine.snapshot());
    assert.equal(client.notifications(), 1);
    assert.deepEqual(client.snapshot().initiativeOrder, []);
  });
  const restored = await engine.dispatch(request([{ type: "restoreFromGrave", values: { targetId: 1, hp: 2 } }]), gm);
  clients.forEach((client) => client.queue.receive(restored));
  const reconnect = new Engine(engine.saved.at(-1)!);
  clients.forEach((client) => { assert.deepEqual(client.snapshot(), reconnect.snapshot()); client.queue.dispose(); });
});

test("receive buffer handles snapshot bootstrapping, out-of-order operations and persistent gaps", async () => {
  let version = 0;
  let ready = false;
  let resyncs = 0;
  const applied: number[] = [];
  const operation = (v: number): EncounterOperation<DnD5eEncounterEvent> => ({ encounterId: 12, operationId: String(v), version: v, createdAt: "", appliedEvents: [] });
  const queue = new LiveOperationQueue<DnD5eEncounterEvent>({
    getVersion: () => version, isReady: () => ready,
    apply: (op) => { version = op.version; applied.push(version); },
    resync: async () => { resyncs++; version = 4; }, onError: (error) => { throw error; },
  });
  queue.receive(operation(2)); queue.receive(operation(1));
  ready = true;
  queue.flush();
  assert.deepEqual(applied, [1, 2]);
  queue.receive(operation(1));
  queue.receive(operation(5));
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(resyncs, 1);
  assert.deepEqual(applied, [1, 2, 5]);
  queue.dispose();
});

test("snapshot persistence round-trips grave state and normalizes older JSON strings", async () => {
  const combat = state(2, true);
  DnD5eEventProcessor.applyEvent(combat, bury(0));
  let stored = JSON.stringify(combat);
  vi.spyOn(dnd5ePool, "execute").mockImplementation((async (sql: string, parameters: unknown[]) => {
    if (sql.startsWith("SELECT")) return [[{ snapshot: stored }]];
    const [, snapshotJson] = parameters;
    stored = String(snapshotJson);
    return [{ affectedRows: 1 }];
  }) as unknown as typeof dnd5ePool.execute);
  await snapshotModel.saveSnapshot(12, combat);
  assert.deepEqual(await snapshotModel.getSnapshot(12), JSON.parse(JSON.stringify(combat)));
  const old = state(1) as Partial<DnD5eEncounterState>;
  delete old.settings;
  delete (old.entityStates![0] as { inGrave?: boolean }).inGrave;
  stored = JSON.stringify(old);
  const loaded = await snapshotModel.getSnapshot(12);
  assert.equal(loaded?.entityStates[0].inGrave, false);
  assert.equal(loaded?.settings.automation.zeroHpTransfer, "manual");
});

test("assigning a character checks that the users and the entity exist", async () => {
  vi.spyOn(userModel, "getUserById").mockImplementation(async (id: number) => (id === 2 ? player : null));
  const store = vi.spyOn(entityModel, "setEntityControllers").mockImplementation(async (entityId: number) => entityId === 100);
  assert.deepEqual(await entityService.setEntityControllers(100, [2, 2]), [2]);
  assert.deepEqual(store.mock.calls[0], [100, [2]]);
  await assert.rejects(entityService.setEntityControllers(100, [2, 9]), (error: { statusCode?: number }) => error.statusCode === 400);
  await assert.rejects(entityService.setEntityControllers(404, [2]), (error: { statusCode?: number }) => error.statusCode === 404);
  assert.deepEqual(await entityService.setEntityControllers(100, []), []);
});

test("joining loads the engine on demand and returns the current state; a missing encounter is refused", async () => {
  const engine = new Engine(state(2), defaultProfiles);
  await engine.dispatch(request([damage(0, 4)]), gm);
  const load = vi.spyOn(encounterEngineManager, "getOrLoadEngine").mockImplementation(async (id: number) => {
    if (id !== 12) throw new EncounterNotFoundError(id);
    return engine;
  });
  // The join boundary itself (membership, current encounter) is proven against SQL in
  // server/tests/integration/encounters/currentEncounter.int.test.ts; here the player is admitted.
  vi.spyOn(encounterModel, "getEncounterDetailsById").mockImplementation(async (id: number) =>
    id === 12 ? { id, system: "dnd5e", campaign_id: 1, name: "", description: "", status: "active", location: "", difficulty: "", gm_notes: [], created_at: "" } : null);
  vi.spyOn(campaignModel, "isMember").mockResolvedValue(true);
  vi.spyOn(currentEncounterModel, "getCurrentEncounterId").mockResolvedValue(12);
  const rooms: string[] = [];
  const emitted: EncounterError[] = [];
  const socket = Object.assign(new EventEmitter(), {
    id: "socket-join", disconnected: false, data: { user: player },
    join: (room: string) => { rooms.push(room); }, leave: () => {},
  });
  registerEncounterLifecycleHandlers(socket as unknown as Socket);
  socket.emit = ((event: string, payload: EncounterError) => { if (event === "error") emitted.push(payload); return true; }) as typeof socket.emit;
  const join = socket.listeners("encounter:join")[0] as (data: unknown, ack?: unknown) => Promise<void>;
  const acks: EncounterJoinAck[] = [];

  await join({ encounterId: 12 }, (ack: EncounterJoinAck) => acks.push(ack));
  assert.equal(load.mock.calls.length, 1);
  assert.deepEqual(acks[0], { success: true, encounterState: engine.snapshot() });
  assert(rooms.includes("encounter:12") && rooms.includes("encounter:12:players"));

  await join({ encounterId: 404 }, (ack: EncounterJoinAck) => acks.push(ack));
  assert.equal(acks[1].success, false);
  assert.equal(emitted.at(-1)?.code, EncounterErrorCode.ENCOUNTER_NOT_FOUND);
  for (const payload of [null, {}, { encounterId: "12" }]) await join(payload, (ack: EncounterJoinAck) => acks.push(ack));
  await join({ encounterId: 12 }, "not a function");
  assert.equal(acks.length, 5);
  assert(acks.slice(2).every((ack) => !ack.success));
  (socket.listeners("disconnect")[0] as () => void)();
});
