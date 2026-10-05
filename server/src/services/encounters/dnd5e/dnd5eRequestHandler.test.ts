import { expect, test } from "vitest";
import type { DnD5eEntityState } from "shared/domain/encounters/dnd5e/entity.js";
import { DnD5eEventProcessor } from "shared/domain/encounters/dnd5e/events/EventProcessor.js";
import type { DnD5eEncounterEvent } from "shared/domain/encounters/dnd5e/events/types.js";
import { resolveEncounterSettings } from "shared/domain/encounters/dnd5e/settings.js";
import {
  addEntity, combatProfile, damage, encounterEntity, encounterRequest, encounterState, encounterUser, removeEntity,
} from "../../../../tests/fixtures/encounters.js";
import { RecordingEncounterEngine } from "../../../../tests/support/encounterEngine.js";
import { EncounterAuthorizationError } from "../EncounterAuthorizationError.js";
import { DnD5eRequestHandler } from "./dnd5eRequestHandler.js";

const gm = encounterUser();
const player = encounterUser(false);
const otherPlayer = { ...encounterUser(false), id: 3 };
const auto = resolveEncounterSettings({ automation: { zeroHpTransfer: "auto" } });

const startCombat = { type: "startCombat", values: {} } satisfies DnD5eEncounterEvent;
const endCombat = { type: "endCombat", values: {} } satisfies DnD5eEncounterEvent;
const nextTurn = { type: "nextTurn", values: {} } satisfies DnD5eEncounterEvent;
const reset = { type: "resetEncounter", values: {} } satisfies DnD5eEncounterEvent;
const enableAuto = {
  type: "updateEncounterSettings",
  values: { patch: { automation: { zeroHpTransfer: "auto" } } },
} satisfies DnD5eEncounterEvent;

const bury = (targetId: number): DnD5eEncounterEvent => ({ type: "moveToGrave", values: { targetId } });
const saves = (successes: number, failures: number): DnD5eEncounterEvent =>
  ({ type: "setDeathSaves", values: { targetId: 0, successes, failures } });

function expectNoWrites(engine: RecordingEncounterEngine, before: ReturnType<RecordingEncounterEngine["snapshot"]>) {
  expect(engine.snapshot()).toEqual(before);
  expect(engine.snapshots).toEqual([]);
  expect(engine.memberships).toEqual([]);
  expect(engine.statuses).toEqual([]);
  expect(engine.carriedHp).toEqual([]);
}

test("Adding an entity replaces client name and HP with the template values while retaining its hidden flag and leaving the request unchanged.", async () => {
  const draft = structuredClone(encounterState([]));
  const profile = combatProfile(100, { name: "Goblin", hp: 7 });
  const handler = new DnD5eRequestHandler(draft, async (ids) => ids.includes(profile.id) ? [profile] : []);
  const request = encounterRequest([{
    type: "addEntity",
    values: { templateId: 100, name: "Tarrasque", hp: 999, currentHp: 1, hidden: true },
  }]);
  const before = structuredClone(request);

  expect(await handler.parseRequest(request, gm)).toEqual([{
    type: "addEntity", values: { templateId: 100, name: "Goblin", hp: 7, hidden: true },
  }]);
  expect(draft.entityStates).toMatchObject([{ templateId: 100, maxHp: 7, currentHp: 7, hidden: true }]);
  expect(request).toEqual(before);
});

test("Adding a PC uses stored current HP capped at maximum, including zero; null falls back to full HP and non-PC carried HP is ignored.", async () => {
  for (const [role, storedHp, appliedHp, currentHp] of [
    ["pc", 5, 5, 5],
    ["pc", 0, 0, 0],
    ["pc", 30, 12, 12],
    ["pc", null, undefined, 12],
    ["npc", 3, undefined, 12],
    ["creature", 4, undefined, 12],
  ] as const) {
    const draft = structuredClone(encounterState([]));
    const profile = combatProfile(100, { role, hp: 12, currentHp: storedHp });
    const handler = new DnD5eRequestHandler(draft, async (ids) => ids.includes(profile.id) ? [profile] : []);
    const applied = await handler.parseRequest(encounterRequest([addEntity(100)]), gm);

    expect(applied).toEqual([{
      type: "addEntity",
      values: { templateId: 100, name: profile.name, hp: 12, ...(appliedHp === undefined ? {} : { currentHp: appliedHp }) },
    }]);
    expect(draft.entityStates).toMatchObject([{ currentHp, maxHp: 12 }]);
  }
});

