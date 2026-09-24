import path from 'node:path';
import { defineConfig } from 'vitest/config';

try {
  process.loadEnvFile(path.join(__dirname, '.env'));
} catch {
  /* CI provides the environment */
}

// Integration tests run against a real Postgres, in a separate database so
// they never touch the demo data: zemmz_test next to the one in DATABASE_URL.
const testDb =
  process.env.TEST_DATABASE_URL ??
  (process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/zemmz').replace(/\/([^/?]+)(\?|$)/, '/zemmz_test$2');

// Global setup runs in this process, test files in workers: set both.
const env = { DATABASE_URL: testDb, SESSION_SECRET: 'test-secret-test-secret-test-secret-00', MESSAGING_PROVIDER: 'log' };
Object.assign(process.env, env);

export default defineConfig({
  resolve: {
    alias: {
      '@': path.join(__dirname, 'apps/web/src'),
      // Next.js guards server modules with this import; in tests it is a no-op.
      'server-only': path.join(__dirname, 'tests/server-only-stub.ts'),
    },
  },
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.next/**'],
    env,
    globalSetup: ['tests/global-setup.ts'],
    // Integration tests share one database; run files one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
