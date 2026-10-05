import { randomUUID } from "node:crypto";
import { expect, test, vi } from "vitest";
import type { Socket } from "socket.io-client";
import type { RowDataPacket } from "mysql2";
import type { DnD5eEncounterEvent } from "shared/domain/encounters/dnd5e/events/types.js";
import type { DnD5eEncounterState } from "shared/domain/encounters/dnd5e/encounter.js";
import type { DnD5eEntityDetails } from "shared/domain/encounters/dnd5e/entity.js";
import type { EncounterJoinAck, EncounterOperation } from "shared/sockets/encounters/types.js";
import type { CurrentEncounterDTO } from "shared/DTO/campaigns/types.js";
import encounterService from "src/api/encounter/encounters/encounterService.js";
import dnd5eEncounterSnapshotsModel from "src/api/encounter/encounters/dnd5e/dnd5eEncounterSnapshotsModel.js";
import { dnd5ePool, withTransaction } from "src/db.js";
import encounterEngineManager from "src/services/encounters/encounterEngineManager.js";
import { createCampaign, createGm, createPlayer } from "../../support/factories.js";
import { asToken, createHttpAgent } from "../../support/http.js";
import { emitWithAck, startSocketServer, waitForEvent } from "../../support/socket.js";

type Agent = ReturnType<typeof createHttpAgent>;
type Account = Awaited<ReturnType<typeof createGm>>;
type Ack = { success: boolean; error?: string };

async function createEncounter(gm: Account, campaignId: number, name: string): Promise<number> {
  return encounterService.insertEncounter("dnd5e", {
    system_id: await encounterService.getSystemId("dnd5e"),
    campaign_id: campaignId,
    name,
    gm_notes: [],
  }, gm.user);
}

async function createEntity(agent: Agent, gm: Account, name: string, role: "pc" | "npc" | "creature", controllers: number[] = []) {
  const response = await asToken(agent.post("/api/dnd5e/entities"), gm.token)
    .send({ data: { name: `${name} ${randomUUID().slice(0, 6)}`, role, hp: 20,
      ...(role === "npc" && { settings: { combat: { deathSaves: true } } }),
    } })
    .expect(201);
  const entity = (response.body as { entity: DnD5eEntityDetails }).entity;
  if (controllers.length) {
    await asToken(agent.put(`/api/dnd5e/entities/${entity.templateId}/controllers`), gm.token).send({ userIds: controllers }).expect(200);
  }
  return entity;
}

const send = (socket: Socket, encounterId: number, event: DnD5eEncounterEvent) =>
  emitWithAck(socket, "encounter:request", { encounterId, requestId: randomUUID(), requestedEvents: [event] }) as Promise<Ack>;

const join = (socket: Socket, encounterId: number) =>
  emitWithAck(socket, "encounter:join", { encounterId }) as Promise<EncounterJoinAck>;

const phase = (type: "startCombat" | "endCombat" | "resetEncounter"): DnD5eEncounterEvent => ({ type, values: {} });
const add = (entity: DnD5eEntityDetails, hidden = false): DnD5eEncounterEvent =>
  ({ type: "addEntity", values: { templateId: entity.templateId, name: entity.name, hp: entity.hp, ...(hidden ? { hidden } : {}) } });

const stored = async (encounterId: number) => (await dnd5eEncounterSnapshotsModel.getSnapshot(encounterId)) as DnD5eEncounterState;
const hpOf = async (encounterId: number) => (await stored(encounterId)).entityStates.map((entity) => entity.currentHp);

const historyOf = async (agent: Agent, account: Account, campaignId: number) =>
  ((await asToken(agent.get(`/api/campaigns/${campaignId}/encounter-history`), account.token).expect(200))
    .body as { encounters: CurrentEncounterDTO[] }).encounters.map((encounter) => encounter.id);

/**
 * Ashes: Bram (PC of `player`), Cora (PC of `other`), a goblin and a hidden lurker in Ambush,
 * started by the GM. `observer` is a member with no character in the fight.
 */
