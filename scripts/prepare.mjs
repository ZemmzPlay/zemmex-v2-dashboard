/**
 * Runs before `npm run dev` and `npm start`, so nobody has to remember the
 * setup steps after pulling:
 *
 *   1. creates .env from .env.example if it's missing, with a random
 *      SESSION_SECRET (Windows has no `cp`, which is how this started);
 *   2. applies any new database migrations and regenerates the Prisma client;
 *   3. seeds the four sample events when the database has no users yet
 *      (development only).
 *
 * Plain Node with no dependencies, so it runs the same in cmd, PowerShell,
 * bash and the Docker image.
 */
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
const production = process.env.NODE_ENV === 'production';

function run(cmd, opts = {}) {
  execSync(cmd, { cwd: root, stdio: 'inherit', shell: true, ...opts });
}

function readEnv() {
  const out = {};
  if (!existsSync(envPath)) return out;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

// 1. .env
if (!existsSync(envPath) && !process.env.DATABASE_URL) {
  copyFileSync(join(root, '.env.example'), envPath);
  const secret = randomBytes(32).toString('base64url');
  writeFileSync(envPath, readFileSync(envPath, 'utf8').replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET="${secret}"`));
  console.log('\nCreated .env from .env.example with a random SESSION_SECRET.');
  console.log('If PostgreSQL has a different password, change DATABASE_URL in .env.\n');
}

const env = { ...readEnv(), ...process.env };
if (!env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Put it in .env (see .env.example) and run again.');
  process.exit(1);
}
const childEnv = { ...process.env, DATABASE_URL: env.DATABASE_URL };

// 2. migrations and client
try {
  run('npx prisma migrate deploy', { cwd: join(root, 'packages/db'), env: childEnv, stdio: ['ignore', 'ignore', 'inherit'] });
} catch {
  console.error(
    '\nCould not update the database. Check that PostgreSQL is running and that\n' +
      'DATABASE_URL in .env has the right password, then run the command again.\n',
  );
  process.exit(1);
}
run('npx prisma generate', { cwd: join(root, 'packages/db'), env: childEnv, stdio: ['ignore', 'ignore', 'inherit'] });

// 3. sample data on an empty development database
if (!production && env.AUTO_SEED !== 'false') {
  const require = createRequire(join(root, 'packages/db/package.json'));
  process.env.DATABASE_URL = env.DATABASE_URL;
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();
  const count = await db.user.count();
  await db.$disconnect();
  if (count === 0) {
    console.log('Empty database: adding the sample events.');
    run('npm run db:seed');
  }
}
console.log('Database is up to date.');
