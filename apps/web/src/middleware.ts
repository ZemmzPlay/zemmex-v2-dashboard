import { NextResponse, type NextRequest } from 'next/server';

// Cheap first gate: private areas need a session cookie. The real check
// (valid, unexpired, right organisation) happens on the server in lib/auth.
const PRIVATE = ['/events', '/outbox', '/organisation', '/account', '/admin', '/welcome'];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PRIVATE.some((p) => pathname === p || pathname.startsWith(p + '/')) && !req.cookies.has('zemmz_session')) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/events/:path*', '/outbox/:path*', '/organisation/:path*', '/account/:path*', '/admin/:path*', '/welcome/:path*'],
};
