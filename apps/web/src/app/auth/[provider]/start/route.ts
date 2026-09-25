import { NextResponse } from 'next/server';
import { beginSso, isSsoProvider, SSO_COOKIE } from '@/lib/sso';
import { appUrl } from '@/lib/email';

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(req.url);
  const began = isSsoProvider(provider)
    ? beginSso(provider, { next: url.searchParams.get('next') ?? '/events', intent: url.searchParams.get('intent') === 'link' ? 'link' : 'login', loginHint: url.searchParams.get('email') ?? undefined })
    : null;
  if (!began) return NextResponse.redirect(new URL('/login?sso=unavailable', appUrl()), 303);
  const res = NextResponse.redirect(began.url, 303);
  res.cookies.set(SSO_COOKIE, began.cookie, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/auth', maxAge: 600 });
  return res;
}