test("A missing add-entity template or HP target profile rejects the entire dispatch without a partial change.", async () => {
  const engine = new RecordingEncounterEngine(encounterState(), async (ids) =>
    ids.filter((id) => id === 100).map((id) => combatProfile(id)));
  const before = engine.snapshot();

  for (const rejected of [addEntity(999), damage(1, 1), damage(99, 1)]) {
    await expect(engine.dispatch(encounterRequest([damage(0, 2), rejected]), gm)).rejects.toThrow();
    expectNoWrites(engine, before);
  }
});

test("A positive-to-zero HP change automatically buries eligible creatures and NPCs in the same operation. (damage, setHp, setCurrentHp; opted-out NPC.)", async () => {
  const hpEvents: DnD5eEncounterEvent[] = [
    damage(0, 10),
    { type: "setHp", values: { targetId: 0, hp: 0 } },
    { type: "setCurrentHp", values: { targetId: 0, hp: 0 } },
  ];
  for (const role of ["creature", "npc"] as const) {
    for (const event of hpEvents) {
      const profile = combatProfile(100, { role, settings: { combat: { deathSaves: false } } });
      const engine = new RecordingEncounterEngine(encounterState([encounterEntity(0)], { settings: auto }), async () => [profile]);

      const operation = await engine.dispatch(encounterRequest([event]), gm);

      expect(operation.appliedEvents).toEqual([event, bury(0)]);
      expect(engine.snapshot()).toMatchObject({ initiativeOrder: [], entityStates: [{ currentHp: 0, inGrave: true }] });
      expect(engine.snapshots).toEqual([engine.snapshot()]);
    }
  }
});

test("Automation never buries PCs, death-save NPCs, already buried members, manual-mode members or members protected by temporary HP.", async () => {
  const cases = [
    { profile: combatProfile(100, { role: "pc" }), entity: encounterEntity(0), settings: auto, hp: 0, tempHp: 0 },
    { profile: combatProfile(100, { role: "npc", settings: { combat: { deathSaves: true } } }), entity: encounterEntity(0), settings: auto, hp: 0, tempHp: 0 },
    { profile: combatProfile(100), entity: encounterEntity(0), settings: resolveEncounterSettings(), hp: 0, tempHp: 0 },
    { profile: combatProfile(100), entity: encounterEntity(0, { tempHp: 12 }), settings: auto, hp: 10, tempHp: 2 },
  ];
  for (const { profile, entity, settings, hp, tempHp } of cases) {
    const engine = new RecordingEncounterEngine(encounterState([entity], { settings }), async () => [profile]);
    const hit = damage(0, 10);

    expect((await engine.dispatch(encounterRequest([hit]), gm)).appliedEvents).toEqual([hit]);
    expect(engine.snapshot().entityStates).toMatchObject([{ inGrave: entity.inGrave, currentHp: hp, tempHp }]);
    expect(engine.snapshot().initiativeOrder).toEqual([0]);
  }

  const buried = new RecordingEncounterEngine(encounterState([encounterEntity(0, { inGrave: true })], { settings: auto }));
  const hit = damage(0, 10);
  const heal = { type: "heal", values: { targetId: 0, sourceId: 1, amount: 5 } } satisfies DnD5eEncounterEvent;
  expect((await buried.dispatch(encounterRequest([hit]), gm)).appliedEvents).toEqual([hit]);
  expect(buried.snapshot()).toMatchObject({ initiativeOrder: [], entityStates: [{ currentHp: 0, inGrave: true }] });
  expect((await buried.dispatch(encounterRequest([heal]), gm)).appliedEvents).toEqual([heal]);
  expect(buried.snapshot()).toMatchObject({ initiativeOrder: [], entityStates: [{ currentHp: 5, inGrave: true }] });
});

test("Enabling automation, loading zero HP and damaging an already-zero member never cause retroactive burial.", async () => {
  const zeroHp = [encounterEntity(0, { currentHp: 0 })];
  const manual = new RecordingEncounterEngine(encounterState(zeroHp));
  const loadedAuto = new RecordingEncounterEngine(encounterState(zeroHp, { settings: auto }));

  expect((await manual.dispatch(encounterRequest([enableAuto]), gm)).appliedEvents).toEqual([enableAuto]);
  for (const engine of [manual, loadedAuto]) {
    expect(engine.snapshot()).toMatchObject({ settings: auto, initiativeOrder: [0], entityStates: [{ currentHp: 0, inGrave: false }] });
    const hit = damage(0, 3);
    expect((await engine.dispatch(encounterRequest([hit]), gm)).appliedEvents).toEqual([hit]);
    expect(engine.snapshot()).toMatchObject({ initiativeOrder: [0], entityStates: [{ currentHp: 0, inGrave: false }] });
  }
});

