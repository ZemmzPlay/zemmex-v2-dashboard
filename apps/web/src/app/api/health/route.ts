import { prisma } from '@zemmz/db';

export const dynamic = 'force-dynamic';

/** Liveness and database reachability, for the Docker healthcheck and uptime checks. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, error: 'database unreachable' }, { status: 503 });
  }
}
