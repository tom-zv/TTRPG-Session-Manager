import { readFile } from 'node:fs/promises';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { expect, test } from 'vitest';
import type { DnD5eEntityDetails, DnD5eEntitySummary } from 'shared/domain/encounters/dnd5e/entity.js';
import { dbConfig } from 'src/config/server-config.js';
import { dnd5ePool } from 'src/db.js';
import { import5eToolsEntities } from 'src/services/5etools/5eToolsEntityImportService.js';
import { entityImportKey } from 'src/services/5etools/5eToolsEntityImportRepository.js';
import type { FiveEToolsMonster } from 'src/utils/5etools/types.js';
import { createGm } from '../../support/factories.js';
import { asToken, createHttpAgent } from '../../support/http.js';

const entitiesUrl = '/api/dnd5e/entities';
const migrationUrl = new URL('../../../db/migrations/20261120_entity_import_identity.sql', import.meta.url);
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

interface ColumnRow extends RowDataPacket {
  name: string;
  position: number;
  type: string;
  nullable: string;
  defaultValue: string | null;
  collation: string | null;
}

async function describeEntities(connection: mysql.Connection) {
  const [columns] = await connection.query<ColumnRow[]>(`
    SELECT COLUMN_NAME AS name, ORDINAL_POSITION AS position, COLUMN_TYPE AS type, IS_NULLABLE AS nullable,
           COLUMN_DEFAULT AS defaultValue, COLLATION_NAME AS collation
    FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'dnd5e' AND TABLE_NAME = 'entities'
    ORDER BY ORDINAL_POSITION`);
  const [indexes] = await connection.query<RowDataPacket[]>(`
    SELECT INDEX_NAME AS name, NON_UNIQUE AS nonUnique, COLUMN_NAME AS columnName
    FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = 'dnd5e' AND TABLE_NAME = 'entities'
    ORDER BY INDEX_NAME, SEQ_IN_INDEX`);
  return { columns, indexes };
}

/**
 * Runs the migration against the test database after removing the columns it adds, as on a
 * database created before it. `fresh` is the fresh-install shape. Restores the columns when the
 * migration did not add them, and fails when the table is left in any other shape.
 */
async function withPreMigrationSchema(
  body: (connection: mysql.Connection, migrate: () => Promise<void>, fresh: Awaited<ReturnType<typeof describeEntities>>) => Promise<void>,
) {
  const connection = await mysql.createConnection({ ...dbConfig, multipleStatements: true });
  const migration = await readFile(migrationUrl, 'utf8');
  const migrate = async () => { await connection.query(migration); };
  const fresh = await describeEntities(connection);
  let drifted = false;
  try {
    await connection.query(`ALTER TABLE dnd5e.entities
      DROP INDEX uq_dnd5e_entities_import_key,
      DROP COLUMN import_key, DROP COLUMN source, DROP COLUMN page, DROP COLUMN imported_at, DROP COLUMN locally_edited`);
    await body(connection, migrate, fresh);
  } finally {
    try {
      const [restored] = await connection.query<RowDataPacket[]>(
        "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'dnd5e' AND TABLE_NAME = 'entities' AND COLUMN_NAME = 'import_key'");
      if (restored.length === 0) {
        await connection.query("DELETE FROM dnd5e.entity_tags WHERE tag_type = 'source'");
        await migrate();
      }
      drifted = JSON.stringify(await describeEntities(connection)) !== JSON.stringify(fresh);
    } finally {
      await connection.end();
    }
  }
  if (drifted) {
    throw new Error('dnd5e.entities no longer matches the create script. Recreate the test database: npm run test:db:down && npm run test:db:up');
  }
}

async function tagEntity(id: number, tags: Array<[string, string]>) {
  for (const [type, tag] of tags) {
    await dnd5ePool.execute('INSERT INTO entity_tags (entity_id, tag_type, tag) VALUES (?, ?, ?)', [id, type, tag]);
  }
}

