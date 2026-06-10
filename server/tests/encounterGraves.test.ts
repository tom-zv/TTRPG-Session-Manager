import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { DnD5eEncounterEngine } from "../src/services/encounters/dnd5e/dnd5eEncounterEngine.js";
import type { CombatProfileLoader } from "../src/services/encounters/dnd5e/dnd5eRequestHandler.js";
import { validateDnD5eEvent } from "../src/services/encounters/dnd5e/dnd5eEventValidator.js";
import type { DnD5eEncounterState } from "../../shared/domain/encounters/dnd5e/encounter.js";
import type { DnD5eEncounterEvent } from "../../shared/domain/encounters/dnd5e/events/types.js";
import { DnD5eEventProcessor } from "../../shared/domain/encounters/dnd5e/events/EventProcessor.js";
import { makeEntityStateful } from "../../shared/domain/encounters/dnd5e/events/modules/global.js";
import { normalizeDnD5eEncounterState } from "../../shared/domain/encounters/dnd5e/normalizeEncounterState.js";
import {
  resolveEncounterSettings, validateEntitySettingsPatch, validateEncounterSettingsPatch,
} from "../../shared/domain/encounters/dnd5e/settings.js";
import { mergeSettings } from "../../shared/domain/encounters/settings.js";
import { mergeUserPreferences, validatePreferencesPatch } from "../../shared/domain/users/preferences.js";
import type { UserDB } from "../src/api/users/types.js";
import type { EncounterOperation } from "../../shared/sockets/encounters/types.js";
import { LiveOperationQueue } from "../../client/src/pages/EncounterManager/services/LiveOperationQueue.js";
import { dnd5ePool, corePool } from "../src/db.js";
import dnd5eEntityModel from "../src/api/encounter/entities/dnd5e/dnd5eEntityModel.js";
import userModel from "../src/api/users/userModel.js";
import encounterModel from "../src/api/encounter/encounters/encounterModel.js";
import encounterService from "../src/api/encounter/encounters/encounterService.js";
import snapshotModel from "../src/api/encounter/encounters/dnd5e/dnd5eEncounterSnapshotsModel.js";
import { EncounterRequestQueue } from "../src/services/encounters/encounterRequestQueue.js";
import encounterController from "../src/api/encounter/encounters/encounterController.js";
import encounterEngineManager from "../src/services/encounters/encounterEngineManager.js";
import type { Request, Response } from "express";
import { EventEmitter } from "node:events";
import type { Namespace, Socket } from "socket.io";
import { registerEncounterRequestHandlers } from "../src/socket/namespaces/encounters/encounterRequestHandlers.js";
import { EncounterErrorCode, type EncounterError } from "../../shared/sockets/encounters/errors.js";
import type { SocketAck } from "../../shared/sockets/types.js";
import entityModel from "../src/api/encounter/entities/entityModel.js";
import entityService from "../src/api/encounter/entities/entityService.js";
import type { DnD5eEntityDetails } from "../../shared/domain/encounters/dnd5e/entity.js";
import { createEntityDraft } from "../../client/src/pages/EncounterManager/components/dnd5e/Shared/DnD5eEntityForm/model/draftTransforms.js";
import { parseEntityDraft } from "../../client/src/pages/EncounterManager/components/dnd5e/Shared/DnD5eEntityForm/model/validation.js";

afterEach(() => mock.restoreAll());

const gm: UserDB = { id: 1, username: "DM", password_hash: "", email: "", is_gm: true, last_login: "", created_at: "" };
const player: UserDB = { ...gm, id: 2, is_gm: false };
const defaultProfiles: CombatProfileLoader = async (ids) => ids.map((id) => ({ id, role: "creature", settings: {} }));

