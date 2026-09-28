import { NextResponse } from 'next/server';
import { prisma } from '@zemmz/db';
import { sealData } from '@/lib/order-tokens';
import { playSiteOrigin } from '@/lib/play/core';
import { finishPlayOAuth, handoffToken, isPlayProvider, PLAY_OAUTH_COOKIE, PLAY_PROVIDER_LABEL, PlayOAuthError } from '@/lib/play/oauth';

/**
 * Back from Google or Discord. A player already linked to this account signs
 * in; one whose email the provider vouches for is linked first; anyone else
 * finishes creating an account on the website. The result goes back to the
 * website with a one-time token, so its own cookie is set on its own address.
 */
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(req.url);
  const cookie = req.headers.get('cookie')?.split(/;\s*/).find((c) => c.startsWith(`${PLAY_OAUTH_COOKIE}=`))?.slice(PLAY_OAUTH_COOKIE.length + 1);
  if (!isPlayProvider(provider)) return new Response('Not found', { status: 404 });

  let result;
  try {
    if (url.searchParams.get('error')) throw new PlayOAuthError(`${PLAY_PROVIDER_LABEL[provider]} sign-in was cancelled.`);
    result = await finishPlayOAuth(provider, url.searchParams.get('code') ?? '', url.searchParams.get('state') ?? '', cookie ? decodeURIComponent(cookie) : undefined);
  } catch (e) {
    if (!(e instanceof PlayOAuthError)) throw e;
    return new Response(`${e.message}\n\nGo back to the tournament website and try again.`, { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  const { identity: id, st } = result;
  const project = await prisma.playProject.findUniqueOrThrow({ where: { id: st.projectId } });
  const site = `${playSiteOrigin(project)}/p/${project.slug}`;
  const back = (path: string, q: Record<string, string>) => {
    const r = NextResponse.redirect(`${site}${path}?${new URLSearchParams(q)}`, 303);
    r.cookies.delete({ name: PLAY_OAUTH_COOKIE, path: '/play-auth' });
    return r;
  };
  const field = id.provider === 'google' ? 'googleId' : 'discordId';

  let player = await prisma.playPlayer.findFirst({ where: { projectId: project.id, [field]: id.id } });
  if (!player && id.email && id.emailVerified) {
    player = await prisma.playPlayer.findFirst({ where: { projectId: project.id, email: id.email } });
    if (player) player = await prisma.playPlayer.update({ where: { id: player.id }, data: { [field]: id.id, ...(id.provider === 'discord' ? { discordName: id.handle } : {}) } });
  }
  if (player) {
    if (player.blacklisted) return back('/signin', { error: 'blocked' });
    return back('/auth/finish', { t: await handoffToken(project.id, player.id, id.provider), next: st.next });
  }
  if (!id.email || !id.emailVerified) return back('/signin', { error: 'unverified', provider: id.provider });
  // A new player: the website asks for their gamer tag and country, then links the account.
  const [first, ...rest] = id.name.split(/\s+/);
  const n = sealData('zplay_new', { p: project.id, target: id.email, kind: 'email', next: st.next, at: Date.now(), link: { provider: id.provider, id: id.id, handle: id.handle }, first: first ?? '', last: rest.join(' ') });
  return back('/auth/finish', { n });
}
