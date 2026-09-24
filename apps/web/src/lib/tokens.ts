import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signed, unguessable links for attendees: the e-ticket in a confirmation
 * email. Public IDs are sequential (1001, 1002…), so they must never be
 * enough on their own to open someone's ticket.
 */
function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET must be at least 32 characters');
    return 'dev-only-secret-change-me-dev-only-secret';
  }
  return s;
}

const mac = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url').slice(0, 22);

export function ticketToken(registrationId: string): string {
  return `${registrationId}.${mac(`ticket:${registrationId}`)}`;
}

export function readTicketToken(token: string): string | null {
  const [id, sig] = token.split('.');
  if (!id || !sig) return null;
  const expected = mac(`ticket:${id}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}