function state(count = 3, auto = false): DnD5eEncounterState {
  return {
    id: 12, system: "dnd5e", version: 0, currentRound: 1, currentTurn: 0,
    settings: { automation: { zeroHpTransfer: auto ? "auto" : "manual" } },
    initiativeOrder: Array.from({ length: count }, (_, index) => index),
    nextInstanceId: count,
    entityStates: Array.from({ length: count }, (_, index) => ({ ...makeEntityStateful(index + 100, index, 10), initiative: 20 - index })),
  };
}

class Engine extends DnD5eEncounterEngine {
  saved: DnD5eEncounterState[] = [];
  failSave = false;
  protected async persistSnapshot(snapshot: DnD5eEncounterState): Promise<void> {
    if (this.failSave) throw new Error("Storage unavailable");
    this.saved.push(structuredClone(snapshot));
  }
}

function request(events: DnD5eEncounterEvent[], requestId = crypto.randomUUID()) {
  return { encounterId: 12, requestId, requestedEvents: events };
}
const bury = (targetId: number): DnD5eEncounterEvent => ({ type: "moveToGrave", values: { targetId } });
const damage = (targetId: number, amount = 10): DnD5eEncounterEvent => ({ type: "damage", values: { sourceId: 1, targetId, amount } });

test("burial preserves combat data and identity; repeated burial/restoration is harmless", async () => {
  const initial = state();
  initial.entityStates[0].conditions = [{ name: "poisoned", duration: null, startedOnRound: 1 }];
  const engine = new Engine(initial);
  await engine.dispatch(request([bury(0)]), gm);
  assert.deepEqual(engine.snapshot().entityStates[0], { ...initial.entityStates[0], inGrave: true });
  assert.deepEqual(engine.snapshot().initiativeOrder, [1, 2]);
  await engine.dispatch(request([bury(0)]), gm);
  assert.equal(engine.snapshot().currentRound, 1);
  await engine.dispatch(request([{ type: "restoreFromGrave", values: { targetId: 0, hp: 0 } }]), gm);
  assert.deepEqual(engine.snapshot().initiativeOrder, [0, 1, 2]);
  assert.equal(engine.snapshot().initiativeOrder[engine.snapshot().currentTurn], 1);
  await engine.dispatch(request([{ type: "restoreFromGrave", values: { targetId: 0, hp: 5 } }]), gm);
  assert.equal(engine.snapshot().entityStates[0].currentHp, 0);
});

test("initiative edits, removals, wrapping, empty order and restoration preserve the right actor", () => {
  const combat = state(4);
  combat.currentTurn = 2;
  DnD5eEventProcessor.applyEvent(combat, bury(0));
  assert.equal(combat.initiativeOrder[combat.currentTurn], 2);
  DnD5eEventProcessor.applyEvent(combat, { type: "setInitiative", values: { targetId: 3, initiative: 100 } });
  assert.deepEqual(combat.initiativeOrder, [3, 1, 2]);
  assert.equal(combat.initiativeOrder[combat.currentTurn], 2);
  DnD5eEventProcessor.applyEvent(combat, bury(2));
  assert.equal(combat.initiativeOrder[combat.currentTurn], 3);
  assert.equal(combat.currentRound, 2);
  DnD5eEventProcessor.applyEvent(combat, { type: "removeEntity", values: { instanceId: 3 } });
  assert.equal(combat.initiativeOrder[combat.currentTurn], 1);
  DnD5eEventProcessor.applyEvent(combat, bury(1));
  assert.deepEqual(combat.initiativeOrder, []);
  assert.equal(combat.currentTurn, 0);
  const round = combat.currentRound;
  DnD5eEventProcessor.applyEvent(combat, { type: "nextTurn", values: {} });
  assert.equal(combat.currentRound, round);
  DnD5eEventProcessor.applyEvent(combat, { type: "restoreFromGrave", values: { targetId: 0, hp: 1 } });
  assert.deepEqual(combat.initiativeOrder, [0]);
});

