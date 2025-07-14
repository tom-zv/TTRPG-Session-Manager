#!/usr/bin/env node

// Initial DB backup utility
// set up as a manually invoked script

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mysqldump from 'mysqldump';

// ─── Types ───────────────────────────────────────────────────────────────────
type EnvVars = {
  DB_HOST: string;
  DB_USER: string;
  DB_PASSWORD: string;
};

type DatabaseName = 'audio' | 'dnd5e' | 'core';

// ─── Path Setup ──────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ─── load server/.env ───────────────────────────────────────────────────────
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const {
  DB_HOST = '127.0.0.1',
  DB_USER,
  DB_PASSWORD,
} = process.env as NodeJS.ProcessEnv & Partial<EnvVars>;

if (!DB_USER || !DB_PASSWORD) {
  console.error('Missing DB_USER or DB_PASSWORD in server/.env');
  process.exit(1);
}

// ─── list of databases to back up ────────────────────────────────────────────
const DATABASES: DatabaseName[] = ['audio', 'dnd5e', 'core'];

// ─── ensure backups folder exists ────────────────────────────────────────────
const BACKUP_DIR = path.resolve(__dirname, 'backups');
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

async function backupDatabase(dbName: DatabaseName): Promise<void> {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19); // e.g. "2025-07-14T18-30-00"

  const outFile = path.join(
    BACKUP_DIR,
    `${dbName}-backup-${timestamp}.sql`
  );

  console.log(`🗄  Dumping '${dbName}' → ${outFile}`);
  await mysqldump({
    connection: {
      host:     DB_HOST,
      user:     DB_USER!,
      password: DB_PASSWORD!,
      database: dbName,
    },
    dumpToFile: outFile,
  });
  console.log(`'${dbName}' backup complete.`);
}

async function runAllBackups(): Promise<void> {
  for (const db of DATABASES) {
    try {
      await backupDatabase(db);
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error(`Failed to back up '${db}':`, err.message);
      } else {
        console.error(`Failed to back up '${db}':`, err);
      }
    }
  }
}

runAllBackups()
  .then(() => console.log('All backups finished.'))
  .catch((err: unknown) => {
    if (err instanceof Error) {
      console.error('Unexpected error:', err.message);
    } else {
      console.error('Unexpected error:', err);
    }
    process.exit(1);
  });
