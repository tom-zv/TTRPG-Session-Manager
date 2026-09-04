import { expect, test } from 'vitest';
import { validateSpellInput, type SpellInput } from './spell.js';

const valid: SpellInput = {
  name: 'Ember Lance', source: 'homebrew', level: 2, school: 'evocation', ritual: false, concentration: false,
  castingTime: '1 action', castingUnit: 'action', range: '60 feet', rangeFeet: 60,
  components: { v: true, s: true, m: false }, materialConsumed: false, duration: 'Instantaneous',
  description: 'A lance of fire.', classes: ['Wizard'], damageTypes: ['fire'], saves: [], conditions: [], aliases: [],
};

test('a complete spell validates to the submitted snapshot', () => {
  expect(validateSpellInput(valid)).toEqual({ ok: true, value: valid });
});

test('a malformed spell reports every problem at its input path', () => {
  expect(validateSpellInput({
    ...valid,
    name: ' ',
    level: 10,
    school: 'chronomancy',
    castingUnit: 'turn',
    material: 'a ruby',
    classes: ['Wizard', ''],
    attack: 'thrown',
  })).toEqual({
    ok: false,
    issues: [
      { path: 'name', message: 'Name is required.' },
      { path: 'level', message: 'Level must be a whole number from 0 (cantrip) to 9.' },
      { path: 'school', message: 'Choose a school of magic.' },
      { path: 'castingUnit', message: 'Choose a casting time unit.' },
      { path: 'material', message: 'A material or its cost needs the M component.' },
      { path: 'classes.1', message: 'Classes must be a list of names.' },
      { path: 'attack', message: 'Spell attack must be melee or ranged.' },
    ],
  });
});

test('bad components identify the group and a non-object identifies the whole spell', () => {
  expect(validateSpellInput({ ...valid, components: { v: true, s: 'yes', m: false } })).toEqual({
    ok: false, issues: [{ path: 'components', message: 'Components must say which of V, S and M apply.' }],
  });
  expect(validateSpellInput(null)).toEqual({
    ok: false, issues: [{ path: '', message: 'The spell must be an object.' }],
  });
});
