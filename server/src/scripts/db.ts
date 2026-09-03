import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import mysqldump from 'mysqldump';
import { testDatabaseEnv } from '../../tests/support/env.js';
import {
  applyCreateScripts, backupDir, createScriptTables, createScriptsHash, dropSchemas, readTestSchemaHash,
  type Schema,
} from './db/createScripts.js';
import { diffTableDefinitions, formatDifferences, readTableDefinitions } from './db/diff.js';
import { parseDbOptions, resetConfirmation, USAGE, type DbOptions } from './db/options.js';

// Dev database tool: status, create, reset, backup, diff. See USAGE in ./db/options.ts.
// The connection config is imported after parsing, because --test must set the environment first.

type Config = { host: string; user: string; password: string; port?: number };

const options = parseOrExit(process.argv.slice(2));
if (options.help) {
  console.log(USAGE);
  process.exit(0);
}
if (options.test) Object.assign(process.env, testDatabaseEnv);
const { dbConfig, serverConfig } = await import('src/config/server-config.js');

const testConfig: Config = {
  host: testDatabaseEnv.DB_HOST,
  port: Number(testDatabaseEnv.DB_PORT),
  user: testDatabaseEnv.DB_USER,
  password: testDatabaseEnv.DB_PASSWORD,
};

try {
  await run(options, dbConfig);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

function parseOrExit(args: string[]): DbOptions {
  try {
    return parseDbOptions(args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error('Run with --help for usage.');
    process.exit(1);
  }
}

async function run(options: DbOptions, config: Config): Promise<void> {
  console.log(`Target: ${config.host}:${config.port ?? 3306}${options.test ? ' (test container)' : ''}`);
  for (const note of options.notes) console.log(`Note: ${note}`);
  const connection = await connect(config);
  try {
    if (options.test && !(await schemaExists(connection, 'ttrpg_test_marker'))) {
      throw new Error('This is not the test container (no ttrpg_test_marker). Start it with npm run test:db:up.');
    }
    switch (options.command) {
      case 'status': return await status(connection, options.schemas);
      case 'create': return await create(connection, options);
      case 'reset': return await reset(connection, config, options);
      case 'backup': { await backup(connection, config, options.schemas); return; }
      case 'diff': return await diff(connection, options);
    }
  } finally {
    await connection.end();
  }
}

async function connect(config: Config): Promise<mysql.Connection> {
  try {
    return await mysql.createConnection({ ...config, multipleStatements: true });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot connect to ${config.host}:${config.port ?? 3306}: ${reason}`, { cause: error });
  }
}

async function schemaExists(connection: mysql.Connection, schema: string): Promise<boolean> {
  const [rows] = await connection.query<RowDataPacket[]>(
    'SELECT 1 FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [schema]);
  return rows.length > 0;
}

async function existingSchemas(connection: mysql.Connection, schemas: readonly Schema[]): Promise<Schema[]> {
  const found: Schema[] = [];
  for (const schema of schemas) if (await schemaExists(connection, schema)) found.push(schema);
  return found;
}

async function status(connection: mysql.Connection, schemas: readonly Schema[]): Promise<void> {
  let missingAny = false;
  for (const schema of schemas) {
    if (!(await schemaExists(connection, schema))) {
      console.log(`${schema}: does not exist`);
      missingAny = true;
      continue;
    }
    const [rows] = await connection.query<RowDataPacket[]>(
      "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'", [schema]);
    const actual = new Set(rows.map(row => String(row.name)));
    const expected = await createScriptTables(schema);
    const missing = expected.filter(table => !actual.has(table));
    const extra = [...actual].filter(table => !expected.includes(table)).sort();
    console.log(`${schema}: ${actual.size} tables`);
    if (missing.length > 0) console.log(`  missing: ${missing.join(', ')}`);
    if (extra.length > 0) console.log(`  extra:   ${extra.join(', ')}`);
    missingAny ||= missing.length > 0;
  }
  if (missingAny) console.log('Missing schemas or tables: npm run db:create adds them.');
  console.log('Column-level differences: npm run db:diff.');
}

async function create(connection: mysql.Connection, options: DbOptions): Promise<void> {
  console.log(`Creating missing schemas and tables: ${options.schemas.join(', ')}`);
  await applyCreateScripts(connection, options.schemas, console.log);
  await afterBuild(options);
}

async function reset(connection: mysql.Connection, config: Config, options: DbOptions): Promise<void> {
  await confirmReset(config, options);
  if (options.test) {
    console.log('Skipping backup (test container).');
  } else if (options.backup) {
    const files = await backup(connection, config, options.schemas);
    if (files.length === 0) console.log('Nothing to back up.');
  } else {
    console.log('Skipping backup (--no-backup).');
  }
  console.log(`Dropping: ${options.schemas.join(', ')}`);
  await dropSchemas(connection, options.schemas);
  console.log(`Creating: ${options.schemas.join(', ')}`);
  await applyCreateScripts(connection, options.schemas, console.log);
  await afterBuild(options);
}

async function confirmReset(config: Config, options: DbOptions): Promise<void> {
  const confirmation = resetConfirmation(options);
  if (confirmation.kind === 'none') return;
  const target = `${config.host}:${config.port ?? 3306}`;
  if (!process.stdin.isTTY) {
    throw new Error(confirmation.kind === 'typed'
      ? 'Refusing: resetting audio needs the word "audio" typed on a terminal. No flag skips it.'
      : 'Refusing: no terminal to confirm on. Pass --yes to reset core and dnd5e without a prompt.');
  }
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const question = confirmation.kind === 'typed'
      ? `Drop ${options.schemas.join(', ')} on ${target}? audio holds data in use. Type "audio" to confirm: `
      : `Drop ${options.schemas.join(', ')} on ${target}? [y/N] `;
    const answer = (await prompt.question(question)).trim();
    const confirmed = confirmation.kind === 'typed' ? answer === confirmation.word : /^y(es)?$/i.test(answer);
    if (!confirmed) throw new Error('Cancelled. Nothing was changed.');
  } finally {
    prompt.close();
  }
}

/** Audio folders on disk and the dev GM user, after create or reset. */
async function afterBuild(options: DbOptions): Promise<void> {
  if (options.schemas.includes('audio')) {
    for (const folder of ['music', 'sfx', 'ambience', 'upload']) {
      await mkdir(path.join(serverConfig.audioDir, folder), { recursive: true });
    }
    console.log(`Audio folders: ${serverConfig.audioDir}`);
  }
  if (options.schemas.includes('core')) await ensureDevUser(options);
  console.log('Done.');
}

async function ensureDevUser(options: DbOptions): Promise<void> {
  if (options.test) return;
  const username = process.env.DEV_GM_USERNAME;
  const password = process.env.DEV_GM_PASSWORD;
  if (!username || !password) {
    console.log('Dev GM user: skipped (set DEV_GM_USERNAME and DEV_GM_PASSWORD in server/.env).');
    return;
  }
  const { default: usersModel } = await import('src/api/users/userModel.js');
  const { registerUser } = await import('src/api/auth/authService.js');
  const { audioPool, corePool, dnd5ePool } = await import('src/db.js');
  try {
    if (await usersModel.getUserByUsername(username)) {
      console.log(`Dev GM user: ${username} already exists.`);
    } else {
      await registerUser({ username, password, email: `${username}@localhost`, isGM: true });
      console.log(`Dev GM user: created ${username}.`);
    }
  } finally {
    await Promise.all([audioPool.end(), corePool.end(), dnd5ePool.end()]);
  }
}

/** Dumps each schema to server/db/backups/<schema>-backup-<timestamp>.sql. Returns the files. */
async function backup(connection: mysql.Connection, config: Config, schemas: readonly Schema[]): Promise<string[]> {
  const present = await existingSchemas(connection, schemas);
  const directory = fileURLToPath(backupDir);
  await mkdir(directory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const files: string[] = [];
  for (const schema of present) {
    const file = path.join(directory, `${schema}-backup-${timestamp}.sql`);
    // CommonJS package: under NodeNext the default import is the module, and `default` the function.
    await mysqldump.default({ connection: { ...config, database: schema }, dumpToFile: file });
    console.log(`Backup: ${file}`);
    files.push(file);
  }
  for (const schema of schemas.filter(schema => !present.includes(schema))) console.log(`Backup: ${schema} does not exist, skipped.`);
  return files;
}

async function diff(connection: mysql.Connection, options: DbOptions): Promise<void> {
  if (options.test) throw new Error('diff compares a database with the test container; --test would compare it with itself.');
  const reference = await connect(testConfig).catch((error: unknown) => {
    throw new Error('The test container is not running. Start it with npm run test:db:up.', { cause: error });
  });
  try {
    if (await readTestSchemaHash(reference) !== await createScriptsHash()) {
      throw new Error('The test container was not built from the current create scripts. Run npm run test:db:up.');
    }
    const differences = diffTableDefinitions(
      await readTableDefinitions(reference, options.schemas),
      await readTableDefinitions(connection, options.schemas),
    );
    if (differences.length === 0) {
      console.log(`No differences: ${options.schemas.join(', ')} match the create scripts.`);
      return;
    }
    console.log(`Differences from a fresh build ("-" create scripts, "+" this database):`);
    for (const line of formatDifferences(differences)) console.log(line);
    process.exitCode = 1;
  } finally {
    await reference.end();
  }
}
