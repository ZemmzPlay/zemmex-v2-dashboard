import { beforeAll, describe, expect, it } from 'vitest';
import { beginSso, finishSso, seal, unseal, SsoError, type SsoState } from './sso';
import { normaliseDomain } from './domains';

beforeAll(() => {
  process.env.SSO_TEST = '1';
});

function stateFor(provider: 'test' = 'test') {
  const began = beginSso(provider, { next: '/events', intent: 'login' })!;
  const st = unseal<SsoState>(began.cookie)!;
  return { began, st };
}
const code = (over: Record<string, unknown>, nonce: string) =>
  seal({ iss: 'zemmz-test', aud: 'test', exp: Math.floor(Date.now() / 1000) + 60, nonce, sub: 'u1', email: 'Rana@Example.com', email_verified: true, ...over });

describe('single sign-on', () => {
  it('sends PKCE and a nonce, and seals its state', () => {
    const { began, st } = stateFor();
    const url = new URL(began.url);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('nonce')).toBe(st.nonce);
    expect(unseal(began.cookie.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')))).toBeNull();
  });

  it('accepts a matching sign-in and lower-cases the email', async () => {
    const { st } = stateFor();
    const p = await finishSso('test', code({}, st.nonce), st.state, st);
    expect(p).toMatchObject({ email: 'rana@example.com', emailVerified: true, subject: 'u1' });
  });

  it('refuses a wrong state, nonce, audience, issuer or an expired token', async () => {
    const { st } = stateFor();
    await expect(finishSso('test', code({}, st.nonce), 'other', st)).rejects.toBeInstanceOf(SsoError);
    await expect(finishSso('test', code({}, 'other'), st.state, st)).rejects.toThrow(/matched/);
    await expect(finishSso('test', code({ aud: 'x' }, st.nonce), st.state, st)).rejects.toThrow(/another application/);
    await expect(finishSso('test', code({ iss: 'x' }, st.nonce), st.state, st)).rejects.toThrow(/issuer/);
    await expect(finishSso('test', code({ exp: 1 }, st.nonce), st.state, st)).rejects.toThrow(/expired/);
    await expect(finishSso('test', code({}, st.nonce), st.state, { ...st, exp: Date.now() - 1 })).rejects.toThrow(/too long/);
  });

  it('keeps redirects on this site', () => {
    const began = beginSso('test', { next: '//evil.example', intent: 'login' })!;
    expect(unseal<SsoState>(began.cookie)!.next).toBe('/events');
  });
});

describe('domains', () => {
  it('normalises what people paste and refuses junk', () => {
    expect(normaliseDomain('https://Events.Client.com/path')).toBe('events.client.com');
    expect(normaliseDomain('events.client.com.')).toBe('events.client.com');
    expect(normaliseDomain('localhost')).toBeNull();
    expect(normaliseDomain('-bad-.com')).toBeNull();
    expect(normaliseDomain('a b.com')).toBeNull();
  });
});
