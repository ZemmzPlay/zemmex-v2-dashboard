import 'server-only';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { appUrl } from './email';

/**
 * "Continue with Microsoft" and "Continue with Google": OpenID Connect with
 * the authorisation code flow and PKCE. Plain fetch, no SDK.
 *
 *   MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_TENANT (default "organizations")
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *   Redirect URIs to register: <APP_URL>/auth/microsoft/callback, <APP_URL>/auth/google/callback
 *
 * The ID token comes straight from the provider's token endpoint over TLS in
 * exchange for our client secret, which OpenID Connect Core 3.1.3.7 accepts in
 * place of checking its signature; issuer, audience, expiry and nonce are
 * still checked. SSO_TEST=1 (never in production) adds a local test provider.
 */
export type SsoProvider = 'microsoft' | 'google' | 'test';

interface ProviderConfig {
  label: string;
  authorize: string;
  token: string;
  clientId: string;
  secret: string;
  scope: string;
  issuer: (iss: string) => boolean;
}

function config(p: SsoProvider): ProviderConfig | null {
  if (p === 'microsoft') {
    const id = process.env.MICROSOFT_CLIENT_ID;
    const secret = process.env.MICROSOFT_CLIENT_SECRET;
    if (!id || !secret) return null;
    const tenant = process.env.MICROSOFT_TENANT || 'organizations';
    return {
      label: 'Microsoft', clientId: id, secret, scope: 'openid email profile',
      authorize: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
      token: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      // Multi-tenant apps get the signing-in tenant's issuer.
      issuer: (iss) => /^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]{36}\/v2\.0$/.test(iss),
    };
  }
  if (p === 'google') {
    const id = process.env.GOOGLE_CLIENT_ID;
    const secret = process.env.GOOGLE_CLIENT_SECRET;
    if (!id || !secret) return null;
    return {
      label: 'Google', clientId: id, secret, scope: 'openid email profile',
      authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
      token: 'https://oauth2.googleapis.com/token',
      issuer: (iss) => iss === 'https://accounts.google.com' || iss === 'accounts.google.com',
    };
  }
  if (p === 'test' && process.env.SSO_TEST === '1' && process.env.NODE_ENV !== 'production') {
    return { label: 'Test sign-in', clientId: 'test', secret: 'test', scope: 'openid', authorize: `${appUrl()}/auth-test/authorize`, token: '', issuer: (iss) => iss === 'zemmz-test' };
  }
  return null;
}

export function ssoProviders(): { key: SsoProvider; label: string }[] {
  return (['microsoft', 'google', 'test'] as SsoProvider[]).flatMap((k) => {
    const c = config(k);
    return c ? [{ key: k, label: c.label }] : [];
  });
}

export const isSsoProvider = (p: string): p is SsoProvider => p === 'microsoft' || p === 'google' || p === 'test';
export const ssoLabel = (p: string) => ({ microsoft: 'Microsoft', google: 'Google', test: 'Test sign-in' })[p] ?? p;

/* ------------------------------------------------------------------ */
/* The short-lived state cookie                                         */
/* ------------------------------------------------------------------ */

export const SSO_COOKIE = 'zemmz_sso';

function key() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET must be at least 32 characters');
    return 'dev-only-secret-change-me-dev-only-secret';
  }
  return s;
}

export function seal(data: object) {
  const body = Buffer.from(JSON.stringify(data)).toString('base64url');
  return `${body}.${createHmac('sha256', key()).update(`sso:${body}`).digest('base64url')}`;
}

export function unseal<T>(value: string | undefined): T | null {
  if (!value) return null;
  const [body, sig] = value.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', key()).update(`sso:${body}`).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString()) as T;
  } catch {
    return null;
  }
}

export interface SsoState {
  provider: SsoProvider;
  state: string;
  nonce: string;
  verifier: string;
  /** Where to go afterwards, and whether this is linking an account from Your account. */
  next: string;
  intent: 'login' | 'link';
  exp: number;
}

