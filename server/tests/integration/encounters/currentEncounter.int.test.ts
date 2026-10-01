import { randomUUID } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import type { Socket } from "socket.io-client";
import type { DnD5eEncounterEvent } from "shared/domain/encounters/dnd5e/events/types.js";
import type { EncounterJoinAck, EncounterOperation } from "shared/sockets/encounters/types.js";
import type { DnD5eEntityDetails } from "shared/domain/encounters/dnd5e/entity.js";
import { CampaignSocketEvents } from "shared/sockets/campaigns/types.js";
import encounterService from "src/api/encounter/encounters/encounterService.js";
import currentEncounterModel from "src/api/campaigns/currentEncounterModel.js";
import encounterModel from "src/api/encounter/encounters/encounterModel.js";
import dnd5eEncounterSnapshotsModel from "src/api/encounter/encounters/dnd5e/dnd5eEncounterSnapshotsModel.js";
import encounterRequestQueue from "src/services/encounters/encounterRequestQueue.js";
import encounterEngineManager from "src/services/encounters/encounterEngineManager.js";
import { createCampaign, createGm, createPlayer } from "../../support/factories.js";
import { asToken, createHttpAgent } from "../../support/http.js";
import { emitWithAck, startSocketServer, waitForEvent } from "../../support/socket.js";

type Agent = ReturnType<typeof createHttpAgent>;
type Account = Awaited<ReturnType<typeof createGm>>;

afterEach(() => vi.restoreAllMocks());

async function createEncounter(gm: Account, campaignId: number, name: string): Promise<number> {
  return encounterService.insertEncounter("dnd5e", {
    system_id: await encounterService.getSystemId("dnd5e"),
    campaign_id: campaignId,
    name,
    gm_notes: [{ text: "secret plan", timestamp: "" }],
  }, gm.user);
}

async function createEntity(agent: Agent, gm: Account): Promise<DnD5eEntityDetails> {
  const response = await asToken(agent.post("/api/dnd5e/entities"), gm.token)
    .send({ data: { name: `Goblin ${randomUUID().slice(0, 6)}`, role: "creature", hp: 7 } })
    .expect(201);
  return (response.body as { entity: DnD5eEntityDetails }).entity;
}

const send = (socket: Socket, encounterId: number, event: DnD5eEncounterEvent) =>
  emitWithAck(socket, "encounter:request", {
    encounterId,
    requestId: randomUUID(),
    requestedEvents: [event],
  }) as Promise<{ success: boolean; error?: string }>;

const join = (socket: Socket, encounterId: number) =>
  emitWithAck(socket, "encounter:join", { encounterId }) as Promise<EncounterJoinAck>;

const phase = (type: "startCombat" | "endCombat" | "resetEncounter"): DnD5eEncounterEvent => ({ type, values: {} });

/** Join as the GM, add one combatant and start combat. */
async function prepareAndStart(gmSocket: Socket, encounterId: number, entity: DnD5eEntityDetails) {
  expect(await join(gmSocket, encounterId)).toMatchObject({ success: true });
  expect(await send(gmSocket, encounterId, {
    type: "addEntity", values: { templateId: entity.templateId, name: entity.name, hp: entity.hp },
  })).toEqual({ success: true });
  expect(await send(gmSocket, encounterId, phase("startCombat"))).toEqual({ success: true });
}

const currentOf = async (agent: Agent, account: Account, campaignId: number) =>
  (await asToken(agent.get(`/api/campaigns/${campaignId}/current-encounter`), account.token).expect(200))
    .body.encounter as { id: number; name: string; gmNotes?: unknown } | null;

