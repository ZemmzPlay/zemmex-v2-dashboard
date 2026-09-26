import { prisma } from '@zemmz/db';
import { getCurrentUser } from '@/lib/auth';
import { verify } from '@/lib/order-tokens';
import { storage } from '@/lib/storage';
import { currentPlayer } from '@/lib/play/players';

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
  // Score report screenshots: the organisers and the player who sent it.
  if (asset.kind === 'SCREENSHOT') {
    gated = true;
    if (!(await mayOpenScreenshot(asset))) return new Response('Only the organisers can open this.', { status: 403 });
  }
  if (asset.attendeesOnly && asset.event) {
    gated = asset.event.afterPage?.attendeesOnly ?? true;
    if (gated && !(await mayOpen(req, asset.organisationId, asset.event.id))) return new Response('Only people who attended can open this.', { status: 403 });
  }
  const download = new URL(req.url).searchParams.has('download');
  if (asset.kind === 'VIDEO') return video(req, asset, gated, download);
  const body = await storage().get(key);
  if (!body) return new Response('Not found', { status: 404 });
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

async function mayOpenScreenshot(asset: { id: string; organisationId: string; playProjectId: string | null }) {
  const user = await getCurrentUser();
  if (user?.organisationId === asset.organisationId) return true;
  if (!asset.playProjectId) return false;
  const player = await currentPlayer(asset.playProjectId);
  return !!player && !!(await prisma.scoreReport.findFirst({ where: { screenshotAssetId: asset.id, playerId: player.id } }));
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

/**
 * Videos are streamed in byte ranges, so a player can start straight away and
 * jump to any point without downloading the whole recording.
 */
async function video(req: Request, asset: { key: string; name: string; contentType: string }, gated: boolean, download: boolean) {
  const size = await storage().size(asset.key);
  if (!size) return new Response('Not found', { status: 404 });
  const common = {
    'Content-Type': asset.contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': gated ? 'private, max-age=3600' : 'public, max-age=31536000, immutable',
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${asset.name.replace(/"/g, '')}"`,
    'Content-Security-Policy': "default-src 'none'; media-src 'self'; sandbox",
  };
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') ?? '');
  if (!m) {
    const body = await storage().range(asset.key, 0, size - 1);
    return body ? new Response(body, { headers: { ...common, 'Content-Length': String(size) } }) : new Response('Not found', { status: 404 });
  }
  let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  let end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (!m[1] && !m[2]) [start, end] = [0, size - 1];
  if (start > end || start >= size) return new Response('Range not satisfiable', { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  // Players ask for open-ended ranges; answer in chunks so a seek is quick.
  end = Math.min(end, start + 8 * 1024 * 1024 - 1);
  const body = await storage().range(asset.key, start, end);
  if (!body) return new Response('Not found', { status: 404 });
  return new Response(body, { status: 206, headers: { ...common, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}` } });
}
