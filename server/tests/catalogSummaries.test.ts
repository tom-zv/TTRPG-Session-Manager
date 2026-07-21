import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import type { Request, Response } from 'express';
import { dnd5ePool } from '../src/db.js';
import { fetchAllSpells } from '../src/api/encounter/spells/spellModel.js';
import { spellDbToSummary } from '../src/utils/format-transformers/encounter-transformers/dnd5e/spell-transformer.js';
import controller from '../src/api/encounter/entities/entityController.js';
import service from '../src/api/encounter/entities/entityService.js';
import { ValidationError } from '../src/api/HttpErrors.js';

afterEach(() => mock.restoreAll());

test('spell catalog selects summary columns and relevant tags, retaining filters and aliases', async () => {
  const queries: string[] = [];
  mock.method(dnd5ePool, 'query', async (sql: string) => {
    queries.push(sql);
    return sql.includes('FROM dnd5e.spells') ? [[{
      id: 1, name: 'Fireball', source: 'XPHB', level: 3, school: 'evocation', ritual: 0,
      concentration: 1, casting_time: '1 action', casting_unit: 'action', comp_v: 1, comp_s: 1, comp_m: 0,
    }]] : [[
      { spell_id: 1, tag_type: 'alias', tag: 'Fire ball' },
      { spell_id: 1, tag_type: 'class', tag: 'Wizard' },
      { spell_id: 1, tag_type: 'damage', tag: 'fire' },
      { spell_id: 1, tag_type: 'save', tag: 'dexterity' },
    ]];
  });
  const [result] = await fetchAllSpells(dnd5ePool);
  const summary = spellDbToSummary(result.spell, result.tags);
  assert.equal(queries.length, 2);
  assert.doesNotMatch(queries[0], /SELECT \*|description|higher_levels/);
  assert.match(queries[1], /tag_type IN \('class', 'damage', 'save', 'alias'\)/);
  assert.deepEqual(summary.aliases, ['Fire ball']);
  assert.deepEqual(summary.classes, ['Wizard']);
  assert.deepEqual(summary.damageTypes, ['fire']);
  assert.deepEqual(summary.saves, ['dexterity']);
  assert.equal(summary.concentration, true);
  assert.deepEqual(summary.components, { v: true, s: true, m: false });
  assert.equal('description' in summary, false);
});

test('batch rejects invalid inputs before the service and deduplicates valid IDs', async () => {
  const calls: number[][] = [];
  mock.method(service, 'getEntitiesByIds', async (_system: string, ids: number[]) => { calls.push(ids); return []; });
  let body: unknown;
  const res = { status: () => res, json: (value: unknown) => { body = value; } } as unknown as Response;
  for (const entityIds of [undefined, null, [], '1', [0], [-1], [1.2], ['1'], [null], [Number.MAX_SAFE_INTEGER + 1], Array(101).fill(1)]) {
    let error: unknown;
    await controller.getEntitiesByIds({ params: { system: 'dnd5e' }, body: { entityIds } } as unknown as Request, res, err => { error = err; });
    assert.ok(error instanceof ValidationError);
  }
  assert.equal(calls.length, 0);
  await controller.getEntitiesByIds({ params: { system: 'dnd5e' }, body: { entityIds: [2, 1, 2] } } as unknown as Request, res, error => { throw error; });
  assert.deepEqual(calls, [[2, 1]]);
  assert.deepEqual(body, { entities: [] });
});
