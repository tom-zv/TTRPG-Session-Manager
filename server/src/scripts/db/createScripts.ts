import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import mysql, { type RowDataPacket } from 'mysql2/promise';

/** In creation order: a schema's create scripts reference only the schemas before it. */
export const SCHEMAS = ['core', 'dnd5e', 'audio'] as const;
export type Schema = (typeof SCHEMAS)[number];

export const TARGETS = ['core', 'dnd5e', 'audio', 'game', 'all'] as const;
export type Target = (typeof TARGETS)[number];

/** `server/db/`, found relative to this module (run with tsx from `server/src/`). */
const dbDir = new URL('../../../db/', import.meta.url);
export const backupDir = new URL('backups/', dbDir);

/**
 * The test container records the create-script hash it was built from in this table
 * (`loadSchema()` in `server/tests/support/testDb.ts`), so a stale build can be detected.
 */
export const TEST_SCHEMA_STATE = 'ttrpg_test_marker.schema_state';

/** The hash the test container was built from, or undefined when it has none. */
export async function readTestSchemaHash(connection: mysql.Connection): Promise<string | undefined> {
  const [tables] = await connection.query<RowDataPacket[]>(
    "SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'ttrpg_test_marker' AND TABLE_NAME = 'schema_state'",
  );
  if (tables.length === 0) return undefined;
  const [rows] = await connection.query<RowDataPacket[]>(`SELECT source_hash FROM ${TEST_SCHEMA_STATE} WHERE id = 1`);
  return rows.length > 0 ? String(rows[0].source_hash) : undefined;
}

export function isTarget(value: string): value is Target {
  return (TARGETS as readonly string[]).includes(value);
}

/** Expands targets to schemas in creation order. `game` is core + dnd5e. */
export function expandTargets(targets: readonly Target[]): Schema[] {
  const wanted = new Set<Schema>();
  for (const target of targets) {
    if (target === 'all') SCHEMAS.forEach(schema => wanted.add(schema));
    else if (target === 'game') { wanted.add('core'); wanted.add('dnd5e'); }
    else wanted.add(target);
  }
  return SCHEMAS.filter(schema => wanted.has(schema));
}

/** The create scripts of one schema, in the order they are applied. */
export async function listCreateScripts(schema: Schema): Promise<Array<{ name: string; url: URL }>> {
  const directory = new URL(`${schema}/`, dbDir);
  const files = (await readdir(directory)).filter(file => file.endsWith('.sql')).sort();
  return files.map(name => ({ name: `${schema}/${name}`, url: new URL(name, directory) }));
}

/** Table names each schema's create scripts define, from their `CREATE TABLE` statements. */
export async function createScriptTables(schema: Schema): Promise<string[]> {
  const tables = new Set<string>();
  const pattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`?(\w+)`?\.)?`?(\w+)`?/gi;
  for (const file of await listCreateScripts(schema)) {
    const sql = (await readFile(file.url, 'utf8')).replace(/--[^\n]*/g, '');
    for (const match of sql.matchAll(pattern)) {
      if ((match[1] ?? schema) === schema) tables.add(match[2]);
    }
  }
  return [...tables].sort();
}

/** sha256 over every create script's name and content, so any edit changes it. */
export async function createScriptsHash(): Promise<string> {
  const hash = createHash('sha256');
  for (const schema of SCHEMAS) {
    for (const file of await listCreateScripts(schema)) {
      hash.update(`${file.name}\0${await readFile(file.url, 'utf8')}\0`);
    }
  }
  return hash.digest('hex');
}

/**
 * Creates each schema if missing and runs its create scripts with that schema selected. Scripts use
 * `CREATE TABLE IF NOT EXISTS` and idempotent seeds, so a re-run only adds what is missing. The
 * connection must allow multiple statements.
 */
export async function applyCreateScripts(
  connection: mysql.Connection,
  schemas: readonly Schema[],
  log: (message: string) => void = () => {},
): Promise<void> {
  const ordered = SCHEMAS.filter(schema => schemas.includes(schema));
  for (const schema of ordered) {
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${mysql.escapeId(schema)}`);
  }
  for (const schema of ordered) {
    await connection.query(`USE ${mysql.escapeId(schema)}`);
    for (const file of await listCreateScripts(schema)) {
      log(`  ${file.name}`);
      await connection.query(await readFile(file.url, 'utf8'));
    }
  }
}

/** Drops schemas in reverse creation order, so cross-schema foreign keys never block a drop. */
export async function dropSchemas(connection: mysql.Connection, schemas: readonly Schema[]): Promise<void> {
  for (const schema of [...SCHEMAS].reverse().filter(schema => schemas.includes(schema))) {
    await connection.query(`DROP DATABASE IF EXISTS ${mysql.escapeId(schema)}`);
  }
}
