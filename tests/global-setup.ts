import { execSync } from 'node:child_process';
import path from 'node:path';

/** Creates (if needed) and migrates the test database once per run. */
export default function setup() {
  const url = process.env.DATABASE_URL;
  if (!url || !/zemmz_test/.test(url)) throw new Error(`Refusing to run integration tests against ${url}. Tests need a database named zemmz_test.`);
  execSync('npx prisma migrate deploy', {
    cwd: path.join(__dirname, '../packages/db'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
