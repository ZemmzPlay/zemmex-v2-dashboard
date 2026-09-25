import { NextResponse } from 'next/server';
import { getCurrentUser, ORG_COOKIE } from '@/lib/auth';
import { appUrl } from '@/lib/email';

/** Shows another of the user's organisations. Only organisations they belong to. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL('/login', appUrl()), 303);
  const org = url.searchParams.get('org') ?? '';
  const next = url.searchParams.get('next') ?? '/events';
  const target = next.startsWith('/') && !next.startsWith('//') ? next : '/events';
  const res = NextResponse.redirect(new URL(target, appUrl()), 303);
  if (user.organisations.some((o) => o.id === org)) {
    res.cookies.set(ORG_COOKIE, org, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 365 });
  }
  return res;
}
