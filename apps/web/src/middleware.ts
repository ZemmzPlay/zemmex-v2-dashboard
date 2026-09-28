import { NextResponse, type NextRequest } from 'next/server';
import { playSubdomain } from '@/lib/play/hosts';

// Cheap first gate: private areas need a session cookie. The real check
// (valid, unexpired, right organisation) happens on the server in lib/auth.
const PRIVATE = ['/events', '/play', '/outbox', '/organisation', '/account', '/admin', '/welcome', '/switch'];

/** Hosts that are zemmz itself: APP_URL's, plus APP_HOSTS (comma-separated) and local development. */
function isAppHost(host: string) {
  const h = host.toLowerCase().replace(/:\d+$/, '');
  // <slug>.PLAY_DOMAIN is a tournament website even in development (gel.play.localhost).
  if (playSubdomain(h)) return false;
  if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h.endsWith('.localhost')) return true;
  const own = [process.env.APP_URL ?? '', ...(process.env.APP_HOSTS ?? '').split(',')].map((u) => u.trim().replace(/^https?:\/\//, '').replace(/[:/].*$/, '').toLowerCase()).filter(Boolean);
  return own.includes(h);
}

// Custom domains change rarely; remember lookups for a minute per server.
type Site = { slug: string | null; kind: 'event' | 'play' | null };
const cache = new Map<string, Site & { at: number }>();

async function siteFor(host: string): Promise<Site> {
  const hit = cache.get(host);
  if (hit && Date.now() - hit.at < 60_000) return hit;
  const res = await fetch(new URL(`/api/domains/resolve?host=${encodeURIComponent(host)}`, `http://127.0.0.1:${process.env.PORT ?? 3000}`), { cache: 'no-store' }).catch(() => null);
  const site: Site = res?.ok ? ((await res.json()) as Site) : { slug: null, kind: null };
  cache.set(host, { ...site, at: Date.now() });
  return site;
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');

  // An event's or a tournament website's own domain: its pages, nothing else.
  if (host && !isAppHost(host)) {
    const { slug, kind } = await siteFor(host);
    if (!slug || !kind) return new NextResponse('This address isn’t connected to a website.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    const prefix = kind === 'event' ? `/e/${slug}` : `/p/${slug}`;
    if (pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith('/files/')) return NextResponse.next();
    if (pathname.startsWith('/e/') || pathname.startsWith('/p/') || pathname.startsWith('/play-auth/') || PRIVATE.some((p) => pathname === p || pathname.startsWith(p + '/')) || ['/login', '/signup'].includes(pathname)) {
      return NextResponse.redirect(new URL(pathname + search, process.env.APP_URL ?? 'http://localhost:3000'));
    }
    const url = req.nextUrl.clone();
    url.pathname = `${prefix}${pathname === '/' ? '' : pathname}`;
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
