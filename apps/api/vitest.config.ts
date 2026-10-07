import { defineConfig } from 'vitest/config';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://finanzas:finanzas@localhost:5433/finanzas_test';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['src/**/*.test.ts'] } },
      {
        test: {
          name: 'integration',
          include: ['test/**/*.test.ts'],
          globalSetup: ['test/global-setup.ts'],
          env: {
            NODE_ENV: 'test',
            DATABASE_URL: TEST_DATABASE_URL,
            APP_URL: 'http://localhost:5173',
            RATE_LIMIT_MAX: '100000',
          },
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