test("New requests consult current NPC settings and controllers across copies and encounters without retroactively burying zero-HP copies.", async () => {
  let profile = combatProfile(100, {
    role: "npc", settings: { combat: { deathSaves: true } }, controllerUserIds: [player.id],
  });
  const copies = [encounterEntity(0), encounterEntity(1, { templateId: 100 })];
  const loadProfiles = async (ids: number[]) => ids.includes(profile.id) ? [profile] : [];
  const settings = resolveEncounterSettings({ automation: { zeroHpTransfer: "auto" }, visibility: { monsterHp: "exact" } });
  const first = new RecordingEncounterEngine(encounterState(copies, { settings }), loadProfiles);
  const second = new RecordingEncounterEngine(encounterState(copies, { id: 13, settings }), loadProfiles);
  const firstHit = damage(0, 10);
  expect((await first.dispatch(encounterRequest([firstHit]), player)).appliedEvents).toEqual([firstHit]);
  expect(first.snapshot().entityStates[0]).toMatchObject({ currentHp: 0, inGrave: false });
  const tempHp = { type: "setTempHp", values: { targetId: 1, sourceId: 0, tempHp: 1 } } satisfies DnD5eEncounterEvent;
  expect((await second.dispatch(encounterRequest([tempHp], { encounterId: 13 }), player)).appliedEvents).toEqual([tempHp]);

  profile = combatProfile(100, {
    role: "npc", settings: { combat: { deathSaves: false } }, controllerUserIds: [otherPlayer.id],
  });
  for (const engine of [first, second]) {
    const before = engine.snapshot();
    const hit = encounterRequest([damage(0, 10), damage(1, 11)], { encounterId: before.id });
    await expect(engine.dispatch(hit, player)).rejects.toThrow(EncounterAuthorizationError);
    expect(engine.snapshot()).toEqual(before);
    const operation = await engine.dispatch(hit, otherPlayer);
    expect(operation.appliedEvents).toEqual(engine === first
      ? [damage(0, 10), damage(1, 11), bury(1)]
      : [damage(0, 10), bury(0), damage(1, 11), bury(1)]);
    expect(engine.snapshot().entityStates).toMatchObject([
      { currentHp: 0, inGrave: engine === second },
      { currentHp: 0, inGrave: true },
    ]);
  }
});

test("Replaying authoritative template-rewritten and generated burial events reproduces the engine result without loading client templates.", async () => {
  const engine = new RecordingEncounterEngine(encounterState([], { settings: auto }),
    async () => [combatProfile(100, { name: "Goblin", hp: 7 })]);
  const replay = engine.snapshot();

  const added = await engine.dispatch(encounterRequest([addEntity(100)]), gm);
  const hit = damage(0, 7);
  const buried = await engine.dispatch(encounterRequest([hit]), gm);
  expect(added.appliedEvents).toEqual([{ type: "addEntity", values: { templateId: 100, name: "Goblin", hp: 7 } }]);
  expect(buried.appliedEvents).toEqual([hit, bury(0)]);

  for (const operation of [added, buried]) {
    for (const event of operation.appliedEvents) DnD5eEventProcessor.applyEvent(replay, event);
    replay.version = operation.version;
  }
  expect(replay).toEqual(engine.snapshot());
});

test("Death-save counters can be set for an unburied zero-HP PC or opted-in NPC, and reaching three does not automatically bury it.", async () => {
  for (const role of ["pc", "npc"] as const) {
    const profile = combatProfile(100, { role, settings: role === "pc" ? {} : { combat: { deathSaves: true } } });
    const engine = new RecordingEncounterEngine(
      encounterState([encounterEntity(0, { currentHp: 0 })], { settings: auto }), async () => [profile],
    );

    for (const [successes, failures] of [[3, 0], [0, 3]]) {
      const event = saves(successes, failures);
      expect((await engine.dispatch(encounterRequest([event]), gm)).appliedEvents).toEqual([event]);
      expect(engine.snapshot()).toMatchObject({
        initiativeOrder: [0],
        entityStates: [{ inGrave: false, currentHp: 0, deathSaveSuccesses: successes, deathSaveFailures: failures }],
      });
      expect(engine.snapshots.at(-1)).toEqual(engine.snapshot());
    }
  }
});

