import { NextResponse } from 'next/server';
import { LANG_COOKIE } from '@/lib/site-locale';

/** Switches the site between English and Arabic and returns to the same page. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(req.url);
  const to = url.searchParams.get('to') === 'ar' ? 'ar' : 'en';
  const back = url.searchParams.get('back') ?? '';
  // Only back to this event's own pages.
  const target = back.startsWith(`/e/${slug}`) && !back.startsWith('//') ? back : `/e/${slug}`;
  const res = NextResponse.redirect(new URL(target, url.origin), 303);
  res.cookies.set(LANG_COOKIE, to, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  return res;
}