for (const [role, enabled, shouldBury] of [
  ["creature", false, true], ["npc", false, true], ["npc", true, false], ["pc", false, false],
] as const) {
  test(`auto transfer: ${role}, death saves ${enabled}`, async () => {
    const engine = new Engine(state(1, true), async (ids) => ids.map((id) => ({ id, role, settings: { combat: { deathSaves: enabled } } })));
    const operation = await engine.dispatch(request([damage(0)]), gm);
    assert.equal(engine.snapshot().entityStates[0].inGrave, shouldBury);
    assert.deepEqual(operation.appliedEvents.map((event) => event.type), shouldBury ? ["damage", "moveToGrave"] : ["damage"]);
    const replay = state(1, true);
    operation.appliedEvents.forEach((event) => DnD5eEventProcessor.applyEvent(replay, event));
    replay.version = operation.version;
    assert.deepEqual(replay, engine.snapshot());
  });
}

for (const event of [damage(0), { type: "setHp", values: { targetId: 0, hp: 0 } }, { type: "setCurrentHp", values: { targetId: 0, hp: 0 } }] as DnD5eEncounterEvent[]) {
  test(`${event.type} can trigger auto transfer; manual mode does not`, async () => {
    const auto = new Engine(state(1, true), defaultProfiles);
    await auto.dispatch(request([event]), gm);
    assert.equal(auto.snapshot().entityStates[0].inGrave, true);
    assert.equal(auto.saved.length, 1);
    const manual = new Engine(state(1), defaultProfiles);
    await manual.dispatch(request([event]), gm);
    assert.equal(manual.snapshot().entityStates[0].inGrave, false);
  });
}

test("temporary HP absorption does not trigger burial", async () => {
  const initial = state(1, true);
  initial.entityStates[0].tempHp = 12;
  const engine = new Engine(initial, defaultProfiles);
  await engine.dispatch(request([damage(0)]), gm);
  assert.equal(engine.snapshot().entityStates[0].tempHp, 2);
  assert.equal(engine.snapshot().entityStates[0].currentHp, 10);
  assert.equal(engine.snapshot().entityStates[0].inGrave, false);
});

test("enabling auto and further damage at zero do not bury; healing grave members does not restore them", async () => {
  const initial = state(1);
  initial.entityStates[0].currentHp = 0;
  const engine = new Engine(initial, defaultProfiles);
  await engine.dispatch(request([{ type: "updateEncounterSettings", values: { patch: { automation: { zeroHpTransfer: "auto" } } } }, damage(0)]), gm);
  assert.equal(engine.snapshot().entityStates[0].inGrave, false);
  await engine.dispatch(request([bury(0), { type: "heal", values: { targetId: 0, sourceId: 1, amount: 5 } }]), gm);
  assert.equal(engine.snapshot().entityStates[0].currentHp, 5);
  assert.equal(engine.snapshot().entityStates[0].inGrave, true);
});

test("NPC defaults are consulted anew for all copies and encounters; disabling is not retroactive", async () => {
  let enabled = true;
  const loader: CombatProfileLoader = async (ids) => ids.map((id) => ({ id, role: "npc", settings: { combat: { deathSaves: enabled } } }));
  const initial = state(2, true);
  initial.entityStates[1].templateId = initial.entityStates[0].templateId;
  const first = new Engine(initial, loader);
  const second = new Engine(initial, loader);
  await first.dispatch(request([damage(0)]), gm);
  enabled = false;
  await first.dispatch(request([damage(0), damage(1)]), gm);
  await second.dispatch(request([damage(0)]), gm);
  assert.equal(first.snapshot().entityStates[0].inGrave, false);
  assert.equal(first.snapshot().entityStates[1].inGrave, true);
  assert.equal(second.snapshot().entityStates[0].inGrave, true);
});

