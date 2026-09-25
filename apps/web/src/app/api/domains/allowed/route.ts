import { prisma } from '@zemmz/db';

/**
 * Caddy's on-demand TLS asks here before issuing a certificate for a host
 * (see infra/Caddyfile). Only verified event domains get one, so nobody can
 * make the server request certificates for arbitrary names.
 */
export async function GET(req: Request) {
  const domain = (new URL(req.url).searchParams.get('domain') ?? '').toLowerCase();
  const ok = !!domain && !!(await prisma.event.findFirst({ where: { customDomain: domain, customDomainVerifiedAt: { not: null } }, select: { id: true } }));
  return new Response(ok ? 'ok' : 'unknown domain', { status: ok ? 200 : 404 });
}
