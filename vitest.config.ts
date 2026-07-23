import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
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
          include: ['shared/tests/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        resolve: { alias: { src: fromRoot('./server/src'), shared } },
        test: {
          name: 'server',
          include: ['server/tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        resolve: { alias: { src: fromRoot('./server/src'), shared } },
        test: {
          name: 'server-int',
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
        },
      },
    ],
  },
});