test("manual death-save counters persist, stop short of burial, and clear on recovery", async () => {
  const engine = new Engine(state(1, true), async (ids) => ids.map((id) => ({ id, role: "pc", settings: {} })));
  await engine.dispatch(request([damage(0), { type: "setDeathSaves", values: { targetId: 0, successes: 0, failures: 3 } }]), gm);
  assert.equal(engine.snapshot().entityStates[0].inGrave, false);
  assert.equal(engine.snapshot().entityStates[0].deathSaveFailures, 3);
  await engine.dispatch(request([{ type: "heal", values: { targetId: 0, sourceId: 1, amount: 1 } }]), gm);
  assert.equal(engine.snapshot().entityStates[0].deathSaveFailures, 0);
  assert.equal(engine.saved.length, 2);
  await assert.rejects(engine.dispatch(request([{ type: "setDeathSaves", values: { targetId: 0, successes: 1, failures: 0 } }]), gm), /0 HP/);
});

test("reset revives grave members and clears combat counters, preserving encounter settings", async () => {
  const initial = state(2, true);
  initial.entityStates[0].inGrave = true;
  initial.entityStates[0].deathSaveFailures = 3;
  initial.initiativeOrder = [1];
  const engine = new Engine(initial);
  await engine.dispatch(request([{ type: "resetEncounter", values: {} }]), gm);
  assert.deepEqual(engine.snapshot().initiativeOrder, [0, 1]);
  assert.equal(engine.snapshot().settings.automation.zeroHpTransfer, "auto");
  assert.equal(engine.snapshot().currentRound, 0);
  assert(engine.snapshot().entityStates.every((entity) => !entity.inGrave && entity.currentHp === 10 && entity.deathSaveFailures === 0));
  await engine.dispatch(request([bury(0), { type: "removeEntity", values: { instanceId: 0 } }]), gm);
  assert.equal(engine.snapshot().entityStates.length, 1);
});

test("invalid events, missing targets, authorization and persistence failures leave no partial state", async () => {
  const engine = new Engine(state(2, true), defaultProfiles);
  const original = engine.snapshot();
  await assert.rejects(engine.dispatch(request([damage(0), bury(999)]), gm), /not found/);
  assert.deepEqual(engine.snapshot(), original);
  assert.equal(engine.saved.length, 0);
  for (const event of [bury(0), { type: "restoreFromGrave", values: { targetId: 0, hp: 1 } },
    { type: "setDeathSaves", values: { targetId: 0, successes: 0, failures: 0 } },
    { type: "updateEncounterSettings", values: { patch: {} } }] as DnD5eEncounterEvent[]) {
    await assert.rejects(engine.dispatch(request([event]), player), /Not authorized/);
  }
  engine.failSave = true;
  const failing = request([damage(0)]);
  await assert.rejects(engine.dispatch(failing, gm), /Storage/);
  assert.deepEqual(engine.snapshot(), original);
  assert.equal(engine.saved.length, 0);
  engine.failSave = false;
  const successful = await engine.dispatch(failing, gm);
  assert.equal(successful.version, 1);
  assert.deepEqual(await engine.dispatch(failing, gm), successful);
  assert.equal(engine.saved.length, 1);
});

test("every operation is stored before it takes effect, including plain HP changes", async () => {
  const engine = new Engine(state(2), defaultProfiles);
  await engine.dispatch(request([damage(0, 3)]), gm);
  await engine.dispatch(request([{ type: "setInitiative", values: { targetId: 1, initiative: 30 } }]), gm);
  await engine.dispatch(request([{ type: "nextTurn", values: {} }]), gm);
  assert.deepEqual(engine.saved.map((snapshot) => snapshot.version), [1, 2, 3]);
  assert.deepEqual(engine.saved.at(-1), engine.snapshot());
});

