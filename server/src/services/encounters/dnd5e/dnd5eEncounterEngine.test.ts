import { expect, test } from "vitest";
import type { DnD5eEncounterEvent } from "shared/domain/encounters/dnd5e/events/types.js";
import {
  addEntity, combatProfile, damage, encounterEntity, encounterRequest, encounterState, encounterUser,
} from "../../../../tests/fixtures/encounters.js";
import { RecordingEncounterEngine } from "../../../../tests/support/encounterEngine.js";

const gm = encounterUser();
const endCombat = { type: "endCombat", values: {} } satisfies DnD5eEncounterEvent;
const reset = { type: "resetEncounter", values: {} } satisfies DnD5eEncounterEvent;
const loadProfiles = async (ids: number[]) => ids.map((id) =>
  combatProfile(id, { role: id === 100 ? "pc" : id === 101 ? "creature" : "npc" }));

test("Ending combat offers only PC maximum and current HP for write-back, and a later encounter adds that PC with those values and clean combat fields.", async () => {
  const pc = encounterEntity(0, {
    maxHp: 18, currentHp: 0, tempHp: 5, deathSaveSuccesses: 1, deathSaveFailures: 2,
    isConcentrating: true, reactionUsed: true, conditions: [{ name: "poisoned", duration: 2, startedOnRound: 1 }],
  });
  const first = new RecordingEncounterEngine(
    encounterState([pc, encounterEntity(1, { currentHp: 4 }), encounterEntity(2, { currentHp: 6 })]),
    loadProfiles,
  );

  expect((await first.dispatch(encounterRequest([endCombat]), gm)).appliedEvents).toEqual([endCombat]);
  expect(first.snapshot()).toMatchObject({ phase: "ended", entityStates: [pc, { currentHp: 4 }, { currentHp: 6 }] });
  expect(first.carriedHp).toEqual([[{ templateId: 100, maxHp: 18, currentHp: 0 }]]);

  const next = new RecordingEncounterEngine(encounterState([], { id: 13, phase: "setup" }), async (ids) =>
    first.carriedHp.flat().filter(({ templateId }) => ids.includes(templateId)).map(({ templateId, maxHp, currentHp }) =>
      combatProfile(templateId, { role: "pc", hp: maxHp, currentHp })));
  const added = await next.dispatch(encounterRequest([addEntity(100)], { encounterId: 13 }), gm);

  expect(added.appliedEvents).toEqual([{
    type: "addEntity", values: { templateId: 100, name: "Template 100", hp: 18, currentHp: 0 },
  }]);
  expect(next.snapshot().entityStates).toMatchObject([{
    templateId: 100, maxHp: 18, currentHp: 0, tempHp: 0, deathSaveSuccesses: 0, deathSaveFailures: 0,
    isConcentrating: false, reactionUsed: false, conditions: [], inGrave: false, initiative: 0,
  }]);
});

test("Resetting combat and editing an already ended encounter never carry HP back to templates.", async () => {
  const pc = encounterEntity(0, { currentHp: 6 });
  const running = new RecordingEncounterEngine(encounterState([pc]), loadProfiles);
  expect((await running.dispatch(encounterRequest([reset]), gm)).appliedEvents).toEqual([reset]);
  expect(running.snapshot()).toMatchObject({ phase: "setup", entityStates: [{ currentHp: 10 }] });
  expect(running.carriedHp).toEqual([]);

  const ended = new RecordingEncounterEngine(encounterState([pc], { phase: "ended" }), loadProfiles);
  const hit = damage(0, 2);
  expect((await ended.dispatch(encounterRequest([hit]), gm)).appliedEvents).toEqual([hit]);
  expect(ended.snapshot()).toMatchObject({ phase: "ended", entityStates: [{ currentHp: 4 }] });
  expect(ended.carriedHp).toEqual([]);

  expect((await ended.dispatch(encounterRequest([reset]), gm)).appliedEvents).toEqual([reset]);
  expect(ended.snapshot()).toMatchObject({ phase: "setup", entityStates: [{ currentHp: 10 }] });
  expect(ended.carriedHp).toEqual([]);
});

test.todo("02-F004: Ending combat still attempts PC HP write-back when the status mirror fails");
