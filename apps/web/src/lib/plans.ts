import type { Plan } from '@zemmz/db';

/** Confirmed attendees an organisation can take before a plan is active (docs/prototype/05-pricing.md). */
export const TRIAL_ATTENDEES = 50;

export interface PlanDef {
  key: Plan;
  name: string;
  price: string;
  per: string;
  blurb: string;
  /** Events a year; null for unlimited. */
  events: number | null;
  /** Attendees per event; null for unlimited. */
  attendees: number | null;
  /** Price in fils excluding VAT; null when it's quoted (enterprise). */
  priceMinor: number | null;
}

/** The proposal the client chose; not yet signed off (docs/prototype/07). */
export const PLANS: PlanDef[] = [
  { key: 'EVENT', name: 'Single event', price: 'AED 7,500', per: 'per event', blurb: 'One conference, forum or show, up to 1,000 attendees.', events: 1, attendees: 1000, priceMinor: 750_000 },
  { key: 'SEASON', name: 'Season', price: 'AED 29,000', per: 'per year', blurb: 'Up to six events a year, with SMS and priority support on event days.', events: 6, attendees: null, priceMinor: 2_900_000 },
  { key: 'ENTERPRISE', name: 'Government and enterprise', price: 'AED 75,000+', per: 'a year', blurb: 'Unlimited events, your own domain, single sign-on and on-site support.', events: null, attendees: null, priceMinor: null },
];

export const planDef = (k: Plan) => PLANS.find((p) => p.key === k)!;

/** A paid plan lasts a year; registrations stay open this long after it ends (the worker has the same number). */
export const PLAN_GRACE_DAYS = 14;

/** zemmz charges UAE VAT to organisations in the UAE (and when the country isn't set). */
export const planVatBps = (country: string) => (!country || country === 'United Arab Emirates' ? 500 : 0);

/** zemmz's own details on its invoices. */
export const zemmzSeller = () => ({
  name: process.env.ZEMMZ_LEGAL_NAME || 'zemmz',
  vatNumber: process.env.ZEMMZ_VAT_NUMBER || '',
  address: process.env.ZEMMZ_ADDRESS || 'Dubai, United Arab Emirates',
});

/**
 * Whether SMS can be sent: a provider on the server (SMS_PROVIDER, or the
 * "log" outbox in development), and a plan that includes it (not Single event).
 */
export function smsAvailability(org: { plan: Plan; planStatus: string }): { ok: true } | { ok: false; reason: string } {
  const provider = !!process.env.SMS_PROVIDER || (process.env.MESSAGING_PROVIDER ?? 'log') === 'log';
  if (!provider) return { ok: false, reason: 'SMS isn’t set up on this server yet.' };
  if (org.planStatus === 'ACTIVE' && org.plan === 'EVENT') return { ok: false, reason: 'SMS comes with the Season plan.' };
  return { ok: true };
}
