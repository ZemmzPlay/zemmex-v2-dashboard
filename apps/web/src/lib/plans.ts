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
  product: 'live' | 'play';
  /** zemmz Play only: a year paid up front, per month. */
  yearlyPerMonthMinor?: number;
  /** zemmz Play only: tournament websites and players allowed. */
  websites?: number | null;
  players?: number | null;
}

/** The proposal the client chose; not yet signed off (docs/prototype/07). */
export const PLANS: PlanDef[] = [
  { key: 'EVENT', name: 'Single event', price: 'AED 7,500', per: 'per event', blurb: 'One conference, forum or show, up to 1,000 attendees.', events: 1, attendees: 1000, priceMinor: 750_000, product: 'live' },
  { key: 'SEASON', name: 'Season', price: 'AED 29,000', per: 'per year', blurb: 'Up to six events a year, with SMS and priority support on event days.', events: 6, attendees: null, priceMinor: 2_900_000, product: 'live' },
  { key: 'ENTERPRISE', name: 'Government and enterprise', price: 'AED 75,000+', per: 'a year', blurb: 'Unlimited events, your own domain, single sign-on and on-site support.', events: null, attendees: null, priceMinor: null, product: 'live' },
  { key: 'PLAY_CLUB', name: 'Club', price: 'AED 199', per: 'a month', blurb: 'One tournament website, up to 2,000 players, unlimited tournaments.', events: null, attendees: null, priceMinor: 19_900, yearlyPerMonthMinor: 15_900, websites: 1, players: 2_000, product: 'play' },
  { key: 'PLAY_SEASON', name: 'Season', price: 'AED 799', per: 'a month', blurb: 'Three websites, up to 100,000 players, your own domain and season rankings.', events: null, attendees: null, priceMinor: 79_900, yearlyPerMonthMinor: 63_900, websites: 3, players: 100_000, product: 'play' },
  { key: 'PLAY_PUBLISHER', name: 'Publishers and federations', price: 'Custom', per: '', blurb: 'Unlimited websites and players, single sign-on and an uptime SLA.', events: null, attendees: null, priceMinor: null, websites: null, players: null, product: 'play' },
];

export const planDef = (k: Plan) => PLANS.find((p) => p.key === k)!;
export const LIVE_PLANS = PLANS.filter((p) => p.product === 'live');
export const PLAY_PLANS = PLANS.filter((p) => p.product === 'play');
export type LivePlan = 'EVENT' | 'SEASON' | 'ENTERPRISE';

/** zemmz Play starts with this many days of Season, from the first website. */
export const PLAY_TRIAL_DAYS = 14;
/** A lapsed Play account's websites go offline; nothing is deleted for this long. */
export const PLAY_KEEP_DAYS = 60;

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
