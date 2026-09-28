import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { prisma, type PlayProject } from '@zemmz/db';
import { appUrl } from '@/lib/email';
import { seal, unseal } from '@/lib/sso';

/**
 * Players signing in to a tournament website with Google or Discord.
 *
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET   (the same app as organiser sign-in)
 *   DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET
 *   Redirect URIs to register: <APP_URL>/play-auth/google/callback, <APP_URL>/play-auth/discord/callback
 *
 * The round trip always runs on the app's own address, because a website may
 * live on the organiser's domain. The callback hands the result back to the
 * website with a one-time token, and the website sets its own cookie.
 * SSO_TEST=1 (never in production) adds a local test provider.
 */
export type PlayOAuthProvider = 'google' | 'discord' | 'test';
export const PLAY_OAUTH_COOKIE = 'zplay_oauth';

interface Config { label: string; authorize: string; token: string; clientId: string; secret: string; scope: string }

function config(p: PlayOAuthProvider): Config | null {
  if (p === 'google') {
    const id = process.env.GOOGLE_CLIENT_ID, secret = process.env.GOOGLE_CLIENT_SECRET;
    return id && secret ? { label: 'Google', clientId: id, secret, scope: 'openid email profile', authorize: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token' } : null;
  }
  if (p === 'discord') {
    const id = process.env.DISCORD_CLIENT_ID, secret = process.env.DISCORD_CLIENT_SECRET;
    return id && secret ? { label: 'Discord', clientId: id, secret, scope: 'identify email', authorize: 'https://discord.com/oauth2/authorize', token: 'https://discord.com/api/oauth2/token' } : null;
  }
  if (p === 'test' && process.env.SSO_TEST === '1' && process.env.NODE_ENV !== 'production') {
    return { label: 'Test sign-in', clientId: 'test', secret: 'test', scope: 'identify', authorize: `${appUrl()}/auth-test/authorize`, token: '' };
  }
  return null;
}

export const isPlayProvider = (p: string): p is PlayOAuthProvider => p === 'google' || p === 'discord' || p === 'test';
export const playProviderReady = (p: PlayOAuthProvider) => !!config(p);
export const PLAY_PROVIDER_LABEL: Record<PlayOAuthProvider, string> = { google: 'Google', discord: 'Discord', test: 'Test sign-in' };

/** The providers a website offers: switched on by the organiser and set up on the server. */
export function siteProviders(p: Pick<PlayProject, 'signInMethods'>): PlayOAuthProvider[] {
  const on = (['google', 'discord'] as PlayOAuthProvider[]).filter((k) => p.signInMethods.includes(k) && config(k));
  // The test provider stands in for both in development, so the flow can be tried without real apps.
  if (config('test') && (p.signInMethods.includes('google') || p.signInMethods.includes('discord'))) on.push('test');
  return on;
}

interface State { provider: PlayOAuthProvider; projectId: string; state: string; verifier: string; nonce: string; next: string; exp: number }

export function beginPlayOAuth(provider: PlayOAuthProvider, project: PlayProject, next: string) {
  const c = config(provider);
  if (!c) return null;
  const st: State = { provider, projectId: project.id, state: randomBytes(16).toString('base64url'), verifier: randomBytes(32).toString('base64url'), nonce: randomBytes(16).toString('base64url'), next, exp: Date.now() + 10 * 60_000 };
  const url = new URL(c.authorize);
  url.searchParams.set('client_id', c.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', `${appUrl()}/play-auth/${provider}/callback`);
  url.searchParams.set('scope', c.scope);
  url.searchParams.set('state', st.state);
  url.searchParams.set('code_challenge', createHash('sha256').update(st.verifier).digest('base64url'));
  url.searchParams.set('code_challenge_method', 'S256');
  if (provider === 'google') url.searchParams.set('nonce', st.nonce);
  if (provider !== 'discord') url.searchParams.set('prompt', 'select_account');
  if (provider === 'test') url.searchParams.set('nonce', st.nonce);
  return { url: url.toString(), cookie: seal({ play: st }) };
}

export interface PlayIdentity { provider: 'google' | 'discord'; id: string; email: string; emailVerified: boolean; name: string; handle: string }
export class PlayOAuthError extends Error {}

const b64json = (s: string) => JSON.parse(Buffer.from(s, 'base64url').toString()) as Record<string, unknown>;

export async function finishPlayOAuth(provider: PlayOAuthProvider, code: string, state: string, cookie: string | undefined): Promise<{ identity: PlayIdentity; st: State }> {
  const c = config(provider);
  const st = unseal<{ play: State }>(cookie)?.play;
  if (!c) throw new PlayOAuthError('That sign-in option isn’t set up.');
  if (!st || st.provider !== provider || st.state !== state || st.exp < Date.now()) throw new PlayOAuthError('The sign-in took too long or was started in another browser. Try again.');

  if (provider === 'test') {
    const d = unseal<Record<string, unknown>>(code);
    if (!d || d.nonce !== st.nonce) throw new PlayOAuthError('The test sign-in failed.');
    const email = String(d.email ?? '').toLowerCase();
    return { st, identity: { provider: 'discord', id: `test:${email}`, email, emailVerified: d.email_verified === true, name: String(d.name ?? email.split('@')[0]), handle: String(d.name ?? '') } };
  }

  const res = await fetch(c.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: `${appUrl()}/play-auth/${provider}/callback`, client_id: c.clientId, client_secret: c.secret, code_verifier: st.verifier }),
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => ({}))) as { id_token?: string; access_token?: string; error_description?: string };
  if (!res.ok) throw new PlayOAuthError(`${c.label} didn’t confirm the sign-in${json.error_description ? `: ${json.error_description}` : ''}.`);

  if (provider === 'google') {
    if (!json.id_token) throw new PlayOAuthError('Google didn’t confirm the sign-in.');
    const claims = b64json(json.id_token.split('.')[1]);
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!['https://accounts.google.com', 'accounts.google.com'].includes(String(claims.iss)) || !aud.includes(c.clientId) || claims.nonce !== st.nonce || typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now() - 60_000) {
      throw new PlayOAuthError('The Google sign-in couldn’t be checked. Try again.');
    }
    const email = String(claims.email ?? '').toLowerCase();
    return { st, identity: { provider, id: String(claims.sub), email, emailVerified: claims.email_verified === true, name: String(claims.name ?? ''), handle: '' } };
  }

  // Discord: OAuth2 without an ID token; the profile comes from its API with the access token.
  if (!json.access_token) throw new PlayOAuthError('Discord didn’t confirm the sign-in.');
  const me = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${json.access_token}` }, cache: 'no-store' });
  const u = (await me.json().catch(() => ({}))) as { id?: string; username?: string; global_name?: string; email?: string; verified?: boolean };
  if (!me.ok || !u.id) throw new PlayOAuthError('Discord didn’t share your profile. Try again.');
  return { st, identity: { provider, id: u.id, email: String(u.email ?? '').toLowerCase(), emailVerified: u.verified === true, name: u.global_name || u.username || '', handle: u.username ?? '' } };
}

/* ------------------------------------------------------------------ */
/* Handing the result back to the website                               */
/* ------------------------------------------------------------------ */

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** A one-time token (2 minutes) that the website exchanges for a session for this player. */
export async function handoffToken(projectId: string, playerId: string, method: string) {
  const token = randomBytes(24).toString('base64url');
  await prisma.playerCode.create({ data: { projectId, target: `handoff:${playerId}:${method}`, codeHash: sha256(token), expiresAt: new Date(Date.now() + 2 * 60_000) } });
  return token;
}

/** The player the token was made for, once. */
export async function redeemHandoff(projectId: string, token: string): Promise<{ playerId: string; method: string } | null> {
  const row = await prisma.playerCode.findFirst({ where: { projectId, codeHash: sha256(token), usedAt: null, expiresAt: { gt: new Date() }, target: { startsWith: 'handoff:' } } });
  if (!row) return null;
  const claimed = await prisma.playerCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (!claimed.count) return null;
  const [, playerId, method] = row.target.split(':');
  return { playerId, method };
}

/** "mobile", "tablet" or "desktop", from a user agent. */
export function deviceOf(ua: string | null) {
  const s = ua ?? '';
  if (/iPad|Tablet|Nexus 7|Nexus 10|SM-T|Kindle|Silk/i.test(s)) return 'tablet';
  if (/Mobi|Android|iPhone|iPod/i.test(s)) return 'mobile';
  return s ? 'desktop' : '';
}
