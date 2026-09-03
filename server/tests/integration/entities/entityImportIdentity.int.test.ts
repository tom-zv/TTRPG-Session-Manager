import mysql, { type RowDataPacket } from 'mysql2/promise';
import { expect, test } from 'vitest';
import type { DnD5eEntityDetails, DnD5eEntitySummary } from 'shared/domain/encounters/dnd5e/entity.js';
import { dbConfig } from 'src/config/server-config.js';
import { dnd5ePool } from 'src/db.js';
import { import5eToolsEntities } from 'src/services/5etools/5eToolsEntityImportService.js';
import type { FiveEToolsMonster } from 'src/utils/5etools/types.js';
import { createGm } from '../../support/factories.js';
import { asToken, createHttpAgent } from '../../support/http.js';

const entitiesUrl = '/api/dnd5e/entities';
const goblin = { name: 'Storm Goblin', source: 'MM', page: 166, hp: { average: 7, formula: '2d6' } };

async function setup() {
  const http = createHttpAgent();
  const { token } = await createGm();
  const post = (data: unknown) => asToken(http.post(entitiesUrl), token).send({ data });
  const put = (id: number, data: unknown, overwriteImported?: boolean) =>
    asToken(http.put(`${entitiesUrl}/${id}`), token).send({ data, ...(overwriteImported === undefined ? {} : { overwriteImported }) });
  const get = async (id: number) =>
    ((await asToken(http.get(`${entitiesUrl}/${id}`), token).expect(200)).body as { entity: DnD5eEntityDetails }).entity;
  const summaries = async () =>
    ((await asToken(http.get(`${entitiesUrl}/summary`), token).expect(200)).body as { entities: DnD5eEntitySummary[] }).entities;
  return { post, put, get, summaries };
}

async function importGoblin(options: { force?: boolean } = {}, monster: FiveEToolsMonster = goblin) {
  const result = await import5eToolsEntities([monster], options);
  return result.results[0];
}

async function importedGoblinId(): Promise<number> {
  const result = await importGoblin();
  expect(result).toMatchObject({ status: 'inserted' });
  if (result.entityId === undefined) throw new Error('The test monster was not imported.');
  return result.entityId;
}

test('a PUT on an imported entity is refused until the overwrite is confirmed, which marks it edited', async () => {
  const { put, get, summaries } = await setup();
  const id = await importedGoblinId();
  const imported = await get(id);
  expect(imported).toMatchObject({ source: 'MM', page: 166, imported: true, locallyEdited: false, hp: 7 });

  const refused = await put(id, { hp: 9 }).expect(409);
  expect(refused.body).toMatchObject({ message: expect.any(String) });
  expect(await get(id)).toEqual(imported);

  const saved = await put(id, { hp: 9 }, true).expect(200);
  expect(saved.body).toMatchObject({ entity: { hp: 9, source: 'MM', imported: true, locallyEdited: true } });
  expect(await get(id)).toEqual((saved.body as { entity: DnD5eEntityDetails }).entity);
  expect(await summaries()).toEqual([expect.objectContaining({
    templateId: id, source: 'MM', page: 166, imported: true, locallyEdited: true,
  })]);
});

test('a re-import skips an edited entity, and a forced re-import overwrites it and clears the mark', async () => {
  const { put, get } = await setup();
  const id = await importedGoblinId();
  await put(id, { hp: 9 }, true).expect(200);

  const updatedUpstream = { ...goblin, hp: { average: 11, formula: '3d6 + 1' } };
  expect(await importGoblin({}, updatedUpstream)).toMatchObject({
    status: 'skipped', entityId: id, reason: expect.stringContaining('--force'),
  });
  expect(await get(id)).toMatchObject({ hp: 9, locallyEdited: true });

  expect(await importGoblin({ force: true }, updatedUpstream)).toMatchObject({ status: 'updated', entityId: id });
  expect(await get(id)).toMatchObject({ hp: 11, hpFormula: '3d6 + 1', imported: true, locallyEdited: false });
});

