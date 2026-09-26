/**
 * zemmz Play sample data: the Gulf Esports League from the prototype, with a
 * live Valorant bracket waiting on score reports, an EA FC cup open for
 * registration, a finished Tekken round robin with prizes, and a draft.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import type { PrismaClient } from '@prisma/client';
import { placements, planRoundRobin, planSingleElimination, recordResult, type BMatch } from '@zemmz/shared';
import { FIRST, LAST, pick, type Rnd } from './seed-data';

const DAY = 86_400_000;
const COUNTRIES = ['KW', 'KW', 'KW', 'SA', 'SA', 'AE', 'AE', 'QA', 'BH', 'OM', 'EG', 'JO'];
const TAG_A = ['Night', 'Desert', 'Falcon', 'Storm', 'Neon', 'Ghost', 'Sand', 'Iron', 'Shadow', 'Blaze', 'Nova', 'Viper', 'Echo', 'Frost', 'Onyx', 'Pulse'];
const TAG_B = ['Wolf', 'Hawk', 'Rider', 'Fox', 'King', 'Blade', 'Byte', 'Strike', 'Lynx', 'Raven', 'Snipe', 'Dash', 'Zero', 'Fang', 'Ace', 'Bolt'];
const TEAMS = ['Kuwait Falcons', 'Riyadh Rush', 'Doha Dragons', 'Dubai Vipers', 'Manama Storm', 'Muscat Monarchs', 'Jeddah Jets', 'Abu Dhabi Aces'];

/* ---------- a small PNG, so score reports have screenshots to show ---------- */
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (b: Buffer) => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** A 320×180 "result screen": dark background, two score bars in the game's colours. */
function resultPng(a: number, b: number, c1: [number, number, number], blur = false) {
  const w = 320, h = 180;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      let px: [number, number, number] = [14 + (y >> 3), 12, 30 + (x >> 4)];
      const bar = (row: number, n: number) => y >= row && y < row + 26 && x >= 40 && x < 40 + n * 45;
      if (bar(50, a)) px = c1;
      if (bar(104, b)) px = [200, 200, 215];
      if (blur && (x + y) % 3) px = [px[0] >> 1, px[1] >> 1, px[2] >> 1];
      raw.set(px, y * (w * 3 + 1) + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function store(key: string, bytes: Buffer) {
  if (process.env.STORAGE_PROVIDER === 's3') return false;
  const root = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), '../../.data/uploads'));
  const p = path.resolve(root, key);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, bytes);
  return true;
}

