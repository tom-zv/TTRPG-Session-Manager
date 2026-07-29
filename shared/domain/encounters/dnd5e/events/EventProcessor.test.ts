import { expect, test } from 'vitest';
import fc from 'fast-check';
import { DnD5eEventProcessor } from './EventProcessor.js';
import type { DnD5eEncounterEvent, EntityEvent } from './types.js';
import { state, entity, damage, bury, add } from '../testSupport.js';

const apply = DnD5eEventProcessor.applyEvent;
const assertFreshId = (history: Set<number>, id: number) => expect(history.has(id)).toBe(false);
const assertSorted = (s: ReturnType<typeof state>) => {
  const expected = s.entityStates.filter(e => !e.inGrave).sort((a, b) => b.initiative - a.initiative || a.instanceId - b.instanceId).map(e => e.instanceId);
  expect(s.initiativeOrder).toEqual(expected);
};
const actor = (s: ReturnType<typeof state>) => s.initiativeOrder[s.currentTurn];

test("Damage consumes temporary HP before current HP and stops current HP at zero.", () => {
  for (const [amount, hp, temp] of [[2, 10, 3], [5, 10, 0], [8, 7, 0], [99, 0, 0]]) {
    const s = state(1); s.entityStates[0].tempHp = 5;
    apply(s, damage(0, amount));
    expect(s.entityStates[0]).toMatchObject({ currentHp: hp, tempHp: temp, inGrave: false });
  }
});

test("Healing stops at maximum HP without consuming temporary HP.", () => {
  for (const [amount, hp] of [[2, 6], [6, 10], [100, 10]]) {
    const s = state(1); Object.assign(s.entityStates[0], { currentHp: 4, tempHp: 3 });
    apply(s, { type: 'heal', values: { sourceId: 0, targetId: 0, amount } });
    expect(s.entityStates[0]).toMatchObject({ currentHp: hp, maxHp: 10, tempHp: 3 });
  }
});

test("Absolute HP edits keep current and maximum HP consistent.", () => {
  for (const [type, hp, maxHp] of [['setHp', 4, 4], ['setHp', 15, 15], ['setCurrentHp', 4, 10], ['setCurrentHp', 15, 15]] as const) {
    const s = state(1); apply(s, { type, values: { targetId: 0, hp } });
    expect(s.entityStates[0]).toMatchObject({ currentHp: hp, maxHp });
  }
});

test("Recovering from zero HP clears both death-save counters through every HP assignment event.", () => {
  for (const type of ['heal', 'setHp', 'setCurrentHp'] as const) {
    for (const [before, after, saves] of [[0, 1, 0], [0, 0, 2], [1, 3, 2]]) {
      const s = state(1); Object.assign(s.entityStates[0], { currentHp: before, deathSaveSuccesses: 2, deathSaveFailures: 2 });
      const event: DnD5eEncounterEvent = type === 'heal'
        ? { type, values: { sourceId: 0, targetId: 0, amount: after - before } }
        : { type, values: { targetId: 0, hp: after } };
      apply(s, event);
      expect(s.entityStates[0]).toMatchObject({ currentHp: after, deathSaveSuccesses: saves, deathSaveFailures: saves });
    }
  }
});

test("Damage preserves death-save counters when it reaches zero or hits an entity already at zero.", () => {
  for (const currentHp of [0, 5]) {
    const s = state(1); Object.assign(s.entityStates[0], { currentHp, deathSaveSuccesses: 2, deathSaveFailures: 1 });
    apply(s, damage(0, 5));
    expect(s.entityStates[0]).toMatchObject({ currentHp: 0, deathSaveSuccesses: 2, deathSaveFailures: 1, inGrave: false });
  }
});

test("Setting temporary HP replaces the previous value, even with a smaller value or zero.", () => {
  const s = state(1);
  for (const tempHp of [10, 4, 0]) {
    apply(s, { type: 'setTempHp', values: { targetId: 0, sourceId: 0, tempHp } });
    expect(s.entityStates[0].tempHp).toBe(tempHp);
  }
});

test("Burial preserves identity and combat data, removes initiative membership, and does nothing when repeated.", () => {
  const s = state();
  Object.assign(s.entityStates[0], { displayName: 'Goblin 1', hidden: true, currentHp: 0, tempHp: 4,
    deathSaveFailures: 3, reactionUsed: true, isConcentrating: true,
    conditions: [{ name: 'poisoned', duration: null, startedOnRound: 1 }] });
  const before = structuredClone(s.entityStates[0]);
  apply(s, bury(0));
  expect(s.entityStates[0]).toEqual({ ...before, inGrave: true });
  expect(s.initiativeOrder).toEqual([1, 2]);
  const once = structuredClone(s); apply(s, bury(0)); expect(s).toEqual(once);
});

