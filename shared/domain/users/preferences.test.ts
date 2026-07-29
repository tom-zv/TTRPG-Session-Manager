import { expect, test } from 'vitest';
import { validatePreferencesPatch, mergeUserPreferences, type UserPreferences, type UserPreferencesPatch } from './preferences.js';

test("Preferences accept only sparse encounter defaults for DnD5e and reject unsupported namespaces, systems, nested settings and malformed containers.", () => {
  for (const value of [{}, { encounterDefaults: {} }, { encounterDefaults: { dnd5e: {} } },
    { encounterDefaults: { dnd5e: { automation: { zeroHpTransfer: 'manual' }, visibility: { monsterHp: 'hidden' } } } }]) expect(validatePreferencesPatch(value)).toEqual(value);
  for (const value of [null, [], false, 'x', { theme: 'dark' }, { encounterDefaults: null }, { encounterDefaults: [] },
    { encounterDefaults: { unknown: {} } }, { encounterDefaults: { dnd5e: null } }, { encounterDefaults: { dnd5e: [] } },
    { encounterDefaults: { dnd5e: { unknown: {} } } }, { encounterDefaults: { dnd5e: { automation: { zeroHpTransfer: false } } } },
    { encounterDefaults: { dnd5e: { automation: { extra: true } } } },
    ...['toString', '__proto__', 'constructor'].map(system => ({ encounterDefaults: JSON.parse(`{"${system}":{}}`) as unknown }))]) expect(() => validatePreferencesPatch(value)).toThrow();
});

test("Updating personal encounter defaults merges provided leaves without adding unresolved defaults, mutating inputs or losing other preference namespaces.", () => {
  const current: UserPreferences = { theme: 'dark', audio: { volume: 0.5 }, encounterDefaults: { dnd5e: {
    automation: { zeroHpTransfer: 'auto' }, visibility: { monsterHp: 'hidden' } } } };
  const patch: UserPreferencesPatch = { encounterDefaults: { dnd5e: { automation: { zeroHpTransfer: 'manual' } } } };
  const before = structuredClone(current); const patchBefore = structuredClone(patch);
  expect(mergeUserPreferences(current, patch)).toEqual({ theme: 'dark', audio: { volume: 0.5 }, encounterDefaults: { dnd5e: {
    automation: { zeroHpTransfer: 'manual' }, visibility: { monsterHp: 'hidden' } } } });
  for (const empty of [{}, { encounterDefaults: {} }, { encounterDefaults: { dnd5e: {} } }]) expect(mergeUserPreferences(current, empty)).toEqual(current);
  expect(mergeUserPreferences({}, patch)).toEqual(patch);
  expect(mergeUserPreferences({}, {})).toEqual({}); expect(mergeUserPreferences({}, { encounterDefaults: {} })).toEqual({ encounterDefaults: {} });
  expect(current).toEqual(before); expect(patch).toEqual(patchBefore);
});