async function runningAmbush() {
  const agent = createHttpAgent();
  const gm = await createGm();
  const player = await createPlayer();
  const other = await createPlayer();
  const observer = await createPlayer();
  const campaign = await createCampaign(gm.user, { members: [player.user, other.user, observer.user] });
  const ambush = await createEncounter(gm, campaign.id, "Ambush");
  const bram = await createEntity(agent, gm, "Bram", "pc", [player.user.id]);
  const cora = await createEntity(agent, gm, "Cora", "pc", [other.user.id]);
  const goblin = await createEntity(agent, gm, "Goblin", "creature");
  const lurker = await createEntity(agent, gm, "Lurker", "creature", [player.user.id]);
  const server = await startSocketServer();
  const gmSocket = await server.connect("/encounter", gm.token);
  const playerSocket = await server.connect("/encounter", player.token);
  const observerSocket = await server.connect("/encounter", observer.token);
  expect(await join(gmSocket, ambush)).toMatchObject({ success: true });
  for (const event of [add(bram), add(cora), add(goblin), add(lurker, true), phase("startCombat")]) {
    expect(await send(gmSocket, ambush, event)).toEqual({ success: true });
  }
  expect(await join(playerSocket, ambush)).toMatchObject({ success: true });
  expect(await join(observerSocket, ambush)).toMatchObject({ success: true });
  // Instance IDs follow the order of addition.
  const ids = { bram: 0, cora: 1, goblin: 2, lurker: 3 };
  return { agent, gm, player, campaign, ambush, goblin, server, gmSocket, playerSocket, observerSocket, ids };
}

test("a player damages and heals other visible targets, runs only their own character, and is refused everything else", async () => {
  const { ambush, gmSocket, playerSocket, observerSocket, ids } = await runningAmbush();

  // Damage to another player's character reaches every board as an ordinary operation.
  const seenByGm = waitForEvent(gmSocket, "encounter:operation");
  const hit: DnD5eEncounterEvent = { type: "damage", values: { targetId: ids.cora, sourceId: ids.bram, amount: 6 } };
  expect(await send(playerSocket, ambush, hit)).toEqual({ success: true });
  expect(((await seenByGm)[0] as EncounterOperation).appliedEvents).toEqual([hit]);
  expect(await send(playerSocket, ambush, { type: "damage", values: { targetId: ids.goblin, sourceId: ids.bram, amount: 5 } }))
    .toEqual({ success: true });
  expect(await send(playerSocket, ambush, { type: "heal", values: { targetId: ids.cora, sourceId: ids.bram, amount: 2 } }))
    .toEqual({ success: true });

  // Own character: absolute HP, initiative and, once at 0 HP, death saves.
  for (const event of [
    { type: "setInitiative", values: { targetId: ids.bram, initiative: 25 } },
    { type: "setTempHp", values: { targetId: ids.bram, sourceId: ids.bram, tempHp: 3 } },
    { type: "setCurrentHp", values: { targetId: ids.bram, hp: 0 } },
    { type: "setDeathSaves", values: { targetId: ids.bram, successes: 1, failures: 2 } },
  ] satisfies DnD5eEncounterEvent[]) {
    expect(await send(playerSocket, ambush, event)).toEqual({ success: true });
  }
  expect((await stored(ambush)).entityStates).toMatchObject([
    { currentHp: 0, tempHp: 3, initiative: 25, deathSaveSuccesses: 1, deathSaveFailures: 2 },
    { currentHp: 16 },
    { currentHp: 15 },
    { currentHp: 20 },
  ]);
  const before = await stored(ambush);

  // Refused: a hidden target (even their own), another player's absolute HP, death saves of a
  // character that is not making them, maximum HP, turns and any write by an observer.
  const refusedOperations: EncounterOperation[] = [];
  const recordOperation = (operation: EncounterOperation) => refusedOperations.push(operation);
  playerSocket.on("encounter:operation", recordOperation);
  const refused: [Socket, DnD5eEncounterEvent][] = [
    [playerSocket, { type: "damage", values: { targetId: ids.lurker, sourceId: ids.bram, amount: 1 } }],
    [playerSocket, { type: "setCurrentHp", values: { targetId: ids.lurker, hp: 1 } }],
    [playerSocket, { type: "setCurrentHp", values: { targetId: ids.cora, hp: 1 } }],
    [playerSocket, { type: "setInitiative", values: { targetId: ids.cora, initiative: 1 } }],
    [playerSocket, { type: "setHp", values: { targetId: ids.bram, hp: 40 } }],
    [playerSocket, { type: "setCurrentHp", values: { targetId: ids.bram, hp: 40 } }],
    [playerSocket, { type: "nextTurn", values: {} }],
    [observerSocket, { type: "damage", values: { targetId: ids.goblin, sourceId: ids.goblin, amount: 1 } }],
    [observerSocket, { type: "heal", values: { targetId: ids.cora, sourceId: ids.cora, amount: 1 } }],
  ];
  for (const [socket, event] of refused) {
    expect(await send(socket, ambush, event)).toEqual({ success: false, error: `Not authorized to perform event: ${event.type}` });
  }
  expect(await send(playerSocket, ambush, { type: "setDeathSaves", values: { targetId: ids.cora, successes: 0, failures: 0 } }))
    .toMatchObject({ success: false });
  expect(await stored(ambush)).toEqual(before);
  expect(refusedOperations).toEqual([]);
  playerSocket.off("encounter:operation", recordOperation);

  const permitted = { type: "setCurrentHp", values: { targetId: ids.bram, hp: 20 } } as const;
  const atMax = waitForEvent(gmSocket, "encounter:operation");
  expect(await send(playerSocket, ambush, permitted)).toEqual({ success: true });
  expect((await atMax)[0]).toMatchObject({ appliedEvents: [permitted] });
  expect((await stored(ambush)).entityStates[ids.bram]).toMatchObject({ currentHp: 20, maxHp: 20 });
  expect(await send(gmSocket, ambush, { ...permitted, values: { targetId: ids.bram, hp: 40 } })).toEqual({ success: true });
  expect((await stored(ambush)).entityStates[ids.bram]).toMatchObject({ currentHp: 40, maxHp: 40 });
});

