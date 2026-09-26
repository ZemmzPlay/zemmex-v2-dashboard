import 'server-only';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { prisma, type PlayProject, type Role, type Tournament } from '@zemmz/db';
import { roundLabel, type Bracket } from '@zemmz/shared';
import { can, requireUser, type CurrentUser } from '@/lib/auth';

/**
 * zemmz Play in the dashboard. A project (tournament website) belongs to an
 * organisation, like a Live event, and uses the same roles:
 *   owners and admins     everything, including project settings and plans
 *   content editors       tournaments, results, players and the website
 *   check-in staff        score reports and player verification (moderators)
 */
export const playCan = {
  manageProject: (r: Role) => can.manageEvent(r),
  runTournaments: (r: Role) => r !== 'CHECKIN',
  moderate: (_r: Role) => true,
  editWebsite: (r: Role) => can.editContent(r),
};

/** A project the user may open, or 404 (a guessed slug from another organisation looks missing). */
export const requireProject = cache(async (slug: string): Promise<{ user: CurrentUser; project: PlayProject }> => {
  const user = await requireUser();
  const project = await prisma.playProject.findFirst({ where: { slug, organisationId: user.organisationId } });
  if (!project) notFound();
  return { user, project };
});

export async function requireProjectPermission(slug: string, check: (r: Role) => boolean) {
  const ctx = await requireProject(slug);
  if (!check(ctx.user.role)) notFound();
  return ctx;
}

export async function logPlay(projectId: string, actor: string, action: string) {
  await prisma.playActivity.create({ data: { projectId, actorLabel: actor, action } });
}

/** What the website and dashboard show a tournament as, from its state and dates. */
export type TournamentPhase = 'draft' | 'soon' | 'reg' | 'closed' | 'live' | 'ended' | 'cancelled';

export function tournamentPhase(t: Pick<Tournament, 'status' | 'regOpensAt' | 'regClosesAt'>, now = new Date()): TournamentPhase {
  if (t.status === 'DRAFT') return 'draft';
  if (t.status === 'CANCELLED') return 'cancelled';
  if (t.status === 'ENDED') return 'ended';
  if (t.status === 'LIVE') return 'live';
  if (now < t.regOpensAt) return 'soon';
  if (now <= t.regClosesAt) return 'reg';
  return 'closed';
}

export const PHASE_LABEL: Record<TournamentPhase, { en: string; ar: string; badge: string }> = {
  draft: { en: 'Draft', ar: 'مسودة', badge: 'b-neutral' },
  soon: { en: 'Coming soon', ar: 'قريباً', badge: 'b-neutral' },
  reg: { en: 'Registration open', ar: 'التسجيل مفتوح', badge: 'b-info' },
  closed: { en: 'Registration closed', ar: 'أُغلق التسجيل', badge: 'b-warn' },
  live: { en: 'Live', ar: 'مباشر', badge: 'b-ok' },
  ended: { en: 'Ended', ar: 'انتهت', badge: 'b-neutral' },
  cancelled: { en: 'Cancelled', ar: 'أُلغيت', badge: 'b-danger' },
};

/** Entries that hold a place (not withdrawn or disqualified). */
export const ACTIVE_ENTRY = ['PENDING_PAYMENT', 'REGISTERED', 'CHECKED_IN'] as const;

export function slugify(s: string, fallback = 'tournament') {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || fallback;
}

/** Where a project's public website lives. */
export const playSiteUrl = (slug: string) => `/p/${slug}`;

/** Labels matches by round ("Semifinals", "Lower round 2"), from the rounds each bracket has. */
export function matchLabeller(t: Pick<Tournament, 'format'>, matches: { bracket: string; round: number }[], locale: 'en' | 'ar' = 'en') {
  const last = new Map<string, number>();
  for (const m of matches) last.set(m.bracket, Math.max(last.get(m.bracket) ?? 0, m.round));
  return (m: { bracket: string; round: number }) => roundLabel(t.format, m.bracket as Bracket, m.round, last.get(m.bracket) ?? m.round, locale);
}
