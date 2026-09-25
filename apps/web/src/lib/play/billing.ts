import 'server-only';
import { prisma, type Organisation, type Plan } from '@zemmz/db';
import { planDef, planVatBps, PLAY_KEEP_DAYS, PLAY_TRIAL_DAYS } from '@/lib/plans';

/**
 * zemmz Play plans are separate from Live's: Club and Season by the month or
 * the year, publishers by quote. New organisations get 14 days of Season from
 * their first website. When a plan or the trial runs out, the websites go
 * offline (nothing is deleted for 60 days) until someone pays.
 */
export interface PlayAccess {
  state: 'none' | 'trial' | 'active' | 'lapsed';
  plan: Plan | null;
  endsAt: Date | null;
  websites: number | null;
  players: number | null;
  /** Websites are online and players can register. */
  open: boolean;
}

export async function playAccess(org: Pick<Organisation, 'id' | 'playPlan' | 'playPlanEndsAt' | 'playTrialEndsAt'>, now = new Date()): Promise<PlayAccess> {
  if (org.playPlan && org.playPlanEndsAt && org.playPlanEndsAt > now) {
    const def = planDef(org.playPlan);
    return { state: 'active', plan: org.playPlan, endsAt: org.playPlanEndsAt, websites: def.websites ?? null, players: def.players ?? null, open: true };
  }
  if (org.playTrialEndsAt && org.playTrialEndsAt > now && !org.playPlan) {
    const def = planDef('PLAY_SEASON');
    return { state: 'trial', plan: null, endsAt: org.playTrialEndsAt, websites: def.websites ?? null, players: def.players ?? null, open: true };
  }
  if (!org.playTrialEndsAt && !org.playPlan) return { state: 'none', plan: null, endsAt: null, websites: 3, players: 100_000, open: true };
  return { state: 'lapsed', plan: org.playPlan, endsAt: org.playPlanEndsAt ?? org.playTrialEndsAt, websites: 0, players: 0, open: false };
}

/** Starts the trial with the first website. */
export async function ensurePlayTrial(orgId: string) {
  await prisma.organisation.updateMany({ where: { id: orgId, playTrialEndsAt: null, playPlan: null }, data: { playTrialEndsAt: new Date(Date.now() + PLAY_TRIAL_DAYS * 86_400_000) } });
}

export function playQuote(plan: Plan, months: 1 | 12, country: string) {
  const def = planDef(plan);
  if (def.product !== 'play' || def.priceMinor == null) return null;
  const amount = months === 12 ? (def.yearlyPerMonthMinor ?? def.priceMinor) * 12 : def.priceMinor;
  const vatBps = planVatBps(country);
  const vat = Math.round((amount * vatBps) / 10_000);
  return { amountMinor: amount, vatMinor: vat, totalMinor: amount + vat, currency: 'AED', months };
}

/** Whether another website fits the plan. */
export async function websiteAllowance(org: Organisation): Promise<string | null> {
  const a = await playAccess(org);
  if (!a.open) return 'Your zemmz Play plan has ended. Choose a plan to create websites again.';
  if (a.websites == null) return null;
  const used = await prisma.playProject.count({ where: { organisationId: org.id, archivedAt: null } });
  return used < a.websites ? null : `Your plan includes ${a.websites} ${a.websites === 1 ? 'website' : 'websites'}. Archive one, or move to a bigger plan.`;
}

export { PLAY_KEEP_DAYS };