test("instance IDs are never reused and labels are assigned once", () => {
  const combat = state(0);
  const add = () => DnD5eEventProcessor.applyEvent(combat, { type: "addEntity", values: { templateId: 7, name: "Goblin", hp: 7 } });
  const labels = () => combat.entityStates.map((entity) => `${entity.instanceId}:${entity.displayName ?? ""}`);
  add();
  assert.deepEqual(labels(), ["0:"]);
  add();
  assert.deepEqual(labels(), ["0:Goblin 1", "1:Goblin 2"]);
  DnD5eEventProcessor.applyEvent(combat, { type: "removeEntity", values: { instanceId: 0 } });
  add();
  assert.deepEqual(labels(), ["1:Goblin 2", "2:Goblin 3"]);
  DnD5eEventProcessor.applyEvent(combat, { type: "removeEntity", values: { instanceId: 2 } });
  add();
  assert.deepEqual(labels(), ["1:Goblin 2", "3:Goblin 3"]);
  const legacy = state(2) as Partial<DnD5eEncounterState>;
  delete legacy.nextInstanceId;
  assert.equal(normalizeDnD5eEncounterState(legacy as DnD5eEncounterState).nextInstanceId, 2);
});

test("temporary HP is set to the given value and can be cleared", () => {
  const combat = state(1);
  DnD5eEventProcessor.applyEvent(combat, { type: "setTempHp", values: { targetId: 0, sourceId: 1, tempHp: 10 } });
  DnD5eEventProcessor.applyEvent(combat, { type: "setTempHp", values: { targetId: 0, sourceId: 1, tempHp: 4 } });
  assert.equal(combat.entityStates[0].tempHp, 4);
  DnD5eEventProcessor.applyEvent(combat, { type: "setTempHp", values: { targetId: 0, sourceId: 1, tempHp: 0 } });
  assert.equal(combat.entityStates[0].tempHp, 0);
});

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
  const remove = mock.method(entityModel, "deleteEntity", async () => true);
  const usage = mock.method(snapshotModel, "getEncounterIdsUsingTemplate", async () => [12, 15]);
  await assert.rejects(entityService.deleteEntity("dnd5e", 100), (error: { statusCode?: number; message: string }) =>
    error.statusCode === 409 && /2 encounters/.test(error.message));
  assert.equal(remove.mock.callCount(), 0);
  usage.mock.mockImplementation(async () => []);
  assert.equal(await entityService.deleteEntity("dnd5e", 100), true);
  assert.equal(remove.mock.callCount(), 1);
});

test("numeric and settings validation reject malformed or unsupported writes", () => {
  for (const amount of [-1, NaN, Infinity]) assert.throws(() => validateDnD5eEvent(damage(0, amount)));
  for (const failures of [-1, 0.5, 4, NaN]) assert.throws(() => validateDnD5eEvent({ type: "setDeathSaves", values: { targetId: 0, successes: 0, failures } }));
  assert.throws(() => validateEntitySettingsPatch({ combat: { deathSaves: "false" } }));
  assert.throws(() => validateEncounterSettingsPatch({ visibility: { hp: true } }));
  assert.throws(() => validateEncounterSettingsPatch({ automation: { zeroHpTransfer: "sometimes" } }));
  assert.throws(() => validatePreferencesPatch({ encounterDefaults: { unknownSystem: {} } }));
});

test("legacy snapshots retain manual behavior and 0-HP membership; settings merges preserve false and siblings", () => {
  const old = state(1) as Partial<DnD5eEncounterState>;
  delete old.settings;
  delete (old.entityStates![0] as { inGrave?: boolean }).inGrave;
  old.entityStates![0].currentHp = 0;
  const normalized = normalizeDnD5eEncounterState(old as DnD5eEncounterState);
  assert.equal(normalized.settings.automation.zeroHpTransfer, "manual");
  assert.equal(normalized.entityStates[0].inGrave, false);
  assert.deepEqual(normalized.initiativeOrder, [0]);
  const preferences = mergeUserPreferences({ theme: "dark", encounterDefaults: { dnd5e: { automation: { zeroHpTransfer: "auto" } } } }, { encounterDefaults: { dnd5e: { automation: { zeroHpTransfer: "manual" } } } });
  assert.equal(preferences.theme, "dark");
  assert.equal(preferences.encounterDefaults?.dnd5e?.automation?.zeroHpTransfer, "manual");
  assert.equal(mergeSettings({ combat: { deathSaves: true } }, { combat: { deathSaves: false } }).combat?.deathSaves, false);
});