test('the migration gives an existing database the fresh-install columns and backfills them from source tags', async () => {
  const { post } = await setup();
  const create = async (name: string) =>
    ((await post({ name }).expect(201)).body as { entity: DnD5eEntityDetails }).entity.templateId;
  const tagged = await create('Storm Goblin');
  const untagged = await create('Homebrew Goblin');
  await tagEntity(tagged, [['source', 'MM'], ['page', '166'], ['environment', 'forest']]);

  await withPreMigrationSchema(async (connection, migrate, fresh) => {
    await migrate();
    expect(await describeEntities(connection)).toEqual(fresh);
  });

  const [rows] = await dnd5ePool.query<RowDataPacket[]>(
    'SELECT id, import_key, source, page, locally_edited FROM entities WHERE id IN (?, ?) ORDER BY id', [tagged, untagged]);
  expect(rows).toEqual([
    { id: tagged, import_key: 'storm goblin|mm', source: 'MM', page: 166, locally_edited: 0 },
    { id: untagged, import_key: null, source: 'homebrew', page: null, locally_edited: 0 },
  ]);
  expect(await importGoblin()).toMatchObject({ status: 'updated', entityId: tagged });
});

test('the migration stops before changing the schema when two entities would share an import key', async () => {
  const { post } = await setup();
  const create = async (name: string) =>
    ((await post({ name }).expect(201)).body as { entity: DnD5eEntityDetails }).entity.templateId;
  const first = await create('Storm Goblin');
  const second = await create('STORM GOBLIN');
  await tagEntity(first, [['source', 'MM']]);
  await tagEntity(second, [['source', 'mm']]);

  await withPreMigrationSchema(async (connection, migrate) => {
    await expect(migrate()).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
    const [columns] = await connection.query<RowDataPacket[]>(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'dnd5e' AND TABLE_NAME = 'entities' AND COLUMN_NAME IN ('import_key', 'source')");
    expect(columns).toEqual([]);
    const [tags] = await dnd5ePool.query<RowDataPacket[]>("SELECT entity_id FROM entity_tags WHERE tag_type = 'source' ORDER BY entity_id");
    expect(tags).toEqual([{ entity_id: first }, { entity_id: second }]);
  });
});

test('a migrated Unicode name gets the importer key, so a re-import matches it and obeys the skip and force rules', async () => {
  const { post, put, get } = await setup();
  const create = async (name: string) =>
    ((await post({ name }).expect(201)).body as { entity: DnD5eEntityDetails }).entity.templateId;
  // U+0130 lowercases differently in MySQL LOWER() and JavaScript toLowerCase(); the others check that
  // only ASCII letters are folded.
  const names = ['\u0130 Goblin', '\u00C4rger Wolf', '\u03A3 Imp', 'Storm Goblin'];
  const ids = new Map<string, number>();
  for (const name of names) {
    const id = await create(name);
    ids.set(name, id);
    await tagEntity(id, [['source', 'MM'], ['page', '12']]);
  }

  await withPreMigrationSchema(async (connection, migrate) => {
    await migrate();
    const [rows] = await connection.query<RowDataPacket[]>(
      'SELECT id, HEX(import_key) AS hex FROM dnd5e.entities WHERE id IN (?) ORDER BY id', [[...ids.values()]]);
    expect(rows).toEqual([...ids].map(([name, id]) => ({
      id, hex: Buffer.from(entityImportKey(name, 'MM'), 'utf8').toString('hex').toUpperCase(),
    })));
  });

  const id = ids.get('\u0130 Goblin') as number;
  const monster = { name: '\u0130 Goblin', source: 'MM', page: 12, hp: { average: 7, formula: '2d6' } };
  await put(id, { name: '\u0130 Goblin', hp: 9 }, true).expect(200);

  expect(await importGoblin({}, monster)).toMatchObject({ status: 'skipped', entityId: id, reason: expect.stringContaining('--force') });
  expect((await get(id)).hp).toBe(9);
  expect(await importGoblin({ force: true }, monster)).toMatchObject({ status: 'updated', entityId: id });
  expect(await get(id)).toMatchObject({ hp: 7, locallyEdited: false });
  const [copies] = await dnd5ePool.query<RowDataPacket[]>(
    'SELECT c.id FROM core.entities c WHERE c.name = ?', ['\u0130 Goblin']);
  expect(copies).toEqual([{ id }]);
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
