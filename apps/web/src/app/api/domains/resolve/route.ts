import { NextResponse } from 'next/server';
import { prisma } from '@zemmz/db';
import { playSubdomain } from '@/lib/play/hosts';

/**
 * What a host shows: an event (its own domain) or a tournament website (its
 * own domain, or <slug>.PLAY_DOMAIN). Used by the middleware; public information.
 */
export async function GET(req: Request) {
  const host = (new URL(req.url).searchParams.get('host') ?? '').toLowerCase().replace(/:\d+$/, '');
  const json = (slug: string | null, kind: 'event' | 'play' | null) => NextResponse.json({ slug, kind }, { headers: { 'Cache-Control': 'no-store' } });
  if (!host) return json(null, null);
  const sub = playSubdomain(host);
  if (sub) {
    const p = await prisma.playProject.findFirst({ where: { slug: sub, archivedAt: null }, select: { slug: true } });
    return json(p?.slug ?? null, p ? 'play' : null);
  }
  const event = await prisma.event.findFirst({ where: { customDomain: host, customDomainVerifiedAt: { not: null }, archivedAt: null }, select: { slug: true } });
  if (event) return json(event.slug, 'event');
  const project = await prisma.playProject.findFirst({ where: { customDomain: host, domainVerifiedAt: { not: null }, archivedAt: null }, select: { slug: true } });
  return json(project?.slug ?? null, project ? 'play' : null);
}
