import mysql, { type RowDataPacket } from 'mysql2/promise';
import type { Schema } from './createScripts.js';

/** `schema.table` → normalised `SHOW CREATE TABLE` text. */
export type TableDefinitions = Map<string, string>;

export type TableDifference =
  | { table: string; kind: 'missing' | 'extra' }
  | { table: string; kind: 'changed'; lines: string[] };

/** Reads every base table of the schemas. Counter values are dropped: they are data, not schema. */
export async function readTableDefinitions(connection: mysql.Connection, schemas: readonly Schema[]): Promise<TableDefinitions> {
  const definitions: TableDefinitions = new Map();
  if (schemas.length === 0) return definitions;
  const [tables] = await connection.query<RowDataPacket[]>(
    `SELECT TABLE_SCHEMA AS schemaName, TABLE_NAME AS tableName FROM information_schema.TABLES
     WHERE TABLE_SCHEMA IN (?) AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_SCHEMA, TABLE_NAME`,
    [schemas],
  );
  for (const { schemaName, tableName } of tables as Array<{ schemaName: string; tableName: string }>) {
    const [rows] = await connection.query<RowDataPacket[]>(
      `SHOW CREATE TABLE ${mysql.escapeId(schemaName)}.${mysql.escapeId(tableName)}`,
    );
    const text = String(rows[0]['Create Table']).replace(/ AUTO_INCREMENT=\d+/, '');
    definitions.set(`${schemaName}.${tableName}`, text);
  }
  return definitions;
}

/**
 * Compares a database (`actual`) with a fresh build (`expected`). A changed table lists its
 * differing lines: `-` as the create scripts define it, `+` as the database has it.
 */
export function diffTableDefinitions(expected: TableDefinitions, actual: TableDefinitions): TableDifference[] {
  const differences: TableDifference[] = [];
  const tables = [...new Set([...expected.keys(), ...actual.keys()])].sort();
  for (const table of tables) {
    const want = expected.get(table);
    const have = actual.get(table);
    if (want === undefined) differences.push({ table, kind: 'extra' });
    else if (have === undefined) differences.push({ table, kind: 'missing' });
    else if (want !== have) differences.push({ table, kind: 'changed', lines: lineDiff(want.split('\n'), have.split('\n')) });
  }
  return differences;
}

export function formatDifferences(differences: readonly TableDifference[]): string[] {
  return differences.flatMap(difference => {
    if (difference.kind !== 'changed') {
      return [difference.kind === 'missing'
        ? `${difference.table}: missing (the create scripts define it)`
        : `${difference.table}: extra (no create script defines it)`];
    }
    return [`${difference.table}: differs`, ...difference.lines.map(line => `    ${line}`)];
  });
}

/** Changed lines only, in order, from a longest-common-subsequence alignment. */
function lineDiff(before: string[], after: string[]): string[] {
  const common: number[][] = Array.from({ length: before.length + 1 }, () => new Array<number>(after.length + 1).fill(0));
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      common[i][j] = before[i] === after[j] ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1]);
    }
  }
  const lines: string[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) { i++; j++; }
    else if (j < after.length && (i === before.length || common[i][j + 1] > common[i + 1][j])) lines.push(`+ ${after[j++].trim()}`);
    else lines.push(`- ${before[i++].trim()}`);
  }
  return lines;
}
