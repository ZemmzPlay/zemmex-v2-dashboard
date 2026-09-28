import { prisma } from '@zemmz/db';
import { playSubdomain } from '@/lib/play/hosts';

/**
 * Caddy's on-demand TLS asks here before issuing a certificate for a host
 * (see infra/Caddyfile). Only verified event and tournament-website domains,
 * and <slug>.PLAY_DOMAIN for websites that exist, get one, so nobody can make
 * the server request certificates for arbitrary names.
 */
export async function GET(req: Request) {
  const domain = (new URL(req.url).searchParams.get('domain') ?? '').toLowerCase();
  const sub = domain ? playSubdomain(domain) : null;
  const ok = !!domain && !!(sub
    ? await prisma.playProject.findFirst({ where: { slug: sub, archivedAt: null }, select: { id: true } })
    : (await prisma.event.findFirst({ where: { customDomain: domain, customDomainVerifiedAt: { not: null } }, select: { id: true } }))
      ?? (await prisma.playProject.findFirst({ where: { customDomain: domain, domainVerifiedAt: { not: null } }, select: { id: true } })));
  return new Response(ok ? 'ok' : 'unknown domain', { status: ok ? 200 : 404 });
}
