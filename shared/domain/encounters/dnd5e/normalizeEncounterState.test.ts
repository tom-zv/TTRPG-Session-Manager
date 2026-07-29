import { expect, test } from 'vitest';
import fc from 'fast-check';
import { normalizeDnD5eEncounterState as normalize } from './normalizeEncounterState.js';
import type { DnD5eEncounterState } from './encounter.js';
import { state, entity } from './testSupport.js';

// Persisted JSON predates the current required fields and is untrusted at this seam.
const load = (value: unknown) => normalize(value as DnD5eEncounterState);

test("Legacy snapshots infer setup at round zero and running at positive rounds, preserve explicit valid phases, and default missing grave, hidden and settings fields without burying zero-HP members.", () => {
  for (const [round, inferred] of [[0, 'setup'], [3, 'running']] as const) {
    for (const phase of [undefined, 'invalid', 'setup', 'running', 'ended']) {
      const legacy = { ...state(1), phase, currentRound: round, settings: undefined,
        entityStates: [{ ...entity({ currentHp: 0 }), inGrave: undefined, hidden: undefined }] };
      const result = load(legacy);
      expect(result.phase).toBe(phase === 'setup' || phase === 'running' || phase === 'ended' ? phase : inferred);
      expect(result.settings).toEqual({ automation: { zeroHpTransfer: 'manual' }, visibility: { monsterHp: 'status' } });
      expect(result.entityStates[0]).toMatchObject({ inGrave: false, hidden: false, currentHp: 0 });
      expect(result.initiativeOrder).toEqual([0]);
    }
  }
  const s = state(1); s.entityStates[0].hidden = true; s.entityStates[0].inGrave = true;
  expect(load(s).entityStates[0]).toMatchObject({ hidden: true, inGrave: true });
});

test("Loading a snapshot raises a missing, invalid or low instance ID watermark above every member ID and preserves a higher watermark after removals.", () => {
  for (const nextInstanceId of [undefined, null, '9', NaN, Infinity, 2.5, -2, 1, 20]) {
    const s = state(1, { entityStates: [entity({ instanceId: 8 })], initiativeOrder: [8] });
    expect(load({ ...s, nextInstanceId }).nextInstanceId).toBe(nextInstanceId === 20 ? 20 : 9);
  }
  expect(load({ ...state(0), nextInstanceId: undefined }).nextInstanceId).toBe(0);
  expect(load(state(0, { nextInstanceId: 20 })).nextInstanceId).toBe(20);
  expect(load(state(1, { nextInstanceId: 20 })).nextInstanceId).toBe(20);
});

test("Loading a snapshot deduplicates initiative and removes unknown and buried IDs while preserving retained order and the surviving actor.", () => {
  const s = state(4, { initiativeOrder: [2, 0, 2, 99, 1, 3], currentTurn: 4, currentRound: 5 });
  s.entityStates[0].inGrave = true;
  const retained = load(s); expect(retained.initiativeOrder).toEqual([2, 1, 3]);
  expect(retained.initiativeOrder[retained.currentTurn]).toBe(1); expect(retained.currentRound).toBe(5);
  s.currentTurn = 5; s.entityStates[3].inGrave = true;
  const wrapped = load(s); expect(wrapped.initiativeOrder).toEqual([2, 1]);
  expect(wrapped.initiativeOrder[wrapped.currentTurn]).toBe(2); expect(wrapped.currentRound).toBe(6);
  for (const phase of ['setup', 'ended'] as const) expect(load({ ...s, phase }).currentTurn).toBe(0);
});

test("Normalizing a supported legacy or current snapshot leaves its input unchanged and gives the same result on a second normalization (property).", () => {
  const optionalFlag = fc.option(fc.boolean(), { nil: undefined });
  const member = fc.record({ hp: fc.integer({ min: 0, max: 30 }), inGrave: optionalFlag, hidden: optionalFlag,
    conditions: fc.array(fc.record({ name: fc.constantFrom('poisoned', 'prone'), duration: fc.option(fc.nat(10)), startedOnRound: fc.option(fc.nat(5)) }), { maxLength: 3 }) });
  const legacy = fc.record({ members: fc.array(member, { maxLength: 8 }),
    order: fc.array(fc.integer({ min: 0, max: 12 }), { maxLength: 15 }),
    phase: fc.constantFrom(undefined, 'broken', 'setup', 'running', 'ended'),
    settings: fc.constantFrom(undefined, null, [], { automation: { zeroHpTransfer: 'auto' } }, { visibility: { monsterHp: 'bad' } }),
    nextInstanceId: fc.oneof(fc.constant(undefined), fc.constant(null), fc.constant(1.5), fc.integer({ min: -2, max: 30 })),
    round: fc.nat(5), turn: fc.nat(15) });
  fc.assert(fc.property(legacy, value => {
    const input = { ...state(0), phase: value.phase, settings: value.settings, currentRound: value.round,
      currentTurn: value.turn, nextInstanceId: value.nextInstanceId, initiativeOrder: value.order,
      entityStates: value.members.map((m, i) => ({ ...entity({ instanceId: i, maxHp: m.hp, currentHp: m.hp }),
        inGrave: m.inGrave, hidden: m.hidden, conditions: m.conditions })) };
    const before = structuredClone(input); const result = load(input);
    expect(input).toEqual(before); expect(load(result)).toEqual(result);
  }), { numRuns: 100 });
});

