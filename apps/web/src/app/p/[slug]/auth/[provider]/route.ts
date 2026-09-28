import { NextResponse } from 'next/server';
import { appUrl } from '@/lib/email';
import { isPlayProvider, siteProviders } from '@/lib/play/oauth';
import { getSiteProject } from '@/lib/play/site';

/** "Continue with Google / Discord" on a tournament website: the round trip runs on the app's own address. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; provider: string }> }) {
  const { slug, provider } = await params;
  const { project } = await getSiteProject(slug);
  const next = new URL(req.url).searchParams.get('next') ?? '';
  if (!isPlayProvider(provider) || !siteProviders(project).includes(provider)) return NextResponse.redirect(new URL(`/p/${slug}/signin`, req.url), 303);
  const to = new URL(`${appUrl()}/play-auth/${provider}/start`);
  to.searchParams.set('p', slug);
  to.searchParams.set('next', next.startsWith(`/p/${slug}`) ? next : `/p/${slug}/me`);
  return NextResponse.redirect(to, 303);
}
