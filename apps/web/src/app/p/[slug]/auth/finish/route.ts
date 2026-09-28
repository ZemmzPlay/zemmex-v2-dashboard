import { NextResponse } from 'next/server';
import { prisma } from '@zemmz/db';
import { unsealData } from '@/lib/order-tokens';
import { redeemHandoff } from '@/lib/play/oauth';
import { startPlayerSession } from '@/lib/play/players';
import { getSiteProject } from '@/lib/play/site';

/** The website's half of Google or Discord sign-in: sets its own session cookie, or starts account creation. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { project } = await getSiteProject(slug);
  const url = new URL(req.url);
  const base = `/p/${slug}`;
  const next = url.searchParams.get('next') ?? '';
  const to = (path: string) => NextResponse.redirect(new URL(path, req.url), 303);

  const t = url.searchParams.get('t');
  if (t) {
    const h = await redeemHandoff(project.id, t);
    if (!h) return to(`${base}/signin?error=expired`);
    const player = await prisma.playPlayer.findFirst({ where: { id: h.playerId, projectId: project.id, blacklisted: false } });
    if (!player) return to(`${base}/signin?error=blocked`);
    await startPlayerSession(project, player.id, h.method);
    return to(next.startsWith(base) ? next : `${base}/me`);
  }
  const n = url.searchParams.get('n');
  const pending = n ? unsealData<{ p: string; at: number }>('zplay_new', n) : null;
  if (!pending || pending.p !== project.id || Date.now() - pending.at > 10 * 60_000) return to(`${base}/signin?error=expired`);
  const res = to(`${base}/join`);
  res.cookies.set('zplay_new', n!, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: base, maxAge: 1800 });
  return res;
}
