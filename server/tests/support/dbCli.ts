import { testDatabaseEnv } from './env.js';

// Set these before importing config (dotenv preserves existing environment variables).
Object.assign(process.env, testDatabaseEnv);
const { loadSchema, resetData } = await import('./testDb.js');

switch (process.argv[2]) {
  case 'load':
    await loadSchema();
    break;
  case 'reset':
    await resetData();
    break;
  default:
    throw new Error('Expected load or reset');
}