test("Restoring at zero HP preserves death saves and rejoins initiative, and restoring an unburied entity changes nothing.", () => {
  const s = state(); apply(s, bury(0));
  Object.assign(s.entityStates[0], { currentHp: 0, deathSaveSuccesses: 2, deathSaveFailures: 3 });
  apply(s, { type: 'restoreFromGrave', values: { targetId: 0, hp: 0 } });
  expect(s.entityStates[0]).toMatchObject({ currentHp: 0, inGrave: false, deathSaveSuccesses: 2, deathSaveFailures: 3 });
  expect(s.initiativeOrder).toEqual([0, 1, 2]);
  const once = structuredClone(s);
  apply(s, { type: 'restoreFromGrave', values: { targetId: 0, hp: 7 } }); expect(s).toEqual(once);
});

test("Restoring above zero clears death saves and raises maximum HP when the chosen HP exceeds it.", () => {
  for (const hp of [3, 15]) {
    const s = state(1); apply(s, bury(0));
    Object.assign(s.entityStates[0], { currentHp: 0, deathSaveSuccesses: 2, deathSaveFailures: 3 });
    apply(s, { type: 'restoreFromGrave', values: { targetId: 0, hp } });
    expect(s.entityStates[0]).toMatchObject({ currentHp: hp, maxHp: hp === 3 ? 10 : 15, deathSaveSuccesses: 0, deathSaveFailures: 0, inGrave: false });
    expect(s.initiativeOrder).toEqual([0]);
  }
});

test("Healing a buried entity restores HP without restoring initiative membership.", () => {
  const s = state(); apply(s, bury(0)); s.entityStates[0].currentHp = 0;
  apply(s, { type: 'heal', values: { targetId: 0, sourceId: 1, amount: 5 } });
  expect(s.entityStates[0]).toMatchObject({ currentHp: 5, inGrave: true });
  expect(s.initiativeOrder).toEqual([1, 2]);
});

test("Death-save updates store supplied counters without healing, burial or turn movement.", () => {
  for (const [successes, failures] of [[3, 0], [0, 3], [2, 1]]) {
    const s = state(); s.entityStates[0].currentHp = 0; const before = structuredClone(s);
    apply(s, { type: 'setDeathSaves', values: { targetId: 0, successes, failures } });
    before.entityStates[0].deathSaveSuccesses = successes; before.entityStates[0].deathSaveFailures = failures;
    expect(s).toEqual(before);
  }
});

test("Adding copies consumes the next instance ID, and deleting every earlier copy never permits an ID to be reused.", () => {
  const s = state(0, { nextInstanceId: 8 });
  for (const id of [8, 9, 10]) {
    apply(s, add()); expect(s.entityStates.map(e => e.instanceId)).toEqual([id]);
    expect(s.nextInstanceId).toBe(id + 1);
    apply(s, { type: 'removeEntity', values: { instanceId: id } });
    expect(s.entityStates).toEqual([]); expect(s.nextInstanceId).toBe(id + 1);
  }
});

test("A second copy labels both copies, while removal and later additions never rename surviving copies.", () => {
  const s = state(0); apply(s, add()); expect(s.entityStates[0].displayName).toBeUndefined();
  apply(s, bury(0)); apply(s, add());
  expect(s.entityStates.map(e => e.displayName)).toEqual(['Goblin 1', 'Goblin 2']);
  apply(s, add({ templateId: 8, name: 'Orc' })); expect(s.entityStates[2].displayName).toBeUndefined();
  apply(s, { type: 'removeEntity', values: { instanceId: 0 } }); apply(s, add());
  expect(s.entityStates.map(e => e.displayName)).toEqual(['Goblin 2', undefined, 'Goblin 3']);
  apply(s, { type: 'removeEntity', values: { instanceId: 3 } }); apply(s, add());
  expect(s.entityStates.map(e => [e.instanceId, e.displayName])).toEqual([[1, 'Goblin 2'], [2, undefined], [4, 'Goblin 3']]);
});

test("A new copy starts with clean combat fields and the applied event's HP and visibility, which later visibility edits can change.", () => {
  for (const [currentHp, expectedHp] of [[undefined, 10], [0, 0], [-5, 0], [4, 4], [15, 10]] as const) {
    for (const hidden of [undefined, true]) {
      const s = state(0); apply(s, add({ currentHp, hidden }));
      expect(s.entityStates).toEqual([entity({ instanceId: 0, templateId: 7, initiative: 0, currentHp: expectedHp, hidden: hidden === true })]);
      for (const value of [true, false]) {
        apply(s, { type: 'setHidden', values: { targetId: 0, hidden: value } });
        expect(s.entityStates[0].hidden).toBe(value);
      }
    }
  }
});

