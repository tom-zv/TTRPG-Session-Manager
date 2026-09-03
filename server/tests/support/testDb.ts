import mysql, { type RowDataPacket } from 'mysql2/promise';
import { dbConfig, type DatabaseConfig } from '../../src/config/server-config.js';
import {
  applyCreateScripts, createScriptsHash, dropSchemas, readTestSchemaHash, SCHEMAS, TEST_SCHEMA_STATE,
} from '../../src/scripts/db/createScripts.js';

function assertTestPort(config: DatabaseConfig): void {
  const port = config.port ?? 3306;
  if (!Number.isInteger(port) || port < 1 || port > 65535 || port === 3306) {
    throw new Error('Test database must use an explicit port other than 3306');
  }
}

export async function assertTestDatabase(config: DatabaseConfig = dbConfig): Promise<void> {
  assertTestPort(config);
  const connection = await mysql.createConnection(config);
  try {
    const [rows] = await connection.query<RowDataPacket[]>(
      "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = 'ttrpg_test_marker'",
    );
    if (rows.length !== 1) {
      throw new Error('Refusing to use a database without ttrpg_test_marker');
    }
  } finally {
    await connection.end();
  }
}

/**
 * Builds core, dnd5e and audio from the create scripts. The marker records the hash of the scripts
 * the build came from; when they have changed since, the three schemas are dropped and rebuilt, so
 * an edited create script never leaves a stale test schema.
 */
export async function loadSchema(): Promise<void> {
  // Must refuse the development port before connecting.
  assertTestPort(dbConfig);
  const connection = await mysql.createConnection({ ...dbConfig, multipleStatements: true });
  try {
    await connection.query('CREATE DATABASE IF NOT EXISTS ttrpg_test_marker');
    await assertTestDatabase();
    const sourceHash = await createScriptsHash();
    if (await readTestSchemaHash(connection) === sourceHash) return;

    // Cleared first, so an interrupted rebuild is redone on the next load.
    await connection.query(`DROP TABLE IF EXISTS ${TEST_SCHEMA_STATE}, ttrpg_test_marker.schema_loaded`);
    await dropSchemas(connection, SCHEMAS);
    await applyCreateScripts(connection, SCHEMAS);
    await connection.query(`CREATE TABLE ${TEST_SCHEMA_STATE} (id TINYINT PRIMARY KEY, source_hash CHAR(64) NOT NULL)`);
    await connection.query(`INSERT INTO ${TEST_SCHEMA_STATE} (id, source_hash) VALUES (1, ?)`, [sourceHash]);
  } finally {
    await connection.end();
  }
}

// INSERTs in the create scripts seed core.systems (dnd5e), dnd5e.damage_types
// (the 13 standard types) and audio.folders (IDs 1-5). Preserve those rows only.
const seedTables = new Set(['core.systems', 'dnd5e.damage_types', 'audio.folders']);

export async function resetData(): Promise<void> {
  await assertTestDatabase();
  const connection = await mysql.createConnection(dbConfig);
  try {
    const [tables] = await connection.query<(RowDataPacket & { schemaName: string; tableName: string })[]>(
      "SELECT TABLE_SCHEMA AS schemaName, TABLE_NAME AS tableName FROM information_schema.TABLES WHERE TABLE_SCHEMA IN ('core', 'dnd5e', 'audio') AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_SCHEMA, TABLE_NAME",
    );
    // Cross-schema foreign keys require a single connection with checks disabled.
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    try {
      for (const { schemaName, tableName } of tables) {
        if (!seedTables.has(`${schemaName}.${tableName}`)) {
          await connection.query(`TRUNCATE TABLE ${mysql.escapeId(schemaName)}.${mysql.escapeId(tableName)}`);
        }
      }
      await connection.query("DELETE FROM core.systems WHERE name <> 'dnd5e'");
      await connection.query("DELETE FROM dnd5e.damage_types WHERE name NOT IN ('acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder')");
      await connection.query('DELETE FROM audio.folders WHERE id NOT IN (1, 2, 3, 4, 5)');
    } finally {
      await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    }
  } finally {
    await connection.end();
  }
}
