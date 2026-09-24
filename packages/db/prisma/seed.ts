/**
 * Seeds the four sample events from the prototype.
 *
 *   npm run db:seed                     calendar mode (default)
 *   SEED_CLOCK=demo npm run db:seed     demo mode
 *
 * calendar: authored times on real dates — the medical summit is today, the
 *   design conference is on its second day, the founders summit ended nine
 *   days ago, the concert is tonight. What's live depends on the time you run it.
 * demo: every event is shifted so that right now is the moment the prototype
 *   froze it at (session 3 running, doors open). Clock times look odd; the
 *   states are exactly the prototype's. Re-seed before a demo.
 *
 * Deletes all existing data first.
 */
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient, type FieldKind, type QuestionKind } from '@prisma/client';
import { dayKey, toMinor, zonedTime, type CurrencyCode } from '@zemmz/shared';
import { hashPassword } from '../src/password';
import { EVENTS, FEM, FIRST, LAST, pick, type Rnd, type SeedEvent } from './seed-data';

const prisma = new PrismaClient();
const MODE = process.env.SEED_CLOCK === 'demo' ? 'demo' : 'calendar';
const NOW = new Date();
const MIN = 60_000;
const DAY = 1440 * MIN;

/** The prototype's Park–Miller generator, so the same seed gives the same people. */
function makeRnd(seed: number): Rnd {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const hm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Maps (day, minute) in the event's timezone to a real instant. */
function clockFor(e: SeedEvent) {
  const today = dayKey(NOW, e.timezone);
  if (MODE === 'demo') {
    const day0 = addDays(today, -e.now.day);
    const frozen = zonedTime(addDays(day0, e.now.day), hm(e.now.min), e.timezone);
    const shift = NOW.getTime() - frozen.getTime();
    return (day: number, min: number) => new Date(zonedTime(addDays(day0, day), hm(min), e.timezone).getTime() + shift);
  }
  const day0 = addDays(today, -e.todayIsDay);
  return (day: number, min: number) => zonedTime(addDays(day0, day), hm(min), e.timezone);
}

const FIELD_KIND: Record<string, FieldKind> = { Text: 'TEXT', Email: 'EMAIL', Phone: 'PHONE', Dropdown: 'DROPDOWN', Date: 'DATE', 'Ticket picker': 'TICKET' };
const Q_KIND: Record<string, QuestionKind> = { rating: 'RATING', check: 'CHECK', choice: 'CHOICE', text: 'TEXT' };

async function seedEvent(e: SeedEvent, orgId: string) {
  const at = clockFor(e);
  const cur = e.currency as CurrencyCode;
  const days = Math.max(...e.sessions.map((s) => s.day));
  const startsOn = new Date(dayKey(at(0, 0), e.timezone));
  const endsOn = new Date(dayKey(at(days, 0), e.timezone));

  const event = await prisma.event.create({
    data: {
      organisationId: orgId, type: e.type, name: e.name, shortName: e.short, slug: e.slug,
      timezone: e.timezone, startsOn, endsOn, currency: e.currency, accentColour: e.colour,
      organiserName: e.site.org, heroText: e.site.hero, venueName: e.site.venue, venueAddress: e.site.addr, venuePhone: e.site.phone,
      registrationOpen: e.qs.reg, afterEventOn: e.qs.cert, maintenance: e.qs.maint,
      creditRule: e.cme.rule, creditThresholdPct: e.cme.pct, requireEvaluation: e.cme.needEval,
      nextPublicId: 1001 + e.regs.n,
    },
  });

  const tickets = await Promise.all(
    e.tickets.map((t, i) =>
      prisma.ticketType.create({ data: { eventId: event.id, name: t.n, description: t.d, priceMinor: toMinor(t.price, cur), capacity: t.cap, onSale: t.on, sortOrder: i } }),
    ),
  );
  const ticketByName = new Map(tickets.map((t) => [t.name, t]));

  const promos = await Promise.all(
    e.promos.map((p) => prisma.promoCode.create({ data: { eventId: event.id, code: p.code, percentOff: p.off, uses: p.uses } })),
  );
  void promos;

  // Sessions or gates
  const sessionIds = new Map<string, string>();
  const sessions = e.sessions.map((s, i) => {
    const id = randomUUID();
    sessionIds.set(s.id, id);
    const startsAt = at(s.day, s.start);
    const endsAt = at(s.day, s.end === 1439 ? 1439 : s.end);
    const gateTicket = e.type === 'concert' ? ticketByName.get(s.ch) : undefined;
    return {
      id, eventId: event.id, kind: e.type === 'concert' ? ('GATE' as const) : ('SESSION' as const),
      title: s.n, chairs: e.type === 'concert' ? '' : s.ch, location: s.loc, startsAt, endsAt,
      capacity: s.cap ?? null, credits: s.cme, gateTicketTypeId: gateTicket?.id ?? null,
      status: NOW >= endsAt ? ('ENDED' as const) : NOW >= startsAt ? ('LIVE' as const) : ('UPCOMING' as const),
      sortOrder: i,
    };
  });
  await prisma.session.createMany({ data: sessions });
  const sessById = new Map(sessions.map((s) => [s.id, s]));

  // People on the programme
  await prisma.person.createMany({
    data: e.people.map((p, i) => ({ eventId: event.id, name: p.n, category: p.c, highlight: p.h, bio: p.b, setTime: p.x ?? '', sortOrder: p.o * 100 + i })),
  });

  // Form, pages, templates
  await prisma.formField.createMany({
    data: e.fields.map((f, i) => ({ eventId: event.id, key: f.k, label: f.l, kind: FIELD_KIND[f.type] ?? 'TEXT', required: f.req, enabled: f.on, locked: !!f.lock, options: f.opts ?? [], sortOrder: i })),
  });
  await prisma.sitePage.createMany({ data: e.site.pages.map((p, i) => ({ eventId: event.id, key: p.key, title: p.n, bodyHtml: p.b, sortOrder: i })) });
  await prisma.messageTemplate.create({ data: { eventId: event.id, kind: 'CONFIRMATION', subject: e.mail.subject, bodyHtml: e.mail.body, kicker: e.mail.kicker } });
  if (e.cert) {
    await prisma.certificateTemplate.create({
      data: { eventId: event.id, title: e.cert.title, activityNumber: e.cert.activity, provider: e.cert.provider, bodyText: e.cert.text, signerName: e.cert.signer, signerRole: e.cert.role, issueDateText: e.cert.date, minSessions: e.cert.min },
    });
  }
  if (e.after) {
    await prisma.afterEventPage.create({
      data: { eventId: event.id, showRecordings: e.after.rec, showSlides: e.after.slides, showPhotos: e.after.photos, showSurvey: e.after.survey, attendeesOnly: e.after.gate, message: e.after.msg, views: e.after.views },
    });
  }
  const questions = await Promise.all(
    e.evalQs.map((q, i) => prisma.evaluationQuestion.create({ data: { eventId: event.id, text: q.t, kind: Q_KIND[q.type], groupName: q.group ?? '', required: q.req, sortOrder: i } })),
  );

  // Registrants with realistic attendance (port of seedRegs)
  const rnd = makeRnd(e.regs.seed);
  const c = e.regs;
  const regs: Prisma.RegistrationCreateManyInput[] = [];
  const orders: Prisma.OrderCreateManyInput[] = [];
  const att: Prisma.AttendanceCreateManyInput[] = [];
  const perSession = new Map<string, number>();
  const attendedIds: string[] = [];
  const idByPublic = new Map<number, string>();
  const nowMin = NOW.getTime();

  for (let i = 0; i < c.n; i++) {
    let t = '', f: string, l: string;
    if (c.fixed[i]) [t, f, l] = c.fixed[i];
    else {
      f = pick(rnd, FIRST); l = pick(rnd, LAST);
      if (c.titles) t = pick(rnd, FEM.includes(f) ? ['Dr', 'Dr', 'Dr', 'Prof', 'Mrs', 'Ms'] : ['Dr', 'Dr', 'Dr', 'Prof', 'Mr']);
    }
    const field1 = c.f1(rnd, t);
    const field2 = pick(rnd, c.f2);
    const ccode = pick(rnd, c.cc ?? ['+971', '+971', '+966', '+965', '+974']);
    const mobile = `${ccode}${pick(rnd, ['5', '6', '9'])}${String(Math.floor(rnd() * 1e7)).padStart(7, '0')}`;
    const isToday = i >= c.n - c.today;
    const createdAt = new Date(isToday ? nowMin - Math.floor(rnd() * 300) * MIN : nowMin - (Math.floor(rnd() * 40) + 1) * DAY - Math.floor(rnd() * 600) * MIN);
    const tkName = c.tk(rnd, field1);
    const ticket = ticketByName.get(tkName);
    const email = `${f}.${l.replace('Al-', '')}@${pick(rnd, c.dom)}`.toLowerCase();
    const id = randomUUID();
    const publicId = 1001 + i;
    idByPublic.set(publicId, id);

    let orderId: string | null = null;
    if (ticket && ticket.priceMinor > 0) {
      orderId = randomUUID();
      orders.push({ id: orderId, eventId: event.id, buyerName: `${f} ${l}`, buyerEmail: email, currency: e.currency, subtotalMinor: ticket.priceMinor, totalMinor: ticket.priceMinor, status: 'PAID', provider: 'seed', createdAt, paidAt: createdAt });
    }

    // Everyone at index 2 (ID 1003) is the demo no-show: booked, never came.
    const attender = i < 2 || (i !== 2 && rnd() < c.show);
    let attended = false;
    if (attender && e.gatesByTicket) {
      const gid = sessionIds.get(e.gatesByTicket[field1])!;
      const g = sessById.get(gid)!;
      const inAt = new Date(Math.min(g.startsAt.getTime() + Math.floor(Math.pow(rnd(), 1.4) * (i < 2 ? 60 : 122)) * MIN, nowMin - MIN));
      const passOut = rnd() < 0.05;
      if (g.startsAt.getTime() < nowMin) {
        const outAt = passOut ? new Date(Math.min(inAt.getTime() + (30 + Math.floor(rnd() * 40)) * MIN, nowMin)) : null;
        att.push({ id: randomUUID(), registrationId: id, sessionId: gid, inAt, outAt });
        attended = true;
      }
    } else if (attender) {
      const taken = new Set<string>();
      for (const s of e.sessions) {
        const sid = sessionIds.get(s.id)!;
        const ss = sessById.get(sid)!;
        if (ss.startsAt.getTime() > nowMin) continue;
        const live = ss.endsAt.getTime() > nowMin;
        const grp = (c.groups ?? []).find((g) => g.includes(s.id));
        if (grp && grp.some((x) => taken.has(x))) continue;
        const p = i < 2 ? 1 : c.p[s.id] ?? 0.6;
        if (rnd() >= p) continue;
        if (s.cap && (perSession.get(sid) ?? 0) >= s.cap - 2) continue;
        const inAt = new Date(Math.min(ss.startsAt.getTime() + Math.floor(rnd() * 15) * MIN, nowMin - MIN));
        const len = s.end - s.start;
        let outAt: Date | null = null;
        if (!live) {
          outAt = rnd() < 0.12 ? new Date(ss.startsAt.getTime() + (Math.floor(len * 0.4) + Math.floor(rnd() * 15)) * MIN) : new Date(ss.endsAt.getTime() - Math.floor(rnd() * 8) * MIN);
          if (rnd() < 0.07) outAt = null; // forgot to scan out
        }
        att.push({ id: randomUUID(), registrationId: id, sessionId: sid, inAt, outAt });
        perSession.set(sid, (perSession.get(sid) ?? 0) + 1);
        if (grp) taken.add(s.id);
        attended = true;
      }
    }
    if (attended) attendedIds.push(id);
    const printed = attended || (!isToday && rnd() < 0.5);

    regs.push({
      id, eventId: event.id, publicId, title: t, firstName: f, lastName: l, email, mobile, field1, field2,
      ticketTypeId: ticket?.id ?? null, orderId, source: 'WEBSITE', createdAt,
      badgePrintedAt: printed ? new Date(Math.min(createdAt.getTime() + DAY, nowMin)) : null,
    });
  }

  await prisma.order.createMany({ data: orders });
  for (let k = 0; k < regs.length; k += 1000) await prisma.registration.createMany({ data: regs.slice(k, k + 1000) });
  for (let k = 0; k < att.length; k += 2000) await prisma.attendance.createMany({ data: att.slice(k, k + 2000) });

  // Evaluation responses from people who attended, around the prototype's averages
  const responders = attendedIds.slice(0, Math.min(e.evalResponses, attendedIds.length));
  const maxCheck = Math.max(1, ...e.evalQs.map((q) => q.n ?? 0));
  const erng = makeRnd(e.regs.seed + 1000);
  for (const [k, registrationId] of responders.entries()) {
    const answers: Prisma.EvaluationAnswerCreateManyResponseInput[] = [];
    e.evalQs.forEach((q, qi) => {
      const qid = questions[qi].id;
      if (q.type === 'rating' || q.type === 'choice') {
        const r = erng();
        const avg = q.avg ?? 4.5;
        answers.push({ questionId: qid, rating: r < avg - 4 ? 5 : r < 0.97 ? 4 : 3 });
      } else if (q.type === 'check') {
        if (erng() < (q.n ?? 0) / (maxCheck * 1.08)) answers.push({ questionId: qid, checked: true });
      } else if (q.type === 'text' && qi === e.evalQs.findIndex((x) => x.type === 'text') && k < e.comments.length) {
        answers.push({ questionId: qid, text: e.comments[k] });
      }
    });
    await prisma.evaluationResponse.create({
      data: { eventId: event.id, registrationId, submittedAt: new Date(nowMin - Math.floor(erng() * 600) * MIN), answers: { createMany: { data: answers } } },
    });
  }

  // Raffle winners
  for (const [k, pid] of e.raffle.wins.entries()) {
    const rid = idByPublic.get(pid);
    if (rid) await prisma.raffleDraw.create({ data: { eventId: event.id, registrationId: rid, prize: e.raffle.prize, drawnAt: new Date(nowMin - (190 - k * 2) * MIN), drawnByLabel: 'Nabil Alhaj' } });
  }

  // Sent history and activity
  for (const s of e.sent) {
    await prisma.broadcast.create({
      data: { eventId: event.id, audience: s.aud, channel: s.ch, subject: s.subj, bodyHtml: `<p>${s.subj}</p>`, recipientCount: s.n, sentByLabel: 'Nabil Alhaj', createdAt: new Date(nowMin - s.ago * MIN) },
    });
  }
  await prisma.activityLog.createMany({
    data: e.logs.map(([who, what, ago]) => ({ organisationId: orgId, eventId: event.id, actorLabel: who, action: what, createdAt: new Date(nowMin - ago * MIN) })),
  });

  return { name: e.name, slug: e.slug, regs: regs.length, attendance: att.length, orders: orders.length };
}

async function main() {
  console.log(`Seeding in ${MODE} mode…`);
  await prisma.organisation.deleteMany();
  await prisma.user.deleteMany();

  const org = await prisma.organisation.create({ data: { name: 'Demo organisation', slug: 'demo' } });

  const password = process.env.SEED_PASSWORD ?? 'zemmz-demo-2026';
  const hash = await hashPassword(password);
  const users: [string, string, 'OWNER' | 'ADMIN' | 'EDITOR' | 'CHECKIN'][] = [
    ['Demo owner', 'owner@zemmz.test', 'OWNER'],
    ['Demo editor', 'editor@zemmz.test', 'EDITOR'],
    ['Registration desk', 'desk@zemmz.test', 'CHECKIN'],
  ];
  for (const [name, email, role] of users) {
    await prisma.user.create({ data: { name, email, passwordHash: hash, memberships: { create: { organisationId: org.id, role } } } });
  }

  for (const e of EVENTS) {
    const r = await seedEvent(e, org.id);
    console.log(`  ${r.name.padEnd(34)} /e/${r.slug.padEnd(16)} ${String(r.regs).padStart(5)} registrations  ${String(r.attendance).padStart(5)} scans  ${String(r.orders).padStart(5)} orders`);
  }
  console.log(`\nSign in at /login with any of: ${users.map((u) => u[1]).join(', ')}`);
  console.log(`Password: ${password}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