test("Removing an active or buried copy deletes only that member and retains the instance ID watermark.", () => {
  for (const inGrave of [true, false]) {
    const s = state(); if (inGrave) apply(s, bury(1));
    const survivors = structuredClone(s.entityStates.filter(e => e.instanceId !== 1));
    apply(s, { type: 'removeEntity', values: { instanceId: 1 } });
    expect(s.entityStates).toEqual(survivors); expect(s.initiativeOrder).toEqual([0, 2]); expect(s.nextInstanceId).toBe(3);
  }
});

test("Rebuilding initiative sorts descending by initiative and ascending by instance ID, including unburied zero-HP entities and excluding buried ones.", () => {
  const s = state(4); s.entityStates[2].currentHp = 0; apply(s, bury(1));
  apply(s, { type: 'setInitiative', values: { targetId: 3, initiative: 20 } });
  expect(s.initiativeOrder).toEqual([0, 3, 2]);
  apply(s, { type: 'setInitiative', values: { targetId: 1, initiative: 99 } });
  expect(s.initiativeOrder).toEqual([0, 3, 2]); expect(s.entityStates[1].initiative).toBe(99);
  apply(s, { type: 'setInitiative', values: { targetId: 0, initiative: -5 } });
  expect(s.initiativeOrder).toEqual([3, 2, 0]);
});

test("Reordering initiative or restoring another entity preserves the current actor and round while combat runs.", () => {
  const s = state(4, { currentTurn: 2, currentRound: 5 }); apply(s, bury(0));
  apply(s, { type: 'setInitiative', values: { targetId: 3, initiative: 100 } });
  expect(s.initiativeOrder).toEqual([3, 1, 2]); expect(actor(s)).toBe(2); expect(s.currentRound).toBe(5);
  apply(s, { type: 'restoreFromGrave', values: { targetId: 0, hp: 1 } });
  expect(s.initiativeOrder).toEqual([3, 0, 1, 2]); expect(actor(s)).toBe(2); expect(s.currentRound).toBe(5);
});

test("Removing or burying the current actor selects the next survivor in the previous order and increments the round only on wrap.", () => {
  for (const type of ['removeEntity', 'moveToGrave'] as const) {
    for (const [turn, next, round] of [[1, 2, 4], [2, 0, 5]]) {
      const s = state(3, { currentTurn: turn, currentRound: 4 });
      apply(s, type === 'removeEntity' ? { type, values: { instanceId: turn } } : bury(turn));
      expect(actor(s)).toBe(next); expect(s.currentRound).toBe(round);
    }
  }
  const s = state(4, { currentTurn: 1 });
  apply(s, { type: 'setInitiative', values: { targetId: 3, initiative: 99 } });
  apply(s, bury(1)); expect(actor(s)).toBe(2); expect(s.currentRound).toBe(1);
});

test("Emptying initiative resets the turn without advancing the round, and rebuilding outside running keeps turn zero.", () => {
  const s = state(1, { currentRound: 7 }); apply(s, bury(0));
  expect(s.initiativeOrder).toEqual([]); expect(s.currentTurn).toBe(0); expect(s.currentRound).toBe(7);
  apply(s, { type: 'restoreFromGrave', values: { targetId: 0, hp: 0 } });
  expect(actor(s)).toBe(0); expect(s.currentRound).toBe(7);
  for (const phase of ['setup', 'ended'] as const) {
    const other = state(3, { phase, currentTurn: 2, currentRound: 7 });
    apply(other, { type: 'setInitiative', values: { targetId: 2, initiative: 99 } });
    expect(other.currentTurn).toBe(0); expect(other.currentRound).toBe(7);
  }
});

test("Starting prepared combat sorts initiative at round one and turn zero, and ending running combat enters the ended phase.", () => {
  const s = state(3, { phase: 'setup', currentRound: 0 });
  s.entityStates[2].initiative = 99;
  apply(s, { type: 'startCombat', values: {} });
  expect(s).toMatchObject({ phase: 'running', currentRound: 1, currentTurn: 0, initiativeOrder: [2, 0, 1] });
  apply(s, { type: 'nextTurn', values: {} });
  apply(s, { type: 'endCombat', values: {} });
  expect(s).toMatchObject({ phase: 'ended', currentTurn: 1, currentRound: 1 });
});

