import { expect, test } from 'vitest';
import { validateEncounterSettingsPatch, validateEntitySettingsPatch, resolveEncounterSettings, usesDeathSaves } from './settings.js';

test("Encounter and entity settings writes accept sparse supported values and reject unknown groups, keys, invalid enums, nonboolean values and malformed containers.", () => {
  for (const value of [{}, { automation: {} }, { visibility: {} }, { automation: { zeroHpTransfer: 'auto' } },
    { automation: { zeroHpTransfer: 'manual' }, visibility: { monsterHp: 'exact' } },
    ...['status', 'hidden'].map(monsterHp => ({ visibility: { monsterHp } }))]) expect(validateEncounterSettingsPatch(value)).toEqual(value);
  for (const value of [{}, { combat: {} }, { party: {} }, { combat: { deathSaves: false }, party: { member: true } },
    { combat: { deathSaves: true }, party: { member: false } }]) expect(validateEntitySettingsPatch(value)).toEqual(value);
  for (const validate of [validateEncounterSettingsPatch, validateEntitySettingsPatch]) {
    for (const value of [null, [], 'x', 1, false, { unknown: {} }]) expect(() => validate(value)).toThrow();
  }
  for (const value of [{ automation: null }, { automation: [] }, { automation: true }, { visibility: 'status' },
    { visibility: { hp: 'exact' } }, { visibility: { monsterHp: false } }, { visibility: { monsterHp: 'bad' } },
    { automation: { zeroHpTransfer: 'sometimes' } }, { automation: { zeroHpTransfer: null } }]) expect(() => validateEncounterSettingsPatch(value)).toThrow();
  for (const value of [{ combat: null }, { combat: [] }, { party: false }, { combat: { other: true } },
    { combat: { deathSaves: 'false' } }, { combat: { deathSaves: 0 } }, { party: { member: null } }]) expect(() => validateEntitySettingsPatch(value)).toThrow();
});

test("Resolving encounter settings fills missing or invalid leaves from defaults while preserving valid siblings and producing independent results.", () => {
  const defaults = { automation: { zeroHpTransfer: 'manual' }, visibility: { monsterHp: 'status' } };
  for (const value of [undefined, null, [], false, { automation: { zeroHpTransfer: 'bad' } }, { visibility: null }]) expect(resolveEncounterSettings(value)).toEqual(defaults);
  const stored = { automation: { zeroHpTransfer: 'bad', future: true }, visibility: { monsterHp: 'hidden' }, unknown: {} };
  const before = structuredClone(stored);
  expect(resolveEncounterSettings(stored)).toEqual({ automation: { zeroHpTransfer: 'manual' }, visibility: { monsterHp: 'hidden' } });
  expect(resolveEncounterSettings({ automation: { zeroHpTransfer: 'auto' }, visibility: { monsterHp: 'bad' } })).toEqual({ automation: { zeroHpTransfer: 'auto' }, visibility: { monsterHp: 'status' } });
  const first = resolveEncounterSettings(stored); (first.visibility as { monsterHp: string }).monsterHp = 'exact';
  (first.automation as { zeroHpTransfer: string }).zeroHpTransfer = 'auto';
  expect(resolveEncounterSettings(stored).visibility.monsterHp).toBe('hidden'); expect(resolveEncounterSettings()).toEqual(defaults);
  expect(stored).toEqual(before);
});

test("PCs always use death saves, NPCs use them only when enabled, and creatures never use them.", () => {
  for (const role of ['pc', 'npc', 'creature']) {
    for (const enabled of [undefined, false, true]) {
      for (const member of [false, true]) {
        const settings = enabled === undefined ? undefined : { combat: { deathSaves: enabled }, party: { member } };
        expect(usesDeathSaves({ role, settings })).toBe(role === 'pc' || (role === 'npc' && enabled === true));
      }
    }
  }
});