/** Builds the provider's authorise URL and the cookie value that proves the round trip is ours. */
export function beginSso(provider: SsoProvider, opts: { next: string; intent: 'login' | 'link'; loginHint?: string }) {
  const c = config(provider);
  if (!c) return null;
  const st: SsoState = {
    provider, state: randomBytes(16).toString('base64url'), nonce: randomBytes(16).toString('base64url'), verifier: randomBytes(32).toString('base64url'),
    next: opts.next.startsWith('/') && !opts.next.startsWith('//') ? opts.next : '/events', intent: opts.intent, exp: Date.now() + 10 * 60_000,
  };
  const url = new URL(c.authorize);
  url.searchParams.set('client_id', c.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', `${appUrl()}/auth/${provider}/callback`);
  url.searchParams.set('scope', c.scope);
  url.searchParams.set('state', st.state);
  url.searchParams.set('nonce', st.nonce);
  url.searchParams.set('code_challenge', createHash('sha256').update(st.verifier).digest('base64url'));
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('prompt', 'select_account');
  if (opts.loginHint) url.searchParams.set('login_hint', opts.loginHint);
  return { url: url.toString(), cookie: seal(st) };
}

export interface SsoProfile {
  subject: string;
  email: string;
  name: string;
  /** The provider vouches that this person owns the email address. */
  emailVerified: boolean;
}

export class SsoError extends Error {}

const b64json = (s: string) => JSON.parse(Buffer.from(s, 'base64url').toString()) as Record<string, unknown>;

/** Exchanges the code for an ID token and checks it. */
export async function finishSso(provider: SsoProvider, code: string, state: string, cookie: SsoState | null): Promise<SsoProfile> {
  const c = config(provider);
  if (!c) throw new SsoError('That sign-in option isn’t set up.');
  if (!cookie || cookie.provider !== provider || cookie.state !== state || cookie.exp < Date.now()) throw new SsoError('The sign-in took too long or was started in another browser. Try again.');

  let claims: Record<string, unknown>;
  if (provider === 'test') {
    const data = unseal<Record<string, unknown>>(code);
    if (!data) throw new SsoError('The test sign-in failed.');
    claims = data;
  } else {
    const res = await fetch(c.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', code, redirect_uri: `${appUrl()}/auth/${provider}/callback`,
        client_id: c.clientId, client_secret: c.secret, code_verifier: cookie.verifier,
      }),
      cache: 'no-store',
    });
    const json = (await res.json()) as { id_token?: string; error_description?: string };
    if (!res.ok || !json.id_token) throw new SsoError(`${c.label} didn’t confirm the sign-in${json.error_description ? `: ${json.error_description.split('\n')[0]}` : ''}.`);
    const [, payload] = json.id_token.split('.');
    claims = b64json(payload);
  }

  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!c.issuer(String(claims.iss ?? ''))) throw new SsoError('The sign-in came from an unexpected issuer.');
  if (!aud.includes(c.clientId)) throw new SsoError('The sign-in was meant for another application.');
  if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now() - 60_000) throw new SsoError('The sign-in expired. Try again.');
  if (claims.nonce !== cookie.nonce) throw new SsoError('The sign-in couldn’t be matched to this browser. Try again.');

  const email = String(claims.email ?? claims.preferred_username ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new SsoError(`${c.label} didn’t share an email address. Use an account with one.`);
  // Google says so directly. Microsoft only vouches for an email when the
  // tenant verified the domain (xms_edov); otherwise anyone could type any address.
  const verified = provider === 'google' ? claims.email_verified === true : provider === 'microsoft' ? claims.xms_edov === true || claims.xms_edov === '1' : claims.email_verified === true;
  const subject = String(provider === 'microsoft' ? `${claims.tid ?? ''}:${claims.oid ?? claims.sub}` : claims.sub ?? '');
  if (!subject || subject === ':') throw new SsoError('The sign-in didn’t include an account ID.');
  return { subject, email, name: String(claims.name ?? email.split('@')[0]).slice(0, 120), emailVerified: verified };
}

export const emailDomain = (email: string) => email.split('@')[1]?.toLowerCase() ?? '';
