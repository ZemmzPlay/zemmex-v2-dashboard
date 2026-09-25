import { NextResponse, type NextRequest } from 'next/server';

// Cheap first gate: private areas need a session cookie. The real check
// (valid, unexpired, right organisation) happens on the server in lib/auth.
const PRIVATE = ['/events', '/outbox', '/organisation', '/account', '/admin', '/welcome', '/switch'];

/** Hosts that are zemmz itself: APP_URL's, plus APP_HOSTS (comma-separated) and local development. */
function isAppHost(host: string) {
  const h = host.toLowerCase().replace(/:\d+$/, '');
  if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h.endsWith('.localhost')) return true;
  const own = [process.env.APP_URL ?? '', ...(process.env.APP_HOSTS ?? '').split(',')].map((u) => u.trim().replace(/^https?:\/\//, '').replace(/[:/].*$/, '').toLowerCase()).filter(Boolean);
  return own.includes(h);
}

// Custom domains change rarely; remember lookups for a minute per server.
const cache = new Map<string, { slug: string | null; at: number }>();

async function slugFor(req: NextRequest, host: string) {
  const hit = cache.get(host);
  if (hit && Date.now() - hit.at < 60_000) return hit.slug;
  const res = await fetch(new URL(`/api/domains/resolve?host=${encodeURIComponent(host)}`, `http://127.0.0.1:${process.env.PORT ?? 3000}`), { cache: 'no-store' }).catch(() => null);
  const slug = res?.ok ? ((await res.json()) as { slug: string | null }).slug : null;
  cache.set(host, { slug, at: Date.now() });
  return slug;
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');

  // An event's own domain: its pages, nothing else.
  if (host && !isAppHost(host)) {
    const slug = await slugFor(req, host);
    if (!slug) return new NextResponse('This address isn’t connected to an event.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    if (pathname.startsWith(`/e/${slug}`) || pathname.startsWith('/files/')) return NextResponse.next();
    if (pathname.startsWith('/e/') || PRIVATE.some((p) => pathname === p || pathname.startsWith(p + '/')) || ['/login', '/signup'].includes(pathname)) {
      return NextResponse.redirect(new URL(pathname + search, process.env.APP_URL ?? 'http://localhost:3000'));
    }
    const url = req.nextUrl.clone();
    url.pathname = `/e/${slug}${pathname === '/' ? '' : pathname}`;
    return NextResponse.rewrite(url);
  }

  if (PRIVATE.some((p) => pathname === p || pathname.startsWith(p + '/')) && !req.cookies.has('zemmz_session')) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything but build assets and API routes: custom domains can land on any path.
  matcher: ['/((?!_next/static|_next/image|api/|favicon.ico|icon|apple-icon).*)'],
};
