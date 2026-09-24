import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';
export { hashPassword, verifyPassword } from './password';

// One client per process. In Next.js dev, modules reload on every change,
// so keep the client on globalThis to avoid exhausting connections.
const g = globalThis as unknown as { __zemmzPrisma?: PrismaClient };

export const prisma: PrismaClient =
  g.__zemmzPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') g.__zemmzPrisma = prisma;
