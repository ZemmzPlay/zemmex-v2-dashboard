import { NextResponse } from 'next/server';
import { PLAY_LANG_COOKIE } from '@/lib/play/site';

/** Switches the website language and goes back to the same page. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(req.url);
  const to = url.searchParams.get('to') === 'ar' ? 'ar' : 'en';
  const back = url.searchParams.get('back') ?? '';
  const dest = back.startsWith(`/p/${slug}`) ? back : `/p/${slug}`;
  const res = NextResponse.redirect(new URL(dest, url), 303);
  res.cookies.set(PLAY_LANG_COOKIE, to, { path: '/', maxAge: 365 * 86400, sameSite: 'lax' });
  return res;
}