test("a player write waiting on its snapshot is rolled back when another fight becomes current", async () => {
  const { agent, gm, campaign, ambush, goblin, server, gmSocket, playerSocket, ids } = await runningAmbush();
  const bridge = await createEncounter(gm, campaign.id, "Bridge");
  const gmOnBridge = await server.connect("/encounter", gm.token);
  expect(await join(gmOnBridge, bridge)).toMatchObject({ success: true });
  expect(await send(gmOnBridge, bridge, add(goblin))).toEqual({ success: true });

  const before = await stored(ambush);
  const operations: EncounterOperation[] = [];
  gmSocket.on("encounter:operation", (operation: EncounterOperation) => operations.push(operation));
  const event: DnD5eEncounterEvent = { type: "damage", values: { targetId: ids.goblin, sourceId: ids.bram, amount: 4 } };
  const pending = await withTransaction(dnd5ePool, async (blocker) => {
    await blocker.execute("SELECT encounter_id FROM dnd5e.encounter_snapshots WHERE encounter_id = ? FOR UPDATE", [ambush]);
    const result = send(playerSocket, ambush, event);
    try {
      await vi.waitFor(async () => {
        const [waits] = await dnd5ePool.execute<RowDataPacket[]>(
          `SELECT 1 FROM performance_schema.data_lock_waits w
           JOIN performance_schema.data_locks l ON l.ENGINE_LOCK_ID = w.REQUESTING_ENGINE_LOCK_ID
           WHERE l.OBJECT_SCHEMA = 'dnd5e' AND l.OBJECT_NAME = 'encounter_snapshots'`,
        );
        expect(waits).not.toHaveLength(0);
      });
      expect(await send(gmOnBridge, bridge, phase("startCombat"))).toEqual({ success: true });
      expect((await asToken(agent.get(`/api/campaigns/${campaign.id}/current-encounter`), gm.token).expect(200)).body)
        .toMatchObject({ encounter: { id: bridge } });
      expect(await stored(ambush)).toEqual(before);
      return { result };
    } catch (error) {
      void result.catch(() => {});
      throw error;
    }
  });

  expect(await pending.result).toEqual({ success: false, error: "This encounter is no longer the campaign's current encounter" });
  expect(await stored(ambush)).toEqual(before);
  // A fresh join flushes earlier room packets on this socket and also checks the in-memory engine.
  expect(await join(gmSocket, ambush)).toMatchObject({ success: true, encounterState: before });
  expect(operations).toEqual([]);
});

