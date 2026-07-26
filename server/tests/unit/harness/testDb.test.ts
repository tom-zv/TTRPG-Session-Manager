import mysql from 'mysql2/promise';
import { expect, test, vi } from 'vitest';
import { assertTestDatabase } from '../../support/testDb.js';

test('the database guard refuses port 3306, including the implicit default, before any connection', async () => {
  const connect = vi.spyOn(mysql, 'createConnection').mockRejectedValue(new Error('Unexpected connection'));
  try {
    const config = { host: 'reserved-port-test.invalid', user: 'unused', password: 'unused' };
    await expect(assertTestDatabase({ ...config, port: 3306 })).rejects.toThrow(/other than 3306/);
    await expect(assertTestDatabase(config)).rejects.toThrow(/other than 3306/);
    expect(connect).not.toHaveBeenCalled();
  } finally {
    connect.mockRestore();
  }
});
