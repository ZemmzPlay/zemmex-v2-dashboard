/**
 * Development only: creates a login session for a seeded user and prints the
 * cookie, for smoke tests and curl.
 *
 *   node --env-file=.env --import tsx scripts/dev-session.mts owner@zemmz.test
 */
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@zemmz/db';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run in production.');
  process.exit(1);
}

const email = process.argv[2] ?? 'owner@zemmz.test';
const user = await prisma.user.findUniqueOrThrow({ where: { email } });
const token = randomBytes(32).toString('base64url');
await prisma.authSession.create({
  data: { userId: user.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 86_400_000) },
});
console.log(`zemmz_session=${token}`);
await prisma.$disconnect();