test("buried targets and a player with only buried or hidden combatants must wait for the GM to restore a combatant", async () => {
  const { ambush, gmSocket, playerSocket, ids } = await runningAmbush();
  const amount = { sourceId: ids.bram, amount: 1 };
  expect(await send(gmSocket, ambush, { type: "moveToGrave", values: { targetId: ids.goblin } })).toEqual({ success: true });
  for (const type of ["damage", "heal"] as const) {
    expect(await send(playerSocket, ambush, { type, values: { ...amount, targetId: ids.goblin } }))
      .toEqual({ success: false, error: `Not authorized to perform event: ${type}` });
  }
  expect(await send(gmSocket, ambush, { type: "moveToGrave", values: { targetId: ids.bram } })).toEqual({ success: true });
  const before = await stored(ambush);
  for (const event of [
    { type: "damage", values: { ...amount, targetId: ids.cora } },
    { type: "heal", values: { ...amount, targetId: ids.cora } },
    { type: "setCurrentHp", values: { targetId: ids.bram, hp: 1 } },
    { type: "setTempHp", values: { targetId: ids.bram, sourceId: ids.bram, tempHp: 1 } },
    { type: "setInitiative", values: { targetId: ids.bram, initiative: 25 } },
    { type: "setDeathSaves", values: { targetId: ids.bram, successes: 0, failures: 0 } },
  ] satisfies DnD5eEncounterEvent[]) {
    expect(await send(playerSocket, ambush, event)).toEqual({ success: false, error: `Not authorized to perform event: ${event.type}` });
  }
  expect(await stored(ambush)).toEqual(before);
  expect(await send(gmSocket, ambush, { type: "restoreFromGrave", values: { targetId: ids.bram, hp: 10 } })).toEqual({ success: true });
  expect(await send(playerSocket, ambush, { type: "damage", values: { ...amount, targetId: ids.cora } })).toEqual({ success: true });
});

test("a controlled NPC with concealed HP takes values and death saves only from the GM, while initiative and amount changes stay available", async () => {
  const { agent, gm, player, ambush, gmSocket, playerSocket, ids } = await runningAmbush();
  const companion = await createEntity(agent, gm, "Companion", "npc", [player.user.id]);
  expect(await send(gmSocket, ambush, add(companion))).toEqual({ success: true });
  const targetId = 4;
  const setTemp = (tempHp: number): DnD5eEncounterEvent => ({ type: "setTempHp", values: { targetId, tempHp, sourceId: ids.bram } });
  const setCurrentHp = { type: "setCurrentHp", values: { targetId, hp: 0 } } as const;
  const setSaves = { type: "setDeathSaves", values: { targetId, successes: 1, failures: 0 } } as const;

  for (const monsterHp of ["status", "hidden"] as const) {
    expect(await send(gmSocket, ambush, { type: "updateEncounterSettings", values: { patch: { visibility: { monsterHp } } } }))
      .toEqual({ success: true });
    expect(await send(gmSocket, ambush, setCurrentHp)).toEqual({ success: true });
    const before = await stored(ambush);
    for (const event of [setCurrentHp, setTemp(4), setSaves]) {
      expect(await send(playerSocket, ambush, event)).toEqual({ success: false, error: `Not authorized to perform event: ${event.type}` });
    }
    expect(await stored(ambush)).toEqual(before);

    expect(await send(gmSocket, ambush, setSaves)).toEqual({ success: true });
    expect(await send(gmSocket, ambush, setTemp(4))).toEqual({ success: true });
    expect((await stored(ambush)).entityStates[targetId]).toMatchObject({ currentHp: 0, tempHp: 4, deathSaveSuccesses: 1 });
    expect(await send(gmSocket, ambush, setTemp(0))).toEqual({ success: true });
    expect(await send(playerSocket, ambush, { type: "setInitiative", values: { targetId, initiative: 24 } })).toEqual({ success: true });
    const amount = { targetId, sourceId: ids.bram, amount: 2 };
    expect(await send(playerSocket, ambush, { type: "heal", values: amount })).toEqual({ success: true });
    expect(await send(playerSocket, ambush, { type: "damage", values: { ...amount, amount: 1 } })).toEqual({ success: true });
    expect((await stored(ambush)).entityStates[targetId]).toMatchObject({ currentHp: 1, tempHp: 0, initiative: 24 });
  }

  expect(await send(gmSocket, ambush, { type: "updateEncounterSettings", values: { patch: { visibility: { monsterHp: "exact" } } } }))
    .toEqual({ success: true });
  for (const event of [setCurrentHp, setTemp(3), setSaves]) {
    expect(await send(playerSocket, ambush, event)).toEqual({ success: true });
  }
});

