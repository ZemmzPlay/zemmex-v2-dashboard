import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Signed links for things an attendee owns: an order, a claimed certificate. */
function key() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET must be at least 32 characters');
    return 'dev-only-secret-change-me-dev-only-secret';
  }
  return s;
}

export function sign(kind: string, id: string) {
  return `${id}.${createHmac('sha256', key()).update(`${kind}:${id}`).digest('base64url').slice(0, 22)}`;
}

export function verify(kind: string, token: string): string | null {
  const [id, sig] = token.split('.');
  if (!id || !sig) return null;
  const expected = sign(kind, id).split('.')[1];
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

/** A small signed object in a URL-safe string, for upload tickets. Not encrypted: don't put secrets in it. */
export function sealData(kind: string, data: object) {
  const body = Buffer.from(JSON.stringify(data)).toString('base64url');
  return `${body}.${createHmac('sha256', key()).update(`${kind}:${body}`).digest('base64url')}`;
}

export function unsealData<T>(kind: string, token: string): T | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = Buffer.from(createHmac('sha256', key()).update(`${kind}:${body}`).digest('base64url'));
  const got = Buffer.from(sig);
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString()) as T;
  } catch {
    return null;
  }
}
