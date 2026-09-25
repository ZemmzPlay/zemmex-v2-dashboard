import { prisma } from '@zemmz/db';
import { getCurrentUser } from '@/lib/auth';
import { verify } from '@/lib/order-tokens';
import { storage } from '@/lib/storage';

/**
 * Serves uploaded files. Logos and people's photos are public. After-event
 * photos and slides need the attendee's signed claim link (?t=…) when the
 * after-event page is for people who came; organisers can always see them.
 */
export async function GET(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join('/');
  const asset = await prisma.asset.findUnique({ where: { key }, include: { event: { include: { afterPage: true } } } });
  if (!asset) return new Response('Not found', { status: 404 });

  let gated = false;
  if (asset.attendeesOnly && asset.event) {
    gated = asset.event.afterPage?.attendeesOnly ?? true;
    if (gated && !(await mayOpen(req, asset.organisationId, asset.event.id))) return new Response('Only people who attended can open this.', { status: 403 });
  }
  const body = await storage().get(key);
  if (!body) return new Response('Not found', { status: 404 });
  const download = new URL(req.url).searchParams.has('download');
  return new Response(body as unknown as BodyInit, {
    headers: {
      'Content-Type': asset.contentType,
      'Content-Length': String(body.byteLength),
      // Keys are never reused, so public files can be cached for good.
      'Cache-Control': gated ? 'private, max-age=3600' : 'public, max-age=31536000, immutable',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${asset.name.replace(/"/g, '')}"`,
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}

async function mayOpen(req: Request, organisationId: string, eventId: string) {
  const user = await getCurrentUser();
  if (user?.organisationId === organisationId) return true;
  const t = new URL(req.url).searchParams.get('t');
  const regId = t ? verify('claim', t) : null;
  if (!regId) return false;
  const reg = await prisma.registration.findFirst({ where: { id: regId, eventId, status: 'CONFIRMED' }, select: { _count: { select: { attendance: true } } } });
  return !!reg && reg._count.attendance > 0;
}
