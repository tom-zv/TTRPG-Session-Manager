import { describe, expect, test } from 'vitest';
import { validateExpectedRevision, validateInventory, validateInventoryAppend } from './inventory.js';

describe('inventory rows', () => {
  test('a legacy free-text list validates to the same rows, with no link added', () => {
    const legacy = [
      { name: 'Potion of healing', quantity: 2, notes: 'From the temple' },
      { name: 'Iron key', quantity: 1 },
      { name: 'Potion of healing', quantity: 1 },
    ];
    const validated = validateInventory(structuredClone(legacy));
    expect(validated).toEqual(legacy);
    expect(validated.some(row => 'itemId' in row)).toBe(false);
  });

  test('a row linked to a catalog item keeps its link and saved name; a null link is a free-text row', () => {
    const rows = [
      { name: ' Longsword +1 ', quantity: 1, itemId: 42 },
      { name: 'Rope', quantity: 1, itemId: null, notes: ' 50 feet ' },
    ];
    expect(validateInventory(rows)).toEqual([
      { name: 'Longsword +1', quantity: 1, itemId: 42 },
      { name: 'Rope', quantity: 1, notes: '50 feet' },
    ]);
    expect('itemId' in validateInventory(rows)[1]).toBe(false);
  });

  test('a link that is not a catalog item id rejects the whole list and names the row', () => {
    for (const itemId of [0, -3, 1.5, '42', true, 2 ** 31, {}]) {
      expect(() => validateInventory([{ name: 'Rope', quantity: 1 }, { name: 'Sword', quantity: 1, itemId }]))
        .toThrow(/^Item 2: itemId/);
    }
  });
});

describe('inventory revisions', () => {
  test('an omitted expectedRevision means an unconditional replacement; a whole revision is kept as sent', () => {
    expect(validateExpectedRevision(undefined)).toBeUndefined();
    expect(validateExpectedRevision(0)).toBe(0);
    expect(validateExpectedRevision(17)).toBe(17);
  });

  test('a malformed expectedRevision is rejected rather than treated as omitted', () => {
    for (const value of [null, -1, 2.5, '3', false, 2 ** 32, Number.NaN]) {
      expect(() => validateExpectedRevision(value)).toThrow(/expectedRevision/);
    }
  });
});

describe('appending a catalog item', () => {
  test('an append names a catalog item and a quantity, with trimmed optional notes', () => {
    expect(validateInventoryAppend({ itemId: 7, quantity: 3, notes: '  spare  ' })).toEqual({ itemId: 7, quantity: 3, notes: 'spare' });
    expect(validateInventoryAppend({ itemId: 7, quantity: 1, notes: '   ' })).toEqual({ itemId: 7, quantity: 1 });
  });

  test('an append without a valid catalog item or quantity is rejected', () => {
    for (const body of [null, [], {}, { quantity: 1 }, { itemId: null, quantity: 1 }, { itemId: 0, quantity: 1 },
      { itemId: 7 }, { itemId: 7, quantity: 0 }, { itemId: 7, quantity: 1, notes: 5 }]) {
      expect(() => validateInventoryAppend(body)).toThrow();
    }
  });
});
