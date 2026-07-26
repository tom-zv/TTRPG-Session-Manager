import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { testDatabaseEnv } from './server/tests/support/env.js';
import react from './client/node_modules/@vitejs/plugin-react/dist/index.js';

const fromRoot = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
const shared = fromRoot('./shared');

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
    },
    projects: [
      {
        resolve: { alias: { shared } },
        test: {
          name: 'shared',
          include: ['shared/**/*.test.ts'],
          exclude: ['**/node_modules/**'],
          environment: 'node',
        },
      },
      {
        resolve: { alias: { src: fromRoot('./server/src'), shared } },
        test: {
          name: 'server',
          // server/tests/unit is legacy: those files move next to their code during their areas.
          include: ['server/src/**/*.test.ts', 'server/tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        resolve: { alias: { src: fromRoot('./server/src'), shared } },
        test: {
          name: 'server-int',
          env: testDatabaseEnv,
          globalSetup: ['server/tests/support/globalSetup.ts'],
          setupFiles: ['server/tests/support/setup.ts'],
          include: ['server/tests/integration/**/*.int.test.ts'],
          environment: 'node',
          fileParallelism: false,
        },
      },
      {
        plugins: [react()],
        resolve: { alias: { src: fromRoot('./client/src'), shared } },
        test: {
          name: 'client',
          include: ['client/src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['client/src/test/setup.ts'],
          // Node 25 ships a global localStorage that shadows jsdom's and is unusable without a file.
          execArgv: ['--no-experimental-webstorage'],
          css: { modules: { classNameStrategy: 'non-scoped' } },
        },
      },
    ],
  },
});