test("Nonzero death-save counters are rejected for positive HP, buried members, creatures and opted-out NPCs, while an authorized counter clear remains possible.", async () => {
  const cases = [
    [combatProfile(100, { role: "pc" }), encounterEntity(0)],
    [combatProfile(100, { role: "pc" }), encounterEntity(0, { currentHp: 0, inGrave: true })],
    [combatProfile(100), encounterEntity(0, { currentHp: 0 })],
    [combatProfile(100, { role: "npc", settings: { combat: { deathSaves: false } } }), encounterEntity(0, { currentHp: 0 })],
  ] as const;
  for (const [profile, entity] of cases) {
    const engine = new RecordingEncounterEngine(
      encounterState([{ ...entity, deathSaveSuccesses: 1, deathSaveFailures: 2 }]), async () => [profile],
    );
    const before = engine.snapshot();

    await expect(engine.dispatch(encounterRequest([saves(0, 1)]), gm)).rejects.toThrow();
    expectNoWrites(engine, before);
    const clear = saves(0, 0);
    expect((await engine.dispatch(encounterRequest([clear]), gm)).appliedEvents).toEqual([clear]);
    expect(engine.snapshot().entityStates).toEqual([{ ...before.entityStates[0], deathSaveSuccesses: 0, deathSaveFailures: 0 }]);
  }
});

test("Phase commands in the wrong phase reject dispatch without changing state or version. (start outside setup, end or next outside running.)", async () => {
  for (const [phase, events] of [
    ["setup", [endCombat, nextTurn]],
    ["running", [startCombat]],
    ["ended", [startCombat, endCombat, nextTurn]],
  ] as const) {
    const engine = new RecordingEncounterEngine(encounterState(undefined, { phase, version: 7 }));
    const before = engine.snapshot();
    for (const event of events) {
      await expect(engine.dispatch(encounterRequest([event]), gm)).rejects.toThrow();
      expectNoWrites(engine, before);
    }
  }
});

test("Starting combat rejects an empty initiative, including when every member is buried.", async () => {
  for (const entities of [[], [encounterEntity(0, { inGrave: true })]]) {
    const engine = new RecordingEncounterEngine(encounterState(entities, { phase: "setup" }));
    const before = engine.snapshot();
    expect(before.initiativeOrder).toEqual([]);
    await expect(engine.dispatch(encounterRequest([startCombat]), gm)).rejects.toThrow();
    expectNoWrites(engine, before);
  }
});

test("Membership, HP and initiative edits remain available in setup, running and ended phases, and reset returns any phase to setup.", async () => {
  for (const phase of ["setup", "running", "ended"] as const) {
    const engine = new RecordingEncounterEngine(encounterState(undefined, { phase }));
    const events: DnD5eEncounterEvent[] = [
      removeEntity(1), addEntity(102), damage(0, 4), { type: "setInitiative", values: { targetId: 0, initiative: 22 } },
    ];
    const operation = await engine.dispatch(encounterRequest(events), gm);
    expect(operation.appliedEvents.map(({ type }) => type)).toEqual(events.map(({ type }) => type));
    expect(engine.snapshot()).toMatchObject({
      phase, entityStates: [{ instanceId: 0, currentHp: 6, initiative: 22 }, { instanceId: 2, templateId: 102 }],
    });
    expect(engine.memberships).toEqual([new Map([[100, 1], [102, 1]])]);
    expect((await engine.dispatch(encounterRequest([reset]), gm)).appliedEvents).toEqual([reset]);
    expect(engine.snapshot()).toMatchObject({ phase: "setup", currentRound: 0, currentTurn: 0, version: 2 });
  }
});