test("new encounters copy DM defaults into independent snapshots", async () => {
  mock.method(userModel, "getPreferences", async () => ({ encounterDefaults: { dnd5e: { automation: { zeroHpTransfer: "auto" } } } }));
  mock.method(encounterModel, "insertEncounter", async () => 12);
  let created: DnD5eEncounterState | undefined;
  mock.method(snapshotModel, "createEncounterSnapshot", async (_id: number, snapshot: DnD5eEncounterState) => { created = structuredClone(snapshot); });
  await encounterService.insertEncounter("dnd5e", { system_id: 1, name: "Test" }, gm.id);
  assert.equal(created?.settings.automation.zeroHpTransfer, "auto");
  const defaults = resolveEncounterSettings();
  defaults.automation.zeroHpTransfer = "auto";
  assert.equal(resolveEncounterSettings().automation.zeroHpTransfer, "manual");
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
  mock.method(dnd5ePool, "getConnection", async () => connection);
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
  mock.method(corePool, "getConnection", async () => connection);
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
        operation.appliedEvents.forEach((event) => DnD5eEventProcessor.applyEvent(snapshot, event));
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

test("a rejected queue task does not leave an unhandled tail or block subsequent requests", async () => {
  const queue = new EncounterRequestQueue();
  await assert.rejects(queue.enqueue(12, async () => { throw new Error("Not authorized"); }), /Not authorized/);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(await queue.enqueue(12, async () => "next request"), "next request");
});

test("snapshot persistence round-trips grave state and normalizes older JSON strings", async () => {
  const combat = state(2, true);
  DnD5eEventProcessor.applyEvent(combat, bury(0));
  let stored = JSON.stringify(combat);
  mock.method(dnd5ePool, "execute", async (sql: string, parameters: unknown[]) => {
    if (sql.startsWith("SELECT")) return [[{ snapshot: stored }]];
    stored = String(parameters[0]);
    return [{ affectedRows: 1 }];
  });
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

test("REST state replacement is rejected while a live engine exists", async () => {
  mock.method(encounterEngineManager, "hasEngine", () => true);
  const save = mock.method(snapshotModel, "saveSnapshot", async () => {});
  let failure: unknown;
  await encounterController.saveEncounterState(
    { params: { id: "12", system: "dnd5e" }, body: { encounterState: state() } } as unknown as Request,
    {} as Response,
    (error) => { failure = error; },
  );
  assert.equal((failure as { statusCode: number }).statusCode, 409);
  assert.equal(save.mock.callCount(), 0);
});

test("NPC form round-trips death-save settings alongside the full entity snapshot", () => {
  const npc: DnD5eEntityDetails = {
    templateId: 100, name: "Rowan", createdAt: "", role: "npc", hp: 12, ac: 13,
    size: "medium", alignment: "neutral", speeds: { walk: 30 },
    abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    settings: { combat: { deathSaves: true } },
    traits: [{ name: "Brave", description: "Advantage against fear." }],
    actions: [{ name: "Sword", actionType: "action", description: "A sword attack." }],
    spellcasting: [{ name: "Magic", descriptions: ["Innate magic"], freqSpells: { will: ["Light"] } }],
  };
  const draft = createEntityDraft(npc);
  draft.settings.combat!.deathSaves = false;
  assert.equal(npc.settings?.combat?.deathSaves, true);
  const parsed = parseEntityDraft(draft);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.entity.settings?.combat?.deathSaves, false);
  assert.equal(parsed.entity.traits?.[0].name, "Brave");
  assert.equal(parsed.entity.actions?.[0].name, "Sword");
  assert.deepEqual(parsed.entity.spellcasting?.[0].freqSpells, { will: ["Light"] });
});
