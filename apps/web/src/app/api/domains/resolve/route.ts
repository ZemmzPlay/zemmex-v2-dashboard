import { NextResponse } from 'next/server';
import { prisma } from '@zemmz/db';

/** Which event a custom domain shows. Used by the middleware; public information. */
export async function GET(req: Request) {
  const host = (new URL(req.url).searchParams.get('host') ?? '').toLowerCase().replace(/:\d+$/, '');
  const event = host ? await prisma.event.findFirst({ where: { customDomain: host, customDomainVerifiedAt: { not: null }, archivedAt: null }, select: { slug: true } }) : null;
  return NextResponse.json({ slug: event?.slug ?? null }, { headers: { 'Cache-Control': 'no-store' } });
}