test("Only a GM can change membership, phase, turns, settings, graves, hidden state or maximum HP even when a player controls the target. (All eleven GM-only event types.)", async () => {
  const cases: {
    event: DnD5eEncounterEvent;
    initial?: ReturnType<typeof encounterState>;
    expected: object;
  }[] = [
    { event: addEntity(102), expected: { entityStates: [{ templateId: 100 }, { templateId: 102 }] } },
    { event: removeEntity(0), expected: { entityStates: [] } },
    { event: startCombat, initial: encounterState([encounterEntity(0)], { phase: "setup" }), expected: { phase: "running" } },
    { event: endCombat, expected: { phase: "ended" } },
    { event: reset, expected: { phase: "setup" } },
    { event: enableAuto, expected: { settings: auto } },
    { event: bury(0), expected: { entityStates: [{ inGrave: true }] } },
    {
      event: { type: "restoreFromGrave", values: { targetId: 0, hp: 2 } },
      initial: encounterState([encounterEntity(0, { inGrave: true, currentHp: 0 })]),
      expected: { initiativeOrder: [0], entityStates: [{ inGrave: false, currentHp: 2 }] },
    },
    { event: { type: "setHidden", values: { targetId: 0, hidden: true } }, expected: { entityStates: [{ hidden: true }] } },
    { event: { type: "setHp", values: { targetId: 0, hp: 14 } }, expected: { entityStates: [{ maxHp: 14, currentHp: 14 }] } },
    { event: nextTurn, expected: { currentTurn: 0, currentRound: 2 } },
  ];
  for (const { event, initial = encounterState([encounterEntity(0)]), expected } of cases) {
    const engine = new RecordingEncounterEngine(initial, async (ids) =>
      ids.map((id) => combatProfile(id, { controllerUserIds: [player.id] })));
    const before = engine.snapshot();
    const request = encounterRequest([event]);

    await expect(engine.dispatch(request, player)).rejects.toThrow(EncounterAuthorizationError);
    expectNoWrites(engine, before);
    expect((await engine.dispatch(request, gm)).appliedEvents).toEqual([event]);
    expect(engine.snapshot()).toMatchObject(expected);
  }
});

async function dispatchAsGmAndTargetController(event: DnD5eEncounterEvent, initial: DnD5eEntityState) {
  const sourceControlledByOtherPlayer = encounterEntity(1);
  const loadProfiles = async (ids: number[]) => ids.map((id) =>
    combatProfile(id, { role: "pc", controllerUserIds: [id === initial.templateId ? player.id : otherPlayer.id] }));

  return Promise.all([gm, player].map(async (allowed) => {
    const engine = new RecordingEncounterEngine(encounterState([initial, sourceControlledByOtherPlayer]), loadProfiles);
    const request = encounterRequest([event]);
    const before = engine.snapshot();

    await expect(engine.dispatch(request, otherPlayer)).rejects.toThrow(EncounterAuthorizationError);
    expectNoWrites(engine, before);
    expect((await engine.dispatch(request, allowed)).appliedEvents).toEqual([event]);
    const after = engine.snapshot();
    expect(after.version).toBe(1);
    expect(after.entityStates[1]).toEqual(before.entityStates[1]);
    return after.entityStates[0];
  }));
}

test("During a running fight, a player with a visible combatant of their own may damage or heal any visible target; the GM always may.", async () => {
  // 0 is the other player's PC, 1 the player's own PC, 2 an uncontrolled creature.
  const loadProfiles = async (ids: number[]) => ids.map((id) => combatProfile(id, {
    role: id === 102 ? "creature" : "pc",
    controllerUserIds: id === 100 ? [otherPlayer.id] : id === 101 ? [player.id] : [],
  }));
  const heal = { type: "heal", values: { targetId: 2, sourceId: 1, amount: 2 } } satisfies DnD5eEncounterEvent;
  for (const user of [gm, player, otherPlayer]) {
    const engine = new RecordingEncounterEngine(
      encounterState([encounterEntity(0), encounterEntity(1), encounterEntity(2, { currentHp: 5 })]), loadProfiles,
    );
    expect((await engine.dispatch(encounterRequest([damage(0, 3)]), user)).appliedEvents).toEqual([damage(0, 3)]);
    expect((await engine.dispatch(encounterRequest([damage(2, 1), heal]), user)).appliedEvents).toEqual([damage(2, 1), heal]);
    expect(engine.snapshot().entityStates.map(({ currentHp }) => currentHp)).toEqual([7, 10, 6]);
  }
});

