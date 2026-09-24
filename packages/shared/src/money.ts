/**
 * Money is stored as integer minor units (fils for AED, fils for KWD at 1/1000).
 * Written as `AED 7,500` — currency code, space, grouped number.
 */

export const CURRENCIES = {
  AED: { exponent: 2 },
  KWD: { exponent: 3 },
  SAR: { exponent: 2 },
  QAR: { exponent: 2 },
  BHD: { exponent: 3 },
  OMR: { exponent: 3 },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;

export function isCurrency(c: string): c is CurrencyCode {
  return c in CURRENCIES;
}

export function toMinor(amount: number, currency: CurrencyCode): number {
  return Math.round(amount * 10 ** CURRENCIES[currency].exponent);
}

export function fromMinor(minor: number, currency: CurrencyCode): number {
  return minor / 10 ** CURRENCIES[currency].exponent;
}

/** `AED 7,500`, `KWD 12.500`, or `Free` for zero when `freeLabel` is set. */
export function formatMoney(minor: number, currency: string, opts: { freeLabel?: boolean } = {}): string {
  if (opts.freeLabel && minor === 0) return 'Free';
  const exp = isCurrency(currency) ? CURRENCIES[currency].exponent : 2;
  const value = minor / 10 ** exp;
  const whole = Number.isInteger(value);
  const n = value.toLocaleString('en-US', {
    minimumFractionDigits: whole ? 0 : exp,
    maximumFractionDigits: exp,
  });
  return `${currency} ${n}`;
}

/**
 * The platform ticket fee (docs/05-pricing.md): free registration costs
 * nothing; paid tickets add 2.5% plus a fixed amount, capped per ticket.
 * Card processing is separate and charged by the payment provider.
 *
 * AED figures are the proposal the client chose. Other currencies are
 * placeholder conversions and must be confirmed before going live.
 */
export const TICKET_FEE = {
  rate: 0.025,
  schedule: {
    AED: { fixed: 2, cap: 25 },
    SAR: { fixed: 2, cap: 25 },
    QAR: { fixed: 2, cap: 25 },
    KWD: { fixed: 0.17, cap: 2 },
    BHD: { fixed: 0.2, cap: 2.5 },
    OMR: { fixed: 0.2, cap: 2.5 },
  } satisfies Record<CurrencyCode, { fixed: number; cap: number }>,
};

/** Fee in minor units for one ticket priced at `priceMinor`. */
export function ticketFee(priceMinor: number, currency: CurrencyCode): number {
  if (priceMinor <= 0) return 0;
  const { fixed, cap } = TICKET_FEE.schedule[currency];
  const fee = Math.round(priceMinor * TICKET_FEE.rate) + toMinor(fixed, currency);
  return Math.min(fee, toMinor(cap, currency));
}
