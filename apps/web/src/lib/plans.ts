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
}

/** The proposal the client chose; not yet signed off (docs/prototype/07). */
export const PLANS: PlanDef[] = [
  { key: 'EVENT', name: 'Single event', price: 'AED 7,500', per: 'per event', blurb: 'One conference, forum or show, up to 1,000 attendees.', events: 1, attendees: 1000 },
  { key: 'SEASON', name: 'Season', price: 'AED 29,000', per: 'per year', blurb: 'Up to six events a year, with SMS and priority support on event days.', events: 6, attendees: null },
  { key: 'ENTERPRISE', name: 'Government and enterprise', price: 'AED 75,000+', per: 'a year', blurb: 'Unlimited events, your own domain, single sign-on and on-site support.', events: null, attendees: null },
];

export const planDef = (k: Plan) => PLANS.find((p) => p.key === k)!;