test("Damage and healing are refused to an observer, for a hidden target, with only a hidden combatant of one's own, and outside a running fight.", async () => {
  const heal = (targetId: number) => ({ type: "heal", values: { targetId, sourceId: 0, amount: 1 } }) satisfies DnD5eEncounterEvent;
  const ownedBy = (owners: Record<number, number[]>) => async (ids: number[]) =>
    ids.map((id) => combatProfile(id, { controllerUserIds: owners[id] ?? [] }));
  const cases: { user: typeof player; entities: DnD5eEntityState[]; owners: Record<number, number[]>; phase?: "setup" | "ended"; targetId: number }[] = [
    // An observer: no combatant of their own.
    { user: otherPlayer, entities: [encounterEntity(0), encounterEntity(1)], owners: { 100: [player.id] }, targetId: 1 },
    // A hidden target, even one of the player's own.
    { user: player, entities: [encounterEntity(0), encounterEntity(1, { hidden: true })], owners: { 100: [player.id] }, targetId: 1 },
    { user: player, entities: [encounterEntity(0, { hidden: true }), encounterEntity(1)], owners: { 100: [player.id], 101: [player.id] }, targetId: 0 },
    // The player's only combatant is hidden.
    { user: player, entities: [encounterEntity(0, { hidden: true }), encounterEntity(1)], owners: { 100: [player.id] }, targetId: 1 },
    // Prep and an ended fight.
    { user: player, entities: [encounterEntity(0), encounterEntity(1)], owners: { 100: [player.id] }, phase: "setup", targetId: 1 },
    { user: player, entities: [encounterEntity(0), encounterEntity(1)], owners: { 100: [player.id] }, phase: "ended", targetId: 1 },
  ];
  for (const { user, entities, owners, phase, targetId } of cases) {
    for (const event of [damage(targetId, 2), heal(targetId)]) {
      const engine = new RecordingEncounterEngine(encounterState(entities, { phase }), ownedBy(owners));
      const before = engine.snapshot();
      await expect(engine.dispatch(encounterRequest([event]), user)).rejects.toThrow(EncounterAuthorizationError);
      expectNoWrites(engine, before);
      expect((await engine.dispatch(encounterRequest([event]), gm)).appliedEvents).toEqual([event]);
    }
  }
});

test("A player's absolute changes, current HP, temporary HP, initiative and death saves, are refused outside a running fight and for a hidden own entity.", async () => {
  const events: DnD5eEncounterEvent[] = [
    { type: "setCurrentHp", values: { targetId: 0, hp: 0 } },
    { type: "setTempHp", values: { targetId: 0, sourceId: 0, tempHp: 4 } },
    { type: "setInitiative", values: { targetId: 0, initiative: 26 } },
  ];
  const loadProfiles = async (ids: number[]) => ids.map((id) => combatProfile(id, { role: "pc", controllerUserIds: [player.id] }));
  for (const [phase, hidden] of [["setup", false], ["ended", false], ["running", true]] as const) {
    for (const event of [...events, saves(1, 0)]) {
      const engine = new RecordingEncounterEngine(
        encounterState([encounterEntity(0, { currentHp: 0, hidden }), encounterEntity(1)], { phase }), loadProfiles,
      );
      const before = engine.snapshot();
      await expect(engine.dispatch(encounterRequest([event]), player)).rejects.toThrow(EncounterAuthorizationError);
      expectNoWrites(engine, before);
    }
  }
});

test("Auto-burial within a batch blocks later player events against the new grave or without a combatant of their own", async () => {
  for (const [whoControls, secondTarget] of [[1, 0], [0, 1]] as const) {
    const loadProfiles = async (ids: number[]) => ids.map((id) => combatProfile(id, {
      controllerUserIds: id === 100 + whoControls ? [player.id] : [],
    }));
    const engine = new RecordingEncounterEngine(encounterState([encounterEntity(0), encounterEntity(1)], { settings: auto }), loadProfiles);
    const before = engine.snapshot();
    const hit = damage(0, 10);
    const heal: DnD5eEncounterEvent = { type: "heal", values: { targetId: secondTarget, sourceId: 0, amount: 2 } };
    await expect(engine.dispatch(encounterRequest([hit, heal]), player)).rejects.toThrow(EncounterAuthorizationError);
    expectNoWrites(engine, before);
    expect((await engine.dispatch(encounterRequest([hit]), player)).appliedEvents).toEqual([hit, bury(0)]);
  }
});

