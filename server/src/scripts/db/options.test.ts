import { expect, test } from 'vitest';
import { parseDbOptions, resetConfirmation } from './options.js';

test('a reset without targets resets core and dnd5e and leaves audio alone', () => {
  expect(parseDbOptions(['reset']).schemas).toEqual(['core', 'dnd5e']);
});

test('a reset of core or dnd5e alone resets both, because dnd5e has foreign keys to core', () => {
  for (const target of ['core', 'dnd5e']) {
    const options = parseDbOptions(['reset', target]);
    expect(options.schemas).toEqual(['core', 'dnd5e']);
    expect(options.notes).toHaveLength(1);
  }
});

test('a reset of core and dnd5e needs a prompt unless --yes or --test is given', () => {
  expect(resetConfirmation(parseDbOptions(['reset']))).toEqual({ kind: 'prompt' });
  expect(resetConfirmation(parseDbOptions(['reset', '--yes']))).toEqual({ kind: 'none' });
  expect(resetConfirmation(parseDbOptions(['reset', '--test']))).toEqual({ kind: 'none' });
});

test('a reset that includes audio needs "audio" typed, and --yes does not skip it', () => {
  for (const target of ['audio', 'all']) {
    expect(resetConfirmation(parseDbOptions(['reset', target, '--yes']))).toEqual({ kind: 'typed', word: 'audio' });
  }
});

test('an unknown command or argument is refused instead of falling back to a default', () => {
  expect(() => parseDbOptions(['drop'])).toThrow(/Unknown command/);
  expect(() => parseDbOptions(['reset', 'everything'])).toThrow(/Unknown argument/);
});
