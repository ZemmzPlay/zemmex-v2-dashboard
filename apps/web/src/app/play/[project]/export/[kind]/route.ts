import { prisma } from '@zemmz/db';
import { FORMAT_LABEL, formatMoney, playCountry, playGame } from '@zemmz/shared';
import { csvLine } from '@/lib/csv';
import { requireProject, tournamentPhase, PHASE_LABEL } from '@/lib/play/core';

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : '');

/** CSV downloads: tournaments, a tournament's entries, or players. */
export async function GET(req: Request, { params }: { params: Promise<{ project: string; kind: string }> }) {
  const { project: slug, kind } = await params;
  const { project } = await requireProject(slug);
  const url = new URL(req.url);
  let rows: unknown[][] = [];
  let name = kind;
  if (kind === 'tournaments') {
    const list = await prisma.tournament.findMany({ where: { projectId: project.id }, orderBy: { startsAt: 'asc' }, include: { _count: { select: { entries: { where: { status: { in: ['REGISTERED', 'CHECKED_IN', 'PENDING_PAYMENT'] } } } } } } });
    rows = [['Name', 'Game', 'Format', 'Team size', 'Status', 'Registration opens', 'Registration closes', 'Starts', 'Ends', 'Entrants', 'Capacity', 'Entry fee'],
      ...list.map((t) => [t.name, playGame(t.game).name, FORMAT_LABEL[t.format].en, t.teamSize, PHASE_LABEL[tournamentPhase(t)].en, iso(t.regOpensAt), iso(t.regClosesAt), iso(t.startsAt), iso(t.endsAt), t._count.entries, t.capacity, t.entryFeeMinor ? formatMoney(t.entryFeeMinor, t.currency) : 'Free'])];
  } else if (kind === 'entries') {
    const t = await prisma.tournament.findFirst({ where: { id: url.searchParams.get('t') ?? '', projectId: project.id } });
    if (!t) return new Response('Not found', { status: 404 });
    name = `${t.slug}-entries`;
    const entries = await prisma.entry.findMany({ where: { tournamentId: t.id }, orderBy: [{ place: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }], include: { members: { include: { player: true } } } });
    rows = [['Entry', 'Status', 'Seed', 'Place', 'Gamer tag', 'First name', 'Last name', 'Email', 'Phone', 'Country', 'Captain', 'Registered'],
      ...entries.flatMap((e) => e.members.map((m) => [e.name, e.status, e.seed ?? '', e.place ?? '', m.player.gamerTag, m.player.firstName, m.player.lastName, m.player.email, m.player.phone, playCountry(m.player.country)?.name ?? m.player.country, m.playerId === e.captainId ? 'Yes' : 'No', iso(e.createdAt)]))];
  } else if (kind === 'players') {
    const players = await prisma.playPlayer.findMany({ where: { projectId: project.id }, orderBy: { createdAt: 'asc' } });
    rows = [['Gamer tag', 'First name', 'Last name', 'Email', 'Phone', 'Country', 'Verification', 'Blacklisted', 'Joined', 'Last seen'],
      ...players.map((p) => [p.gamerTag, p.firstName, p.lastName, p.email, p.phone, playCountry(p.country)?.name ?? p.country, p.verification, p.blacklisted ? 'Yes' : 'No', iso(p.createdAt), iso(p.lastSeenAt)])];
  } else return new Response('Not found', { status: 404 });
  return new Response('﻿' + rows.map(csvLine).join('\r\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${project.slug}-${name}.csv"` },
  });
}