test("Phase commands in the wrong phase leave the entire state unchanged.", () => {
  for (const phase of ['setup', 'running', 'ended'] as const) {
    for (const type of ['startCombat', 'endCombat', 'nextTurn'] as const) {
      if ((type === 'startCombat' && phase === 'setup') || (type !== 'startCombat' && phase === 'running')) continue;
      const s = state(3, { phase, currentTurn: 1 }); const before = structuredClone(s);
      apply(s, { type, values: {} }); expect(s).toEqual(before);
    }
  }
});

test("Advancing a running turn selects the next actor and increments the round on wrap, while an empty order does not advance the round.", () => {
  const s = state(2, { currentRound: 4 });
  apply(s, { type: 'nextTurn', values: {} }); expect(actor(s)).toBe(1); expect(s.currentRound).toBe(4);
  apply(s, { type: 'nextTurn', values: {} }); expect(actor(s)).toBe(0); expect(s.currentRound).toBe(5);
  const empty = state(0, { currentRound: 5 }); apply(empty, { type: 'nextTurn', values: {} });
  expect(empty.currentTurn).toBe(0); expect(empty.currentRound).toBe(5);
});

test("Reset from every phase returns everyone at full HP to setup and clears combat fields while preserving settings, identity, visibility and the instance ID watermark.", () => {
  for (const phase of ['setup', 'running', 'ended'] as const) {
    const s = state(2, { phase, currentRound: 5, nextInstanceId: 9 });
    s.settings = { ...s.settings, automation: { zeroHpTransfer: 'auto' } };
    for (const e of s.entityStates) Object.assign(e, { hidden: true, displayName: `Copy ${e.instanceId}`, group: 2, currentHp: 0,
      tempHp: 4, deathSaveSuccesses: 2, deathSaveFailures: 3, reactionUsed: true, isConcentrating: true,
      conditions: [{ name: 'poisoned', duration: 3, startedOnRound: 2 }] });
    apply(s, bury(0)); const before = structuredClone(s);
    apply(s, { type: 'resetEncounter', values: {} });
    expect(s).toEqual({ ...before, phase: 'setup', currentRound: 0, currentTurn: 0, initiativeOrder: [0, 1],
      entityStates: before.entityStates.map(e => ({ ...e, inGrave: false, initiative: 0, currentHp: 10, tempHp: 0,
        deathSaveSuccesses: 0, deathSaveFailures: 0, reactionUsed: false, isConcentrating: false, conditions: [] })) });
  }
});

test("An event targeting a missing entity throws before changing the encounter.", () => {
  const events: { [K in EntityEvent['type']]: Extract<EntityEvent, { type: K }> } = {
    damage: { type: 'damage', values: { targetId: 99, sourceId: 0, amount: 1 } },
    heal: { type: 'heal', values: { targetId: 99, sourceId: 0, amount: 1 } },
    setHp: { type: 'setHp', values: { targetId: 99, hp: 1 } },
    setCurrentHp: { type: 'setCurrentHp', values: { targetId: 99, hp: 1 } },
    setTempHp: { type: 'setTempHp', values: { targetId: 99, sourceId: 0, tempHp: 1 } },
    setInitiative: { type: 'setInitiative', values: { targetId: 99, initiative: 1 } },
    setHidden: { type: 'setHidden', values: { targetId: 99, hidden: true } },
    setDeathSaves: { type: 'setDeathSaves', values: { targetId: 99, successes: 1, failures: 1 } },
    moveToGrave: { type: 'moveToGrave', values: { targetId: 99 } },
    restoreFromGrave: { type: 'restoreFromGrave', values: { targetId: 99, hp: 1 } },
  };
  for (const event of Object.values(events)) {
    const s = state(); const before = structuredClone(s);
    expect(() => apply(s, event)).toThrow(); expect(s).toEqual(before);
  }
});

test("Changing encounter settings preserves sibling settings and never buries an entity already at zero HP.", () => {
  const s = state(1); s.entityStates[0].currentHp = 0; s.settings = { ...s.settings, visibility: { monsterHp: 'hidden' } };
  apply(s, { type: 'updateEncounterSettings', values: { patch: { automation: { zeroHpTransfer: 'auto' } } } });
  expect(s.settings).toEqual({ automation: { zeroHpTransfer: 'auto' }, visibility: { monsterHp: 'hidden' } });
  expect(s.entityStates[0].inGrave).toBe(false); expect(s.initiativeOrder).toEqual([0]);
});