test("A player may clear death saves only while their character is making them; the GM may clear them at any time.", async () => {
  const loadProfiles = async (ids: number[]) => ids.map((id) => combatProfile(id, { role: "pc", controllerUserIds: [player.id] }));
  const engine = new RecordingEncounterEngine(
    encounterState([encounterEntity(0, { deathSaveSuccesses: 1 }), encounterEntity(1, { currentHp: 0, deathSaveFailures: 2 })]),
    loadProfiles,
  );
  const before = engine.snapshot();
  await expect(engine.dispatch(encounterRequest([saves(0, 0)]), player)).rejects.toThrow("Death saves require");
  expectNoWrites(engine, before);
  const clearOne = { type: "setDeathSaves", values: { targetId: 1, successes: 0, failures: 0 } } satisfies DnD5eEncounterEvent;
  expect((await engine.dispatch(encounterRequest([clearOne]), player)).appliedEvents).toEqual([clearOne]);
  expect((await engine.dispatch(encounterRequest([saves(0, 0)]), gm)).appliedEvents).toEqual([saves(0, 0)]);
});

test("Current HP assignment is allowed for the GM or target controller and rejected for other players.", async () => {
  const targets = await dispatchAsGmAndTargetController(
    { type: "setCurrentHp", values: { targetId: 0, hp: 7 } }, encounterEntity(0),
  );
  for (const target of targets) expect(target.currentHp).toBe(7);
});

test("Temporary HP assignment is allowed for the GM or target controller and rejected for other players.", async () => {
  const targets = await dispatchAsGmAndTargetController(
    { type: "setTempHp", values: { targetId: 0, sourceId: 1, tempHp: 4 } }, encounterEntity(0),
  );
  for (const target of targets) expect(target.tempHp).toBe(4);
});

test("Initiative assignment is allowed for the GM or target controller and rejected for other players.", async () => {
  const targets = await dispatchAsGmAndTargetController(
    { type: "setInitiative", values: { targetId: 0, initiative: 26 } }, encounterEntity(0),
  );
  for (const target of targets) expect(target.initiative).toBe(26);
});

test("Death-save assignment is allowed for the GM or target controller and rejected for other players. (Eligible target at zero HP.)", async () => {
  const targets = await dispatchAsGmAndTargetController(saves(2, 1), encounterEntity(0, { currentHp: 0 }));
  for (const target of targets) expect(target).toMatchObject({ deathSaveSuccesses: 2, deathSaveFailures: 1 });
});

test("Only the GM advances a running turn, also when a player controls the entity whose turn it is.", async () => {
  const loadProfiles = async (ids: number[]) => ids.map((id) => combatProfile(id, { controllerUserIds: [player.id] }));
  const engine = new RecordingEncounterEngine(encounterState(), loadProfiles);
  const before = engine.snapshot();

  await expect(engine.dispatch(encounterRequest([nextTurn]), player)).rejects.toThrow(EncounterAuthorizationError);
  expectNoWrites(engine, before);
  expect((await engine.dispatch(encounterRequest([nextTurn]), gm)).appliedEvents).toEqual([nextTurn]);
  const after = engine.snapshot();
  expect(after.initiativeOrder[after.currentTurn]).toBe(1);
});

test("One forbidden event rejects an entire batch even after an allowed event, without persisting or consuming the request ID.", async () => {
  let controlsBoth = false;
  const engine = new RecordingEncounterEngine(encounterState(undefined, { version: 7 }), async (ids) =>
    ids.map((id) => combatProfile(id, { role: "pc", controllerUserIds: id === 100 || controlsBoth ? [player.id] : [] })));
  const before = engine.snapshot();
  const setOther = { type: "setCurrentHp", values: { targetId: 1, hp: 7 } } satisfies DnD5eEncounterEvent;
  const events = [damage(0, 2), setOther];
  const request = encounterRequest(events);

  await expect(engine.dispatch(request, player)).rejects.toThrow(EncounterAuthorizationError);
  expectNoWrites(engine, before);

  controlsBoth = true;
  expect(await engine.dispatch(request, player)).toMatchObject({
    causedByRequestId: request.requestId, version: 8, appliedEvents: events,
  });
  expect(engine.snapshot().entityStates).toMatchObject([{ currentHp: 8 }, { currentHp: 7 }]);
  expect(engine.snapshots).toEqual([engine.snapshot()]);
});

