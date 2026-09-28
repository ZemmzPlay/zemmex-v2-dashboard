/**
 * Tournament websites on subdomains: <slug>.PLAY_DOMAIN (zemmz.gg in
 * production). Needs a wildcard DNS record (*.zemmz.gg) pointing at the
 * server; Caddy issues each certificate on demand (infra/Caddyfile).
 * No PLAY_DOMAIN: websites live at /p/<slug> only.
 */
export const playDomain = () => (process.env.PLAY_DOMAIN ?? '').trim().toLowerCase().replace(/^\.|\.$/g, '');

/**
 * The origin the visitor used, from the proxy's forwarded headers. Behind a
 * rewrite `req.url` holds the server's own address, so a redirect built from it
 * would leave an organiser's domain (and the cookies set on it).
 */
export function visitorOrigin(req: Request) {
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? new URL(req.url).host).split(',')[0].trim();
  const proto = (req.headers.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '')).split(',')[0].trim();
  return `${proto}://${host}`;
}

/** The website slug a host names, if it's a subdomain of PLAY_DOMAIN. */
export function playSubdomain(host: string): string | null {
  const d = playDomain();
  const h = host.toLowerCase().replace(/:\d+$/, '');
  if (!d || !h.endsWith(`.${d}`)) return null;
  const sub = h.slice(0, -(d.length + 1));
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(sub) ? sub : null;
}

/** The address players see for a website: its own domain, its subdomain, or the path on the app. */
export function playAddress(p: { slug: string; customDomain: string | null; domainVerifiedAt: Date | null }, appUrl: string) {
  if (p.customDomain && p.domainVerifiedAt) return p.customDomain;
  if (playDomain()) return `${p.slug}.${playDomain()}`;
  return `${appUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}/p/${p.slug}`;
}