test("a start selects the board after commit, end keeps it, another campaign is untouched, and reset/delete of A after B leaves B", async () => {
  const agent = createHttpAgent();
  const gm = await createGm();
  const player = await createPlayer();
  const outsider = await createPlayer();
  const ashes = await createCampaign(gm.user, { members: [player.user] });
  const brine = await createCampaign(gm.user, { members: [outsider.user] });
  const a = await createEncounter(gm, ashes.id, "Ambush at the ford");
  const b = await createEncounter(gm, ashes.id, "Bridge of bones");
  const elsewhere = await createEncounter(gm, brine.id, "Wreck of the Gull");
  const entity = await createEntity(agent, gm);
  const server = await startSocketServer();
  const gmSocket = await server.connect("/encounter", gm.token);
  const playerSocket = await server.connect("/encounter", player.token);
  const otherGmSocket = await server.connect("/encounter", gm.token);

  // Opening prep selects nothing; a player cannot join it and the campaign waits.
  expect(await join(gmSocket, a)).toMatchObject({ success: true });
  expect(await currentOf(agent, player, ashes.id)).toBeNull();
  expect(await join(playerSocket, a)).toMatchObject({ success: false, error: "Encounter not found" });
  // Editing the status label is metadata only.
  await asToken(agent.put(`/api/dnd5e/encounters/${a}`), gm.token).send({ data: { status: "active" } });
  expect(await currentOf(agent, player, ashes.id)).toBeNull();

  expect(await emitWithAck(playerSocket, CampaignSocketEvents.WATCH, { campaignId: ashes.id })).toEqual({ success: true });
  const startedA = waitForEvent(playerSocket, CampaignSocketEvents.CURRENT_ENCOUNTER_CHANGED);
  await prepareAndStart(gmSocket, a, entity);
  expect(await startedA).toEqual([{ campaignId: ashes.id }]);
  const shown = await currentOf(agent, player, ashes.id);
  expect(shown).toMatchObject({ id: a, name: "Ambush at the ford" });
  expect(shown).not.toHaveProperty("gmNotes");

  // The player joins the current board and receives ordinary operations on the existing stream.
  expect(await join(playerSocket, a)).toMatchObject({ success: true, encounterState: { phase: "running" } });
  const operation = waitForEvent(playerSocket, "encounter:operation");
  expect(await send(gmSocket, a, { type: "damage", values: { targetId: 0, sourceId: 0, amount: 2 } })).toEqual({ success: true });
  expect(((await operation)[0] as EncounterOperation).encounterId).toBe(a);

  // A start in another campaign leaves this board; End keeps it.
  await prepareAndStart(otherGmSocket, elsewhere, entity);
  expect(await currentOf(agent, gm, brine.id)).toMatchObject({ id: elsewhere });
  expect(await currentOf(agent, player, ashes.id)).toMatchObject({ id: a });
  expect(await send(gmSocket, a, phase("endCombat"))).toEqual({ success: true });
  expect(await currentOf(agent, player, ashes.id)).toMatchObject({ id: a });

  // B replaces A; then resetting and deleting A leave B selected.
  const startedB = waitForEvent(playerSocket, CampaignSocketEvents.CURRENT_ENCOUNTER_CHANGED);
  await prepareAndStart(otherGmSocket, b, entity);
  expect(await startedB).toEqual([{ campaignId: ashes.id }]);
  expect(await currentOf(agent, player, ashes.id)).toMatchObject({ id: b });
  expect(await send(gmSocket, a, phase("resetEncounter"))).toEqual({ success: true });
  expect(await currentOf(agent, player, ashes.id)).toMatchObject({ id: b });
  await asToken(agent.delete(`/api/dnd5e/encounters/${a}`), gm.token).expect(200);
  expect(await currentOf(agent, player, ashes.id)).toMatchObject({ id: b });

  // Resetting the current board clears it, and deleting a current one clears it too.
  const cleared = waitForEvent(playerSocket, CampaignSocketEvents.CURRENT_ENCOUNTER_CHANGED);
  expect(await send(otherGmSocket, b, phase("resetEncounter"))).toEqual({ success: true });
  expect(await cleared).toEqual([{ campaignId: ashes.id }]);
  expect(await currentOf(agent, player, ashes.id)).toBeNull();
  expect(await send(otherGmSocket, b, phase("startCombat"))).toEqual({ success: true });
  const deleted = waitForEvent(playerSocket, CampaignSocketEvents.CURRENT_ENCOUNTER_CHANGED);
  await asToken(agent.delete(`/api/dnd5e/encounters/${b}`), gm.token).expect(200);
  expect(await deleted).toEqual([{ campaignId: ashes.id }]);
  expect(await currentOf(agent, player, ashes.id)).toBeNull();
  expect(await currentOf(agent, gm, brine.id)).toMatchObject({ id: elsewhere });
});

