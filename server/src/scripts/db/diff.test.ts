import { expect, test } from 'vitest';
import { diffTableDefinitions, type TableDefinitions } from './diff.js';

const spells = [
  'CREATE TABLE `spells` (',
  '  `id` int NOT NULL AUTO_INCREMENT,',
  '  `name` varchar(255) NOT NULL,',
  '  `level` tinyint NOT NULL,',
  '  PRIMARY KEY (`id`)',
  ') ENGINE=InnoDB',
].join('\n');

const definitions = (entries: Record<string, string>): TableDefinitions => new Map(Object.entries(entries));

test('identical tables give no differences', () => {
  expect(diffTableDefinitions(definitions({ 'dnd5e.spells': spells }), definitions({ 'dnd5e.spells': spells }))).toEqual([]);
});

test('a table only the create scripts define is missing, and one only the database has is extra', () => {
  expect(diffTableDefinitions(definitions({ 'dnd5e.spells': spells }), definitions({ 'dnd5e.spell_tags': spells }))).toEqual([
    { table: 'dnd5e.spell_tags', kind: 'extra' },
    { table: 'dnd5e.spells', kind: 'missing' },
  ]);
});

test('a manually added column in the wrong position is a difference, listing only the moved line', () => {
  const expected = spells.replace('  `level`', '  `school` varchar(32) NOT NULL,\n  `level`');
  const actual = spells.replace('  PRIMARY KEY', '  `school` varchar(32) NOT NULL,\n  PRIMARY KEY');
  const [difference, ...rest] = diffTableDefinitions(definitions({ 'dnd5e.spells': expected }), definitions({ 'dnd5e.spells': actual }));
  expect(rest).toEqual([]);
  expect(difference).toMatchObject({ table: 'dnd5e.spells', kind: 'changed' });
  const lines = difference.kind === 'changed' ? difference.lines : [];
  expect(lines).toHaveLength(2);
  expect(lines.map(line => line.slice(2))[0]).toBe(lines[1].slice(2));
  expect(lines.map(line => line[0]).sort()).toEqual(['+', '-']);
});

test('a changed column type lists the create-script line and the database line', () => {
  const actual = spells.replace('`name` varchar(255)', '`name` varchar(64)');
  expect(diffTableDefinitions(definitions({ 'dnd5e.spells': spells }), definitions({ 'dnd5e.spells': actual }))).toEqual([{
    table: 'dnd5e.spells',
    kind: 'changed',
    lines: ['- `name` varchar(255) NOT NULL,', '+ `name` varchar(64) NOT NULL,'],
  }]);
});