test("a request sent from a board that another start has replaced changes nothing; after End the final board is read-only", async () => {
  const { agent, gm, campaign, ambush, goblin, server, playerSocket, ids } = await runningAmbush();
  const bridge = await createEncounter(gm, campaign.id, "Bridge");
  const gmOnBridge = await server.connect("/encounter", gm.token);
  expect(await join(gmOnBridge, bridge)).toMatchObject({ success: true });
  expect(await send(gmOnBridge, bridge, add(goblin))).toEqual({ success: true });
  expect(await send(gmOnBridge, bridge, phase("startCombat"))).toEqual({ success: true });

  // The player is still in Ambush's room; their damage arrives after Bridge became current.
  const hpBefore = await hpOf(ambush);
  expect(await send(playerSocket, ambush, { type: "damage", values: { targetId: ids.goblin, sourceId: ids.bram, amount: 4 } }))
    .toEqual({ success: false, error: "This encounter is no longer the campaign's current encounter" });
  expect(await hpOf(ambush)).toEqual(hpBefore);

  // Bridge ends and stays the board, read-only for players; the GM still edits it.
  expect(await join(playerSocket, bridge)).toMatchObject({ success: true });
  expect(await send(gmOnBridge, bridge, phase("endCombat"))).toEqual({ success: true });
  expect(await send(playerSocket, bridge, { type: "damage", values: { targetId: 0, sourceId: 0, amount: 1 } }))
    .toMatchObject({ success: false });
  expect(await send(gmOnBridge, bridge, { type: "damage", values: { targetId: 0, sourceId: 0, amount: 1 } }))
    .toEqual({ success: true });
  expect((await asToken(agent.get(`/api/campaigns/${campaign.id}/current-encounter`), gm.token).expect(200)).body)
    .toMatchObject({ encounter: { id: bridge } });
});