test("Valid event sequences preserve HP bounds, initiative membership, unique increasing instance IDs and valid turn bounds after every event (property).", () => {
  const command = fc.record({ kind: fc.constantFrom('add', 'remove', 'bury', 'restore', 'damage', 'heal', 'setHp', 'setCurrentHp', 'temp', 'saves', 'initiative', 'hidden', 'settings', 'phase', 'reset'),
    target: fc.nat(100), amount: fc.integer({ min: 0, max: 50 }), initiative: fc.integer({ min: -20, max: 30 }), flag: fc.boolean() });
  fc.assert(fc.property(fc.array(command, { minLength: 1, maxLength: 40 }), commands => {
    const s = state(2);
    const members = new Map<number, boolean>([[0, false], [1, false]]);
    const history = new Set([0, 1]); let watermark = 2;
    for (const c of commands) {
      const ids = [...members.keys()]; const id = ids[c.target % ids.length];
      let event: DnD5eEncounterEvent;
      if (c.kind === 'add' || (id === undefined && !['settings', 'phase', 'reset'].includes(c.kind))) {
        const newId = s.nextInstanceId; assertFreshId(history, newId);
        history.add(newId); members.set(newId, false);
        event = add({ templateId: c.target % 3, hp: c.amount, currentHp: c.amount / 2, hidden: c.flag });
      } else {
        switch (c.kind) {
          case 'remove': members.delete(id); event = { type: 'removeEntity', values: { instanceId: id } }; break;
          case 'bury': members.set(id, true); event = bury(id); break;
          case 'restore': members.set(id, false); event = { type: 'restoreFromGrave', values: { targetId: id, hp: c.amount } }; break;
          case 'damage': event = damage(id, c.amount); break;
          case 'heal': event = { type: 'heal', values: { sourceId: id, targetId: id, amount: c.amount } }; break;
          case 'setHp': case 'setCurrentHp': event = { type: c.kind, values: { targetId: id, hp: c.amount } }; break;
          case 'temp': event = { type: 'setTempHp', values: { targetId: id, sourceId: id, tempHp: c.amount } }; break;
          case 'saves': event = { type: 'setDeathSaves', values: { targetId: id, successes: c.amount % 4, failures: c.target % 4 } }; break;
          case 'initiative': event = { type: 'setInitiative', values: { targetId: id, initiative: c.initiative } }; break;
          case 'hidden': event = { type: 'setHidden', values: { targetId: id, hidden: c.flag } }; break;
          case 'settings': event = { type: 'updateEncounterSettings', values: { patch: { automation: { zeroHpTransfer: c.flag ? 'auto' : 'manual' } } } }; break;
          case 'reset': for (const key of members.keys()) members.set(key, false); event = { type: 'resetEncounter', values: {} }; break;
          default:
            if (s.phase === 'setup' && s.initiativeOrder.length) event = { type: 'startCombat', values: {} };
            else if (s.phase === 'running') event = { type: c.flag ? 'endCombat' : 'nextTurn', values: {} };
            else { for (const key of members.keys()) members.set(key, false); event = { type: 'resetEncounter', values: {} }; }
        }
      }
      const wasBuried = s.entityStates.find(e => e.instanceId === id)?.inGrave;
      apply(s, event);
      expect(new Set(s.entityStates.map(e => e.instanceId))).toEqual(new Set(members.keys()));
      expect(s.entityStates.map(e => e.instanceId).length).toBe(members.size);
      for (const e of s.entityStates) {
        expect(e.inGrave).toBe(members.get(e.instanceId));
        expect(e.currentHp).toBeGreaterThanOrEqual(0); expect(e.currentHp).toBeLessThanOrEqual(e.maxHp);
        expect(e.tempHp).toBeGreaterThanOrEqual(0); expect(s.nextInstanceId).toBeGreaterThan(e.instanceId);
      }
      const active = [...members].filter(([, grave]) => !grave).map(([key]) => key).sort((a, b) => a - b);
      expect([...s.initiativeOrder].sort((a, b) => a - b)).toEqual(active);
      expect(s.nextInstanceId).toBeGreaterThanOrEqual(watermark); watermark = s.nextInstanceId;
      expect(s.currentTurn).toBeGreaterThanOrEqual(0);
      expect(s.currentTurn).toBeLessThanOrEqual(Math.max(0, active.length - 1));
      if (['setInitiative', 'startCombat', 'resetEncounter'].includes(event.type) || (event.type === 'restoreFromGrave' && wasBuried)) {
        assertSorted(s);
      }
    }
  }), { numRuns: 100 });
});


test.todo('01-F001: Adding an entity during combat inserts it by initiative without changing the current actor');