export async function seedPlay(prisma: PrismaClient, orgId: string, rnd: Rnd) {
  const now = Date.now();
  await prisma.organisation.update({ where: { id: orgId }, data: { playPlan: 'PLAY_SEASON', playPlanEndsAt: new Date(now + 300 * DAY), playTrialEndsAt: new Date(now - 60 * DAY) } });
  const project = await prisma.playProject.create({
    data: {
      organisationId: orgId, slug: 'gel', name: 'Gulf Esports League', colour: '#6B4BFF', timezone: 'Asia/Kuwait', siteLanguage: 'BOTH',
      description: 'Open esports tournaments for players across the Gulf.',
      heroTitle: 'Compete across the Gulf', heroText: 'Free and paid tournaments in Valorant, EA Sports FC, Tekken and more. Sign up once, play all season.',
      countdownLabel: 'Season finals', countdownAt: new Date(now + 41 * DAY),
      rulesHtml: '<h2>General rules</h2><ul><li>Play under the gamer tag you registered with.</li><li>Record every match and keep the recording for 48 hours in case of a dispute.</li><li>Don’t message, harass or distract opponents.</li><li>Don’t manipulate your connection to affect gameplay.</li></ul><h2>Reporting scores</h2><p>Within 15 minutes of finishing, upload a screenshot of the result screen from My matches. An admin checks it and confirms the winner.</p><h2>No-shows</h2><p>If your opponent hasn’t joined 10 minutes after the match time, report it from My matches and the admins will award you the match.</p>',
      faqHtml: '<h3>Is it free to take part?</h3><p>Most tournaments are free. Each tournament page says if there’s an entry fee.</p><h3>How do I report my score?</h3><p>Go to My matches, enter the score and upload a screenshot of the result screen.</p><h3>How are prizes paid?</h3><p>By bank transfer to the winner (the captain, for teams) within 14 days of the final.</p>',
      socials: { instagram: 'https://instagram.com/gulfesports', x: 'https://x.com/gulfesports', twitch: 'https://twitch.tv/gulfesports', discord: 'https://discord.gg/gulfesports' },
      sponsors: ['Zain', 'Ooredoo', 'Red Bull', 'HyperX'],
      ar: { name: 'دوري الخليج للرياضات الإلكترونية', heroTitle: 'نافس في أنحاء الخليج', heroText: 'بطولات مجانية ومدفوعة في فالورانت و EA Sports FC وتيكن وغيرها. سجّل مرة واحدة والعب طوال الموسم.', countdownLabel: 'نهائيات الموسم' },
    },
  });

  // Players
  const used = new Set<string>();
  const players: Awaited<ReturnType<typeof prisma.playPlayer.create>>[] = [];
  for (let i = 0; i < 90; i++) {
    const first = pick(rnd, FIRST), last = pick(rnd, LAST);
    let tag = `${pick(rnd, TAG_A)}${pick(rnd, TAG_B)}`;
    while (used.has(tag.toLowerCase())) tag += Math.floor(rnd() * 90 + 10);
    used.add(tag.toLowerCase());
    const country = pick(rnd, COUNTRIES);
    const created = new Date(now - Math.floor(rnd() * 70) * DAY - Math.floor(rnd() * DAY));
    players.push(await prisma.playPlayer.create({
      data: {
        projectId: project.id, firstName: first, lastName: last, gamerTag: tag, email: `${tag.toLowerCase()}@players.test`,
        phone: rnd() < 0.7 ? `+965${String(50000000 + i * 7919).slice(0, 8)}` : '', country, locale: rnd() < 0.3 ? 'ar' : 'en',
        verification: i < 70 ? 'VERIFIED' : i < 86 ? 'PENDING' : 'REJECTED', blacklisted: i === 89, createdAt: created, lastSeenAt: new Date(now - Math.floor(rnd() * 5) * DAY),
      },
    }));
  }
  const pool = players.filter((p) => !p.blacklisted);

  const persist = async (tournamentId: string, list: BMatch[]) => {
    const ids = new Map<string, string>();
    for (const m of list) {
      const row = await prisma.match.create({ data: { tournamentId, bracket: m.bracket, round: m.round, position: m.position, entryAId: m.a, entryBId: m.b, aBye: m.aBye, bBye: m.bBye, scoreA: m.scoreA, scoreB: m.scoreB, winnerId: m.winner, status: m.status, confirmedBy: m.status === 'CONFIRMED' ? (m.aBye || m.bBye ? 'Bye' : 'Nabil Alhaj') : '', confirmedAt: m.status === 'CONFIRMED' ? new Date(now - DAY) : null } });
      ids.set(m.id, row.id);
    }
    for (const m of list) if (m.next || m.loser) await prisma.match.update({ where: { id: ids.get(m.id)! }, data: { nextMatchId: m.next ? ids.get(m.next.id) : null, nextSlot: m.next?.slot ?? null, loserMatchId: m.loser ? ids.get(m.loser.id) : null, loserSlot: m.loser?.slot ?? null } });
    return ids;
  };
  const at = (days: number, hour: number) => { const d = new Date(now + days * DAY); d.setUTCHours(hour - 3, 0, 0, 0); return d; };

  // 1. Valorant, teams of 5, live: quarterfinals done, semifinals waiting on reports.
  const val = await prisma.tournament.create({
    data: {
      projectId: project.id, slug: 'valorant-open', name: 'GEL Valorant Open', game: 'val', platform: 'PC', format: 'SINGLE_ELIMINATION', teamSize: 5, capacity: 16, status: 'LIVE', timezone: 'Asia/Kuwait',
      regOpensAt: at(-20, 18), regClosesAt: at(-4, 23), startsAt: at(-2, 19), endsAt: at(2, 23), bestOf: 3, playersReport: true, checkIn: false, countries: ['KW', 'SA', 'AE', 'QA', 'BH', 'OM'],
      description: 'Eight teams, single elimination, best of three. The final is best of five on stream.', prizes: [{ place: 1, amountMinor: 1_000_000, label: '' }, { place: 2, amountMinor: 400_000, label: '' }],
      currency: 'AED', currentRound: 2, startedAt: at(-2, 19), ar: { name: 'بطولة فالورانت المفتوحة' },
    },
  });
  const valEntries: { id: string; captainId: string }[] = [];
  for (let t = 0; t < 8; t++) {
    const members = pool.slice(t * 5, t * 5 + 5);
    valEntries.push(await prisma.entry.create({ data: { tournamentId: val.id, name: TEAMS[t], captainId: members[0].id, joinCode: `V${t}${members[0].id.slice(-5).toUpperCase()}`, seed: t < 2 ? t + 1 : null, status: 'REGISTERED', members: { create: members.map((m) => ({ playerId: m.id })) } } }));
  }
  const valList = planSingleElimination(valEntries.map((e) => e.id));
  for (const m of valList.filter((x) => x.round === 1)) recordResult(valList, m.id, 2, rnd() < 0.5 ? 0 : 1);
  const valIds = await persist(val.id, valList);
  const semis = valList.filter((m) => m.round === 2);
  const colour: [number, number, number] = [255, 70, 85];
  const report = async (engineId: string, side: 'a' | 'b', sa: number, sb: number, blur = false) => {
    const m = valList.find((x) => x.id === engineId)!;
    const entryId = side === 'a' ? m.a! : m.b!;
    const captain = valEntries.find((e) => e.id === entryId)!.captainId;
    const key = `${orgId}/play/${project.id}/screenshots/seed-${engineId}-${side}.png`;
    const png = resultPng(sa, sb, colour, blur);
    let assetId: string | null = null;
    if (store(key, png)) assetId = (await prisma.asset.create({ data: { organisationId: orgId, playProjectId: project.id, kind: 'SCREENSHOT', key, name: `result-${side}.png`, contentType: 'image/png', size: png.length } })).id;
    await prisma.scoreReport.create({ data: { matchId: valIds.get(engineId)!, entryId, playerId: captain, scoreA: sa, scoreB: sb, screenshotAssetId: assetId, createdAt: new Date(now - 40 * 60_000) } });
  };
  // Semifinal 1: both sides agree. Semifinal 2: they disagree.
  await report(semis[0].id, 'a', 2, 1);
  await report(semis[0].id, 'b', 2, 1);
  await prisma.match.update({ where: { id: valIds.get(semis[0].id)! }, data: { status: 'REVIEW' } });
  await report(semis[1].id, 'a', 2, 0);
  await report(semis[1].id, 'b', 1, 2, true);
  await prisma.match.update({ where: { id: valIds.get(semis[1].id)! }, data: { status: 'CONFLICT' } });

  // 2. EA FC, solo, registration open with a small entry fee.
  const fc = await prisma.tournament.create({
    data: {
      projectId: project.id, slug: 'ea-fc-weekly-cup', name: 'EA FC 25 Weekly Cup', game: 'fc', platform: 'PlayStation', format: 'SINGLE_ELIMINATION', teamSize: 1, capacity: 32, status: 'PUBLISHED', timezone: 'Asia/Kuwait',
      regOpensAt: at(-3, 18), regClosesAt: at(4, 23), startsAt: at(5, 20), endsAt: at(5, 23), bestOf: 1, playersReport: true, checkIn: true, countries: [],
      description: 'Every Friday night. Single elimination, one game per round, extra time and penalties if level.', prizes: [{ place: 1, amountMinor: 150_000, label: 'PlayStation Store card' }],
      currency: 'AED', entryFeeMinor: 2_500, ar: { name: 'كأس EA FC الأسبوعي' },
    },
  });
  for (const p of pool.slice(40, 53)) {
    const e = await prisma.entry.create({ data: { tournamentId: fc.id, name: p.gamerTag, captainId: p.id, status: 'REGISTERED', members: { create: { playerId: p.id } }, createdAt: new Date(now - Math.floor(rnd() * 3) * DAY) } });
    await prisma.entryOrder.create({ data: { tournamentId: fc.id, entryId: e.id, playerId: p.id, currency: 'AED', amountMinor: 2_500, feeMinor: 250, totalMinor: 2_750, processingMinor: 105, status: 'PAID', provider: 'seed', providerRef: `seed_${e.id.slice(-8)}`, paidAt: new Date(now - DAY) } });
  }

  // 3. Tekken, solo round robin, ended with prizes.
  const tek = await prisma.tournament.create({
    data: {
      projectId: project.id, slug: 'tekken-8-masters', name: 'Tekken 8 Masters', game: 'tek', platform: 'PlayStation', format: 'ROUND_ROBIN', teamSize: 1, capacity: 6, status: 'ENDED', timezone: 'Asia/Kuwait',
      regOpensAt: at(-40, 18), regClosesAt: at(-25, 23), startsAt: at(-21, 19), endsAt: at(-20, 23), bestOf: 3, playersReport: false, countries: [],
      prizes: [{ place: 1, amountMinor: 300_000, label: '' }, { place: 2, amountMinor: 100_000, label: '' }], currency: 'AED', currentRound: 5, startedAt: at(-21, 19), endedAt: at(-20, 23),
    },
  });
  const tekEntries: { id: string }[] = [];
  for (const p of pool.slice(53, 59)) tekEntries.push(await prisma.entry.create({ data: { tournamentId: tek.id, name: p.gamerTag, captainId: p.id, status: 'REGISTERED', members: { create: { playerId: p.id } } } }));
  const tekList = planRoundRobin(tekEntries.map((e) => e.id));
  for (const m of tekList) if (m.status === 'READY') recordResult(tekList, m.id, ...(rnd() < 0.5 ? [2, rnd() < 0.5 ? 0 : 1] : [rnd() < 0.5 ? 0 : 1, 2]) as [number, number]);
  await persist(tek.id, tekList);
  const places = placements('ROUND_ROBIN', tekEntries.map((e) => e.id), tekList);
  for (const [id, place] of places) await prisma.entry.update({ where: { id }, data: { place } });
  for (const [place, amount] of [[1, 300_000], [2, 100_000]]) {
    const winners = [...places].filter(([, p]) => p === place).map(([e]) => e);
    for (const entryId of winners) await prisma.prizeAward.create({ data: { tournamentId: tek.id, place, entryId, amountMinor: Math.round(amount / winners.length), paidAt: place === 1 ? new Date(now - 10 * DAY) : null, reference: place === 1 ? 'FT2609-44817' : '' } });
  }

  // 4. A draft still being set up.
  await prisma.tournament.create({
    data: {
      projectId: project.id, slug: 'rocket-league-3v3', name: 'Rocket League 3v3 Cup', game: 'rl', platform: 'PC, consoles', format: 'DOUBLE_ELIMINATION', teamSize: 3, capacity: 16, status: 'DRAFT', timezone: 'Asia/Kuwait',
      regOpensAt: at(10, 18), regClosesAt: at(20, 23), startsAt: at(22, 19), endsAt: at(23, 23), bestOf: 5, currency: 'AED',
    },
  });

  const log: [string, string, number][] = [
    ['Nabil Alhaj', 'confirmed Kuwait Falcons vs Abu Dhabi Aces 2–0 in GEL Valorant Open', 1],
    ['Nabil Alhaj', 'started GEL Valorant Open with 8 entrants', 2],
    ['Demo owner', 'created EA FC 25 Weekly Cup', 3],
    ['Demo owner', 'marked the place 1 prize in Tekken 8 Masters as paid (FT2609-44817)', 10],
  ];
  await prisma.playActivity.createMany({ data: log.map(([a, b, d]) => ({ projectId: project.id, actorLabel: a, action: b, createdAt: new Date(now - d * DAY) })) });
  return { players: players.length, slug: project.slug };
}