test("a failed start leaves the encounter in setup and the campaign waiting, and the retry selects it", async () => {
  const agent = createHttpAgent();
  const gm = await createGm();
  const player = await createPlayer();
  const campaign = await createCampaign(gm.user, { members: [player.user] });
  const encounterId = await createEncounter(gm, campaign.id, "Ambush");
  const entity = await createEntity(agent, gm);
  const server = await startSocketServer();
  const gmSocket = await server.connect("/encounter", gm.token);
  expect(await join(gmSocket, encounterId)).toMatchObject({ success: true });
  expect(await send(gmSocket, encounterId, {
    type: "addEntity", values: { templateId: entity.templateId, name: entity.name, hp: entity.hp },
  })).toEqual({ success: true });

  const failure = vi.spyOn(currentEncounterModel, "setCurrentEncounter").mockRejectedValueOnce(new Error("selection unavailable"));
  expect(await send(gmSocket, encounterId, phase("startCombat"))).toEqual({ success: false, error: "selection unavailable" });
  failure.mockRestore();

  expect(await dnd5eEncounterSnapshotsModel.getSnapshot(encounterId)).toMatchObject({ phase: "setup", version: 1 });
  expect(await currentOf(agent, player, campaign.id)).toBeNull();

  expect(await send(gmSocket, encounterId, phase("startCombat"))).toEqual({ success: true });
  expect(await dnd5eEncounterSnapshotsModel.getSnapshot(encounterId)).toMatchObject({ phase: "running", version: 2 });
  expect(await currentOf(agent, player, campaign.id)).toMatchObject({ id: encounterId });
});

test("joins and watches check campaign access, and a delayed join of an old board cannot replace a newer one", async () => {
  const agent = createHttpAgent();
  const gm = await createGm();
  const player = await createPlayer();
  const outsider = await createPlayer();
  const campaign = await createCampaign(gm.user, { members: [player.user] });
  await createCampaign(gm.user, { members: [outsider.user] });
  const a = await createEncounter(gm, campaign.id, "A");
  const b = await createEncounter(gm, campaign.id, "B");
  const entity = await createEntity(agent, gm);
  const server = await startSocketServer();
  const gmSocket = await server.connect("/encounter", gm.token);
  const playerSocket = await server.connect("/encounter", player.token);
  const outsiderSocket = await server.connect("/encounter", outsider.token);
  await prepareAndStart(gmSocket, a, entity);

  await asToken(agent.get(`/api/campaigns/${campaign.id}/current-encounter`), outsider.token).expect(404);
  expect(await join(outsiderSocket, a)).toMatchObject({ success: false, error: "Encounter not found" });
  expect(await emitWithAck(outsiderSocket, CampaignSocketEvents.WATCH, { campaignId: campaign.id }))
    .toMatchObject({ success: false });

  // A's queue is busy, so the player's join of A waits; meanwhile B becomes current and is joined.
  let release!: () => void;
  const busy = encounterRequestQueue.enqueue(a, () => new Promise<void>((resolve) => { release = resolve; }));
  const socketErrors: unknown[] = [];
  playerSocket.on("error", (error: unknown) => socketErrors.push(error));
  const lateJoinA = join(playerSocket, a);
  await prepareAndStart(gmSocket, b, entity);
  expect(await join(playerSocket, b)).toMatchObject({ success: true });
  release();
  await busy;
  expect(await lateJoinA).toMatchObject({ success: false, error: "Join superseded" });
  // Only the abandoned join's acknowledgement says so; the socket's current board hears nothing.
  expect(socketErrors).toEqual([]);

  // The socket stayed on B: B's operation arrives and A's does not.
  const gmOnA = await server.connect("/encounter", gm.token);
  expect(await join(gmOnA, a)).toMatchObject({ success: true });
  const received: number[] = [];
  playerSocket.on("encounter:operation", (operation: EncounterOperation) => received.push(operation.encounterId));
  const onB = waitForEvent(playerSocket, "encounter:operation");
  expect(await send(gmOnA, a, { type: "damage", values: { targetId: 0, sourceId: 0, amount: 1 } })).toEqual({ success: true });
  expect(await send(gmSocket, b, { type: "damage", values: { targetId: 0, sourceId: 0, amount: 1 } })).toEqual({ success: true });
  await onB;
  expect(received).toEqual([b]);
});

/** Keep an encounter's request queue busy; whatever is queued next waits until `release`. */
function holdQueue(encounterId: number) {
  let release!: () => void;
  const done = encounterRequestQueue.enqueue(encounterId, () => new Promise<void>((resolve) => { release = resolve; }));
  return async () => { release(); await done; };
}

/** A GM, a player with a socket that records its errors, and two prepared encounters with A running. */
async function startedBoard() {
  const agent = createHttpAgent();
  const gm = await createGm();
  const player = await createPlayer();
  const campaign = await createCampaign(gm.user, { members: [player.user] });
  const a = await createEncounter(gm, campaign.id, "A");
  const b = await createEncounter(gm, campaign.id, "B");
  const entity = await createEntity(agent, gm);
  const server = await startSocketServer();
  const gmSocket = await server.connect("/encounter", gm.token);
  const gmOnB = await server.connect("/encounter", gm.token);
  const playerSocket = await server.connect("/encounter", player.token);
  const socketErrors: unknown[] = [];
  playerSocket.on("error", (error: unknown) => socketErrors.push(error));
  await prepareAndStart(gmSocket, a, entity);
  return { agent, player, campaign, a, b, entity, gmSocket, gmOnB, playerSocket, socketErrors };
}

