import { describe, expect, test } from 'vitest';
import { itemAliasKey, validateItemInput, type ItemInput } from './item.js';

const valid = (): ItemInput => ({
  name: 'Ember Blade',
  source: 'homebrew',
  page: 12,
  category: 'melee weapon',
  rarity: 'rare',
  requiresAttunement: true,
  attunementNote: 'by a sorcerer',
  valueCp: 50000,
  weightLb: 3,
  aliases: ['Cinder Sword'],
  baseItemId: 4,
  details: {
    description: 'While you hold it, the blade sheds dim light.',
    weaponCategory: 'martial',
    damage: { dice: '1d8', type: 'slashing', versatileDice: '1d10' },
    properties: ['Versatile'],
    mastery: ['Sap'],
    bonusWeapon: '+1',
    charges: 3,
    recharge: 'dawn',
    rechargeAmount: '1d3',
    spells: [{ name: 'Burning Hands', source: 'XPHB' }, { name: 'Light' }],
  },
});

const errorsOf = (input: unknown): string[] => {
  const result = validateItemInput(input);
  return result.ok ? [] : result.errors;
};

describe('GM item input', () => {
  test('a complete item validates to the same item', () => {
    expect(validateItemInput(valid())).toEqual({ ok: true, value: valid() });
  });

  test('optional attunement retains its note and cannot also be required', () => {
    expect(validateItemInput({ ...valid(), requiresAttunement: false, attunementNote: ' optional ' }))
      .toMatchObject({ ok: true, value: { requiresAttunement: false, attunementNote: 'Optional' } });
    expect(validateItemInput({ ...valid(), attunementNote: 'Optional' }).ok).toBe(false);
  });

  test('text is trimmed and blank optional fields are dropped', () => {
    const input = {
      ...valid(), name: '  Ember Blade ', category: '', attunementNote: '   ', aliases: [' Cinder Sword '],
      details: { description: ' Glows. ', range: '', bonusAc: '  ' },
    };
    const result = validateItemInput(input);
    expect(result.ok && result.value).toEqual({
      ...valid(), category: undefined, attunementNote: undefined, details: { description: 'Glows.' },
    });
    expect(result.ok && Object.keys(result.value)).not.toContain('category');
    expect(result.ok && Object.keys(result.value.details)).toEqual(['description']);
  });

  test('stored upstream data and unknown fields sent back by a client never reach the validated item', () => {
    const echoed = {
      ...valid(), id: 9, kind: 'named', gm: { hidden: true }, importKey: 'named:ember blade|homebrew',
      details: { ...valid().details, upstream: { reqAttuneTags: [{ class: 'sorcerer' }] }, curse: true },
    };
    const result = validateItemInput(echoed);
    expect(result).toEqual({ ok: true, value: valid() });
  });

  test('values and weights keep exact fractions up to four decimal places', () => {
    const result = validateItemInput({ ...valid(), valueCp: 10000000.0005, weightLb: 0.075 });
    expect(result.ok && [result.value.valueCp, result.value.weightLb]).toEqual([10000000.0005, 0.075]);
    expect(errorsOf({ ...valid(), weightLb: 0.00001 })).toEqual([expect.stringMatching(/^Weight/)]);
    expect(errorsOf({ ...valid(), valueCp: 0.00000000001 })).toEqual([expect.stringMatching(/^Value/)]);
    expect(errorsOf({ ...valid(), valueCp: 1.23456 })).toEqual([expect.stringMatching(/^Value/)]);
  });

  test('initial charges can be a formula without evaluating it', () => {
    const result = validateItemInput({ ...valid(), details: { charges: ' 1d6 + 1 ' } });
    expect(result.ok && result.value.details.charges).toBe('1d6 + 1');
  });

  test('accent-distinct aliases can be stored under distinct keys', () => {
    const aliases = ['Resume', 'Résumé'];
    const result = validateItemInput({ ...valid(), aliases });
    expect(result.ok && result.value.aliases).toEqual(aliases);
    expect(aliases.map(itemAliasKey)).toEqual(['resume', 'résumé']);
    expect(errorsOf({ ...valid(), aliases: ['Résumé', 'Re\u0301sume\u0301'] }))
      .toContainEqual(expect.stringMatching(/must not repeat/));
  });

  const malformed: [string, unknown, RegExp][] = [
    ['not an object', 'Ember Blade', /must be an object/],
    ['blank name', { ...valid(), name: '   ' }, /^Name is required/],
    ['name too long', { ...valid(), name: 'x'.repeat(256) }, /^Name can be at most/],
    ['missing source', { ...valid(), source: undefined }, /^Source is required/],
    ['upstream type code as category', { ...valid(), category: 'M' }, /item category/],
    ['unknown rarity', { ...valid(), rarity: 'mythic' }, /rarity/],
    ['attunement not a flag', { ...valid(), requiresAttunement: 'yes' }, /^Requires attunement/],
    ['attunement note without attunement', { ...valid(), requiresAttunement: false }, /attunement note/i],
    ['negative value', { ...valid(), valueCp: -1 }, /^Value/],
    ['weight as text', { ...valid(), weightLb: '3' }, /^Weight/],
    ['fractional page', { ...valid(), page: 1.5 }, /^Page/],
    ['missing aliases', { ...valid(), aliases: undefined }, /^Aliases/],
    ['repeated alias', { ...valid(), aliases: ['Cinder Sword', 'cinder sword'] }, /must not repeat/],
    ['base item id out of range', { ...valid(), baseItemId: 2 ** 31 }, /^Base item/],
    ['details missing', { ...valid(), details: undefined }, /^Details/],
    ['unknown weapon category', { ...valid(), details: { weaponCategory: 'exotic' } }, /Weapon category/],
    ['damage without dice', { ...valid(), details: { damage: { type: 'fire' } } }, /^Damage dice/],
    ['negative charges', { ...valid(), details: { charges: -1 } }, /^Charges/],
    ['armor class as text', { ...valid(), details: { armorClass: '18' } }, /^Armor class/],
    ['spell without a name', { ...valid(), details: { spells: [{ source: 'XPHB' }] } }, /^Spell 1/],
    ['properties not names', { ...valid(), details: { properties: [3] } }, /^Properties/],
  ];
  test.each(malformed)('a malformed item is rejected with a message naming the problem: %s', (_label, input, message) => {
    expect(validateItemInput(input).ok).toBe(false);
    expect(errorsOf(input)).toContainEqual(expect.stringMatching(message));
  });

  test('every problem is reported at once', () => {
    expect(errorsOf({ name: '', source: '', rarity: 'x', requiresAttunement: 1, aliases: 'a', details: [] })).toHaveLength(6);
  });
});
