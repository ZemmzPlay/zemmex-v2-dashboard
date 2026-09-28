import { NextResponse } from 'next/server';
import { prisma } from '@zemmz/db';
import { beginPlayOAuth, isPlayProvider, PLAY_OAUTH_COOKIE, siteProviders } from '@/lib/play/oauth';

/** Starts a player's sign-in with the provider; the state cookie lives on the app's address. */
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(req.url);
  const project = await prisma.playProject.findUnique({ where: { slug: url.searchParams.get('p') ?? '' } });
  if (!project || project.archivedAt || !isPlayProvider(provider) || !siteProviders(project).includes(provider)) return new Response('That sign-in option isn’t available.', { status: 404 });
  const next = url.searchParams.get('next') ?? '';
  const b = beginPlayOAuth(provider, project, next.startsWith(`/p/${project.slug}`) ? next : `/p/${project.slug}/me`);
  if (!b) return new Response('That sign-in option isn’t set up.', { status: 404 });
  const res = NextResponse.redirect(b.url, 303);
  res.cookies.set(PLAY_OAUTH_COOKIE, b.cookie, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/play-auth', maxAge: 600 });
  return res;
}
