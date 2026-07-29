import { expect, test } from 'vitest';
import { mergeSettings, type SettingsPatch } from './settings.js';

type Schema = { combat: {
  enabled: { type: 'boolean'; defaultValue: false; label: ''; help: '' };
  mode: { type: 'enum'; values: ['manual', 'auto']; defaultValue: 'manual'; label: ''; help: '' };
} }; // A two-leaf group exposes accidental whole-group replacement.

test("Settings patches replace only provided leaves, preserve false and unknown stored siblings, and do not mutate either input.", () => {
  const current: { combat: { enabled: boolean; mode: 'manual' | 'auto'; future: number }; other: { preserved: boolean } } = { combat: { enabled: true, mode: 'auto', future: 9 }, other: { preserved: true } };
  const patch: SettingsPatch<Schema> = { combat: { enabled: false } };
  const before = structuredClone(current); const patchBefore = structuredClone(patch);
  expect(mergeSettings(current, patch)).toEqual({ combat: { enabled: false, mode: 'auto', future: 9 }, other: { preserved: true } });
  expect(mergeSettings(current, {})).toEqual(current);
  expect(mergeSettings(current, { combat: {} })).toEqual(current);
  expect(current).toEqual(before); expect(patch).toEqual(patchBefore);
});

test.todo('01-F003: Settings validation rejects inherited property names as unsupported groups');
