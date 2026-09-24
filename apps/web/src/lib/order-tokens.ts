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
