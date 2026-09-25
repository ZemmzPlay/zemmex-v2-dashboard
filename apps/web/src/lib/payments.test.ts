import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyStripeSignature } from './payments';
import { validIban } from './payouts';

describe('Stripe webhook signatures', () => {
  const secret = 'whsec_test';
  const body = '{"type":"checkout.session.completed"}';
  const now = 1_790_000_000_000;
  const t = Math.floor(now / 1000);
  const sig = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');

  it('accepts a correct, recent signature', () => {
    expect(verifyStripeSignature(body, `t=${t},v1=${sig}`, secret, now)).toBe(true);
  });
  it('refuses a changed body, a wrong secret, an old timestamp or no header', () => {
    expect(verifyStripeSignature(body + ' ', `t=${t},v1=${sig}`, secret, now)).toBe(false);
    expect(verifyStripeSignature(body, `t=${t},v1=${sig}`, 'whsec_other', now)).toBe(false);
    expect(verifyStripeSignature(body, `t=${t},v1=${sig}`, secret, now + 10 * 60_000)).toBe(false);
    expect(verifyStripeSignature(body, null, secret, now)).toBe(false);
    expect(verifyStripeSignature(body, `t=${t},v1=${sig}`, undefined, now)).toBe(false);
  });
});

describe('IBAN check', () => {
  it('accepts valid IBANs with or without spaces', () => {
    expect(validIban('AE07 0331 2345 6789 0123 456')).toBe(true);
    expect(validIban('GB82WEST12345698765432')).toBe(true);
    expect(validIban('KW81CBKU0000000000001234560101')).toBe(true);
  });
  it('refuses typos', () => {
    expect(validIban('AE07 0331 2345 6789 0123 457')).toBe(false);
    expect(validIban('AE07')).toBe(false);
  });
});