test("Malformed event shapes, unknown event types and missing required fields reject the whole request before any event applies.", async () => {
  const profileLookups: number[][] = [];
  const engine = new RecordingEncounterEngine(encounterState(), async (ids) => {
    profileLookups.push(ids);
    return ids.map((id) => combatProfile(id));
  });
  const before = engine.snapshot();
  const invalid: unknown[] = [
    null, 1, {}, { type: "damage" }, { type: "damage", values: null },
    { type: "damage", values: [] }, { type: "damage", values: 1 },
    { type: "unknownAction", values: {} }, { type: "damage", values: { targetId: 0, amount: 1 } },
    { type: "addEntity", values: { templateId: 100, hp: 1 } },
  ];
  for (const event of invalid) {
    await expect(engine.dispatch(encounterRequest([damage(0, 1), event as DnD5eEncounterEvent]), gm)).rejects.toThrow();
    expectNoWrites(engine, before);
  }
  expect(profileLookups).toEqual([]);
});

test("Invalid numeric values, counter bounds, hidden flags and unsupported settings leaves reject writes while legal zero values and negative finite initiative work.", async () => {
  const engine = new RecordingEncounterEngine(
    encounterState([encounterEntity(0, { currentHp: 0 })]),
    async (ids) => ids.map((id) => combatProfile(id, { role: "pc" })),
  );
  const before = engine.snapshot();
  const invalid: unknown[] = [
    ...[-1, NaN, Infinity].flatMap((value) => [
      { type: "damage", values: { targetId: 0, sourceId: 0, amount: value } },
      { type: "setCurrentHp", values: { targetId: 0, hp: value } },
      { type: "setHp", values: { targetId: 0, hp: value } },
      { type: "setTempHp", values: { targetId: 0, sourceId: 0, tempHp: value } },
    ]),
    ...[-1, 0.5, NaN, Infinity].flatMap((id) => [
      { type: "damage", values: { targetId: 0, sourceId: id, amount: 1 } },
      { type: "removeEntity", values: { instanceId: id } },
    ]),
    ...[NaN, Infinity, -Infinity].map((initiative) => ({ type: "setInitiative", values: { targetId: 0, initiative } })),
    ...[-1, 0.5, 4, NaN].flatMap((value) => [saves(value, 0), saves(0, value)]),
    { type: "setHidden", values: { targetId: 0, hidden: "yes" } },
    { type: "addEntity", values: { templateId: 102, name: "Hidden", hp: 1, hidden: 1 } },
    { type: "addEntity", values: { templateId: 102, name: "Creature", hp: 0 } },
    { type: "updateEncounterSettings", values: { patch: { automation: { unknownLeaf: true } } } },
    { type: "updateEncounterSettings", values: { patch: { automation: { zeroHpTransfer: true } } } },
  ];
  for (const event of invalid) {
    await expect(engine.dispatch(encounterRequest([event as DnD5eEncounterEvent]), gm)).rejects.toThrow();
    expectNoWrites(engine, before);
  }

  const fractional: DnD5eEncounterEvent[] = [
    { type: "setHp", values: { targetId: 0, hp: 8.5 } },
    { type: "damage", values: { targetId: 0, sourceId: 0, amount: 0.5 } },
    { type: "setTempHp", values: { targetId: 0, sourceId: 0, tempHp: 1.5 } },
    { type: "setInitiative", values: { targetId: 0, initiative: -2.5 } },
  ];
  expect((await engine.dispatch(encounterRequest(fractional), gm)).appliedEvents).toEqual(fractional);
  expect(engine.snapshot().entityStates).toMatchObject([{ maxHp: 8.5, currentHp: 8, tempHp: 1.5, initiative: -2.5 }]);

  const zero: DnD5eEncounterEvent[] = [
    { type: "setTempHp", values: { targetId: 0, sourceId: 0, tempHp: 0 } },
    { type: "damage", values: { targetId: 0, sourceId: 0, amount: 0 } },
    { type: "setHp", values: { targetId: 0, hp: 0 } },
  ];
  expect((await engine.dispatch(encounterRequest(zero), gm)).appliedEvents).toEqual(zero);
  for (const counter of [0, 1, 2, 3]) {
    const event = saves(counter, counter);
    expect((await engine.dispatch(encounterRequest([event]), gm)).appliedEvents).toEqual([event]);
    expect(engine.snapshot().entityStates).toMatchObject([{
      currentHp: 0, maxHp: 0, tempHp: 0, deathSaveSuccesses: counter, deathSaveFailures: counter,
    }]);
  }
});
