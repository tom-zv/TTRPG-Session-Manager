import { testDatabaseEnv } from './env.js';

export default async function setup(): Promise<void> {
  // Project env applies to workers, not the global setup process.
  Object.assign(process.env, testDatabaseEnv);
  const { assertTestDatabase } = await import('./testDb.js');
  await assertTestDatabase();
}
