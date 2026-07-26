import { afterAll, afterEach, beforeEach } from 'vitest';
import { audioPool, corePool, dnd5ePool } from '../../src/db.js';
import { closeSocketServers } from './socket.js';
import { resetData } from './testDb.js';

beforeEach(resetData);
afterEach(closeSocketServers);
afterAll(async () => {
  await Promise.all([audioPool.end(), corePool.end(), dnd5ePool.end()]);
});