test('a renamed imported entity still matches its import key on re-import', async () => {
  const { put, get, summaries } = await setup();
  const id = await importedGoblinId();
  await put(id, { name: 'Gale Goblin' }, true).expect(200);

  expect(await importGoblin()).toMatchObject({ status: 'skipped', entityId: id });
  expect(await importGoblin({ force: true })).toMatchObject({ status: 'updated', entityId: id });
  expect(await get(id)).toMatchObject({ name: 'Storm Goblin', locallyEdited: false });
  expect(await summaries()).toHaveLength(1);
});

test('a POST that sends provenance fields is still stored as homebrew', async () => {
  const { post, put, get } = await setup();
  const created = await post({
    name: 'Storm Goblin', source: 'MM', page: 166, imported: true, locallyEdited: true, importKey: 'storm goblin|mm',
  }).expect(201);
  const { entity } = created.body as { entity: DnD5eEntityDetails };
  expect(entity).toMatchObject({ source: 'homebrew', imported: false, locallyEdited: false });
  expect(entity).not.toHaveProperty('page');

  // Homebrew needs no overwrite confirmation, and the import creates its own row.
  await put(entity.templateId, { hp: 4 }).expect(200);
  expect(await importGoblin()).toMatchObject({ status: 'inserted' });
  expect(await get(entity.templateId)).toMatchObject({ hp: 4, source: 'homebrew', imported: false });
});

/** Waits until some transaction is blocked on a row lock. */
async function waitForLockWait(connection: mysql.Connection): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const [rows] = await connection.query<RowDataPacket[]>(
      'SELECT 1 FROM performance_schema.data_lock_waits LIMIT 1');
    if (rows.length > 0) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('No transaction waited for a row lock.');
}

/**
 * Holds the core row of an entity in a transaction, runs `blocked` until it waits for that lock, then
 * deletes the entity through the same cascading DELETE as the model and commits. A write that locked
 * the D&D row first would deadlock with that DELETE.
 */
async function deleteWhileWriteWaits<T>(entityId: number, blocked: () => Promise<T>): Promise<T> {
  const holder = await mysql.createConnection(dbConfig);
  try {
    await holder.beginTransaction();
    await holder.query('SELECT id FROM core.entities WHERE id = ? FOR UPDATE', [entityId]);
    const pending = blocked();
    const settled = pending.then(() => undefined, () => undefined);
    const observer = await mysql.createConnection(dbConfig);
    try {
      await waitForLockWait(observer);
    } finally {
      await observer.end();
    }
    const [deleted] = await holder.query<mysql.ResultSetHeader>('DELETE FROM core.entities WHERE id = ?', [entityId]);
    expect(deleted.affectedRows).toBe(1);
    await holder.commit();
    await settled;
    return await pending;
  } finally {
    await holder.end();
  }
}

test('a template PUT that waits on a deleting transaction ends as not found instead of deadlocking', async () => {
  const { post, put } = await setup();
  const id = ((await post({ name: 'Doomed Goblin' }).expect(201)).body as { entity: DnD5eEntityDetails }).entity.templateId;

  const response = await deleteWhileWriteWaits(id, async () => await put(id, { name: 'Renamed Goblin', hp: 9 }));
  expect(response.status).toBe(404);
});

test('a re-import that waits on a deleting transaction inserts the entity again instead of deadlocking', async () => {
  const id = await importedGoblinId();

  const result = await deleteWhileWriteWaits(id, () => import5eToolsEntities([goblin], { force: true }));
  expect(result).toMatchObject({ failed: 0, inserted: 1, updated: 0 });
  const [rows] = await dnd5ePool.query<RowDataPacket[]>('SELECT id, import_key FROM entities WHERE import_key = ?', ['storm goblin|mm']);
  expect(rows).toHaveLength(1);
  expect(rows[0].id).not.toBe(id);
});