test("a join that waits behind a reset is refused once the reset has cleared the board", async () => {
  const { agent, player, campaign, a, gmSocket, playerSocket } = await startedBoard();
  const release = holdQueue(a);
  const enqueue = vi.spyOn(encounterRequestQueue, "enqueue");
  const reset = send(gmSocket, a, phase("resetEncounter"));
  await vi.waitFor(() => expect(enqueue).toHaveBeenCalledTimes(1));
  // The join is queued behind the reset while A is still the current board.
  const lateJoin = join(playerSocket, a);
  await vi.waitFor(() => expect(enqueue).toHaveBeenCalledTimes(2));
  const received: EncounterOperation[] = [];
  playerSocket.on("encounter:operation", (operation: EncounterOperation) => received.push(operation));
  await release();

  expect(await reset).toEqual({ success: true });
  const answer = await lateJoin;
  expect(answer).toMatchObject({ success: false, error: "Encounter not found" });
  expect(answer).not.toHaveProperty("encounterState");
  expect(await currentOf(agent, player, campaign.id)).toBeNull();
  // The refused socket is not in the room: a later start of A sends it nothing.
  expect(await send(gmSocket, a, phase("startCombat"))).toEqual({ success: true });
  // A round trip on the player's socket: anything emitted to it before this answer has arrived.
  expect(await emitWithAck(playerSocket, "encounter:leave", { encounterId: a })).toEqual({ success: true });
  expect(received).toEqual([]);
});

test("a join that waits while another start replaces the board is refused and leaves the idle engine to expire", async () => {
  const { a, b, entity, gmSocket, gmOnB, playerSocket } = await startedBoard();
  expect(await emitWithAck(gmSocket, "encounter:leave", { encounterId: a })).toEqual({ success: true });
  const release = holdQueue(a);
  const enqueue = vi.spyOn(encounterRequestQueue, "enqueue");
  const lateJoin = join(playerSocket, a);
  await vi.waitFor(() => expect(enqueue).toHaveBeenCalledTimes(1));
  await prepareAndStart(gmOnB, b, entity);
  const idle = vi.spyOn(encounterEngineManager, "startInactivityTimeout");
  await release();

  expect(await lateJoin).toMatchObject({ success: false, error: "Encounter not found" });
  expect(idle).toHaveBeenCalledWith(a);
});

test.each(["access check", "engine load"])("a superseded join whose %s fails answers its own ack and leaves the newer board alone", async (failing) => {
  const { a, b, entity, gmOnB, playerSocket, socketErrors } = await startedBoard();
  // Hold the old attempt inside the step that is going to fail.
  let fail!: () => void;
  const held = new Promise<never>((_resolve, reject) => { fail = () => reject(new Error("storage unavailable")); });
  const step = failing === "access check"
    ? vi.spyOn(encounterModel, "getEncounterDetailsById").mockReturnValueOnce(held)
    : vi.spyOn(encounterEngineManager, "getOrLoadEngine").mockReturnValueOnce(held);
  const oldJoin = join(playerSocket, a);
  await vi.waitFor(() => expect(step).toHaveBeenCalled());
  await prepareAndStart(gmOnB, b, entity);
  expect(await join(playerSocket, b)).toMatchObject({ success: true });
  fail();

  expect(await oldJoin).toMatchObject({ success: false, error: "storage unavailable" });
  const onB = waitForEvent(playerSocket, "encounter:operation");
  expect(await send(gmOnB, b, { type: "damage", values: { targetId: 0, sourceId: 0, amount: 1 } })).toEqual({ success: true });
  expect(((await onB)[0] as EncounterOperation).encounterId).toBe(b);
  expect(socketErrors).toEqual([]);
});

test("a failed join that nothing superseded still reports a connection error", async () => {
  const { a, playerSocket } = await startedBoard();
  vi.spyOn(encounterModel, "getEncounterDetailsById").mockRejectedValueOnce(new Error("storage unavailable"));
  const reported = waitForEvent(playerSocket, "error");
  expect(await join(playerSocket, a)).toMatchObject({ success: false, error: "storage unavailable" });
  expect((await reported)[0]).toMatchObject({ message: "storage unavailable" });
});
