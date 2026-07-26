export const testDatabaseEnv = {
  DB_HOST: '127.0.0.1',
  DB_PORT: '3307',
  DB_USER: 'root',
  // Strictly for ephemeral local test containers; never used in other environments.
  DB_PASSWORD: 'ttrpg-test-only',
  NODE_ENV: 'test',
};