test("history lists ended fights by phase only; players open them read-only; reset and delete take them out", async () => {
  const { agent, gm, player, campaign, ambush, goblin, server, playerSocket, ids } = await runningAmbush();
  const outsider = await createPlayer();
  const elsewhere = await createCampaign(gm.user, { members: [outsider.user] });
  const gmSocket = await server.connect("/encounter", gm.token);
  expect(await join(gmSocket, ambush)).toMatchObject({ success: true });

  // A planned encounter whose status label says completed is still prep.
  const labelled = await createEncounter(gm, campaign.id, "Labelled");
  await asToken(agent.put(`/api/dnd5e/encounters/${labelled}`), gm.token).send({ data: { status: "completed" } }).expect(200);
  expect(await historyOf(agent, player, campaign.id)).toEqual([]);

  expect(await send(gmSocket, ambush, phase("endCombat"))).toEqual({ success: true });
  const bridge = await createEncounter(gm, campaign.id, "Bridge");
  expect(await join(gmSocket, bridge)).toMatchObject({ success: true });
  expect(await send(gmSocket, bridge, add(goblin))).toEqual({ success: true });
  expect(await send(gmSocket, bridge, phase("startCombat"))).toEqual({ success: true });
  expect(await send(gmSocket, bridge, phase("endCombat"))).toEqual({ success: true });
  expect(await historyOf(agent, player, campaign.id)).toEqual([bridge, ambush]);
  await asToken(agent.get(`/api/campaigns/${campaign.id}/encounter-history`), outsider.token).expect(404);
  expect(await historyOf(agent, gm, elsewhere.id)).toEqual([]);

  // Starting a third fight makes Ambush and Bridge history only; the player can still open both.
  const third = await createEncounter(gm, campaign.id, "Third");
  expect(await join(gmSocket, third)).toMatchObject({ success: true });
  expect(await send(gmSocket, third, add(goblin))).toEqual({ success: true });
  expect(await send(gmSocket, third, phase("startCombat"))).toEqual({ success: true });
  expect(await join(playerSocket, ambush)).toMatchObject({ success: true, encounterState: { phase: "ended" } });
  expect(await send(playerSocket, ambush, { type: "damage", values: { targetId: ids.goblin, sourceId: ids.bram, amount: 1 } }))
    .toEqual({ success: false, error: "This encounter is no longer the campaign's current encounter" });
  // Neither the label nor membership opens prep; an outsider opens no history.
  expect(await join(playerSocket, labelled)).toMatchObject({ success: false, error: "Encounter not found" });
  const outsiderSocket = await server.connect("/encounter", outsider.token);
  expect(await join(outsiderSocket, ambush)).toMatchObject({ success: false, error: "Encounter not found" });

  // Resetting a past fight (not current) returns it to prep, out of history, and the third stays current.
  expect(await join(gmSocket, ambush)).toMatchObject({ success: true });
  expect(await send(gmSocket, ambush, phase("resetEncounter"))).toEqual({ success: true });
  expect(await historyOf(agent, player, campaign.id)).toEqual([bridge]);
  const fresh = await server.connect("/encounter", player.token);
  expect(await join(fresh, ambush)).toMatchObject({ success: false, error: "Encounter not found" });
  await asToken(agent.delete(`/api/dnd5e/encounters/${bridge}`), gm.token).expect(200);
  expect(await historyOf(agent, player, campaign.id)).toEqual([]);
  expect((await asToken(agent.get(`/api/campaigns/${campaign.id}/current-encounter`), player.token).expect(200)).body)
    .toMatchObject({ encounter: { id: third } });
});

test("opening and unloading an older past fight preserves its place until its snapshot changes", async () => {
  const { agent, gm, player, campaign, ambush, goblin, gmSocket, playerSocket, observerSocket, ids } = await runningAmbush();
  expect(await send(gmSocket, ambush, phase("endCombat"))).toEqual({ success: true });
  const bridge = await createEncounter(gm, campaign.id, "Bridge");
  expect(await join(gmSocket, bridge)).toMatchObject({ success: true });
  for (const event of [add(goblin), phase("startCombat"), phase("endCombat")]) {
    expect(await send(gmSocket, bridge, event)).toEqual({ success: true });
  }
  // Distinct ages avoid a wait for timestamp precision. The older snapshot needs load-time defaults.
  await dnd5ePool.execute(
    `UPDATE dnd5e.encounter_snapshots SET snapshot_at = ?, snapshot = JSON_REMOVE(snapshot, '$.settings') WHERE encounter_id = ?`,
    ["2020-01-01 00:00:00", ambush],
  );
  await dnd5ePool.execute("UPDATE dnd5e.encounter_snapshots SET snapshot_at = ? WHERE encounter_id = ?", ["2020-01-02 00:00:00", bridge]);
  expect(await historyOf(agent, player, campaign.id)).toEqual([bridge, ambush]);

  await encounterEngineManager.discardEngine(ambush);
  expect(await join(playerSocket, ambush)).toMatchObject({ success: true, encounterState: { phase: "ended" } });
  expect(await join(playerSocket, bridge)).toMatchObject({ success: true });
  expect(await join(observerSocket, bridge)).toMatchObject({ success: true });
  await encounterEngineManager.cleanupEngine(ambush, { onlyIfInactive: true });
  expect(encounterEngineManager.hasEngine(ambush)).toBe(false);
  expect(await historyOf(agent, player, campaign.id)).toEqual([bridge, ambush]);

  expect(await join(gmSocket, ambush)).toMatchObject({ success: true });
  expect(await send(gmSocket, ambush, { type: "damage", values: { targetId: ids.goblin, sourceId: ids.bram, amount: 1 } }))
    .toEqual({ success: true });
  expect(await historyOf(agent, player, campaign.id)).toEqual([ambush, bridge]);
});
