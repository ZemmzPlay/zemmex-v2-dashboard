/**
 * The four sample events from the prototype (src/live-dashboard/N3a.js,
 * EVDEF), kept as plain data. Everyone and every organisation here is
 * fictional; see docs/HANDOVER.md before showing any of it to a client.
 *
 * Times are minutes after midnight in the event's timezone, days are offsets
 * from the first day. `now` is the moment the prototype froze each event at.
 */

import { KIMS_RATINGS, KIMS_STATEMENTS } from '@zemmz/shared';

export type Rnd = () => number;

export interface SeedSession {
  id: string; day: number; start: number; end: number; n: string; ch: string;
  cme: number; loc: string; cap?: number;
}

export interface SeedPerson { n: string; c: string; h: string; o: number; b: string; x?: string }
export interface SeedQuestion { t: string; type: 'rating' | 'check' | 'choice' | 'text'; req: boolean; avg?: number; n?: number; group?: string }
export interface SeedField { k: string; l: string; type: string; req: boolean; on: boolean; lock?: boolean; opts?: string[] }

export interface SeedEvent {
  key: string;
  type: 'medical' | 'conference' | 'summit' | 'concert';
  name: string; short: string; slug: string; currency: 'AED' | 'KWD'; colour: string; timezone: string;
  now: { day: number; min: number };
  /** In calendar mode, which day of the event is today (negative: already over). */
  todayIsDay: number;
  sessions: SeedSession[];
  gatesByTicket?: Record<string, string>;
  regs: {
    seed: number; n: number; today: number; titles?: boolean; show: number;
    p: Record<string, number>; groups?: string[][]; cc?: string[];
    fixed: [string, string, string][];
    f1: (rnd: Rnd, title: string) => string;
    f2: string[]; dom: string[];
    tk: (rnd: Rnd, f1: string) => string;
    dl?: number;
  };
  people: SeedPerson[];
  evalQs: SeedQuestion[];
  evalResponses: number;
  comments: string[];
  cert: null | { title: string; activity: string; provider: string; text: string; signer: string; role: string; date: string; min: number };
  cme: { rule: 'duration' | 'checkin'; pct: number; needEval: boolean };
  qs: { reg: boolean; cert: boolean; maint: boolean };
  tickets: { n: string; price: number; cap: number; on: boolean; d: string }[];
  promos: { code: string; off: number; uses: number }[];
  mail: { subject: string; body: string; kicker: string };
  sent: { ago: number; aud: string; n: number; ch: 'EMAIL' | 'SMS'; subj: string }[];
  fields: SeedField[];
  site: { dates: string; org: string; hero: string; venue: string; addr: string; phone: string; pages: { key: string; n: string; b: string }[] };
  raffle: { prize: string; wins: number[] };
  logs: [string, string, number][];
  after: null | { rec: boolean; slides: boolean; photos: boolean; survey: boolean; gate: boolean; msg: string; views: number };
}

export const wpick = (rnd: Rnd, list: [string, number][]) => {
  const t = list.reduce((a, x) => a + x[1], 0);
  let r = rnd() * t;
  for (const [v, w] of list) if ((r -= w) < 0) return v;
  return list[0][0];
};
export const pick = <T,>(rnd: Rnd, a: T[]): T => a[Math.floor(rnd() * a.length)];

export const FIRST = ['Ahmed','Noura','Yousef','Layla','Fatima','Omar','Mariam','Khalid','Sara','Hamad','Reem','Faisal','Aisha','Tariq','Dana','Huda','Salem','Jana','Majed','Lulwa','Bader','Hessa','Nasser','Maha','Ali','Shaikha','Rashid','Nour','Zaid','Priya','Thomas','Elena','Joseph','Anjali','Mohammed','Abdullah','Latifa','Sultan','Karim','Lina','Rania','Hassan','Mona','Daniel','Grace','Arjun','Chloe','Marco'];
export const LAST = ['Al-Mutairi','Al-Qahtani','Haddad','Mansour','Al-Sabah','Al-Harbi','Al-Kuwari','Al-Dosari','Al-Otaibi','Al-Rashid','Saleh','Al-Enezi','Farouk','Al-Marri','Al-Ajmi','Khoury','Al-Zahrani','Menon','George','Nair','Al-Shammari','Al-Fadhli','Behbehani','Al-Awadhi','Al-Mazrouei','Al-Ketbi','Nassar','Rahman','Costa','Walker','Kapoor','Al-Hosani'];
export const FEM = ['Noura','Layla','Fatima','Mariam','Sara','Reem','Aisha','Dana','Huda','Jana','Lulwa','Hessa','Maha','Shaikha','Nour','Priya','Elena','Anjali','Latifa','Lina','Rania','Mona','Grace','Chloe'];

const P = (n: string, c: string, h: string, o: number, b: string, x?: string): SeedPerson => ({ n, c, h, o, b, x });

const KIMS_AVGS = [4.6,4.61,4.61,4.66,4.63,4.68,4.51,4.67,4.69,4.65,4.75,4.73];

const ratings = (ts: string[], avgs: number[], reqFirst: number): SeedQuestion[] =>
  ts.map((t, i) => ({ t, type: 'rating', req: i < reqFirst, avg: avgs[i] }));
const checks = (group: string, items: [string, number][]): SeedQuestion[] =>
  items.map(([t, n]) => ({ t, type: 'check', group, req: false, n }));

export const EVENTS: SeedEvent[] = [
  /* ---------- 1. medical conference, live on day 1 ---------- */
  {
    key: 'ghs', type: 'medical', name: '5th Gulf Heart Summit', short: 'GHS', slug: 'gulfheartsummit', currency: 'KWD', colour: '#B3122E', timezone: 'Asia/Kuwait',
    now: { day: 0, min: 13 * 60 + 40 }, todayIsDay: 0,
    sessions: [
      { id: 's1', day: 0, start: 540, end: 630, n: 'Session 1: Review of recent guidelines', ch: 'Prof. Elena Moreno, Dr Salim Al-Harthy', cme: 1.5, loc: 'Ballroom' },
      { id: 's2', day: 0, start: 660, end: 750, n: 'Session 2: Challenging cases from Kuwait', ch: 'Dr Nadia Al-Sayegh, Dr Yaqoub Al-Saleh', cme: 1.5, loc: 'Ballroom' },
      { id: 's3', day: 0, start: 780, end: 870, n: 'Session 3: Heart failure in the Gulf', ch: 'Prof. Anna Lindqvist, Dr Khalid Al-Mansoori', cme: 1.5, loc: 'Ballroom' },
      { id: 's4', day: 0, start: 900, end: 960, n: 'Session 4: Imaging masterclass', ch: 'Dr Fahad Al-Otaibi', cme: 1, loc: 'Ballroom' },
      { id: 's5', day: 1, start: 540, end: 630, n: 'Session 5: Improving the quality of cardiology practice', ch: 'Prof. Faisal Al-Rumaihi, Dr Turki Al-Shehri', cme: 1.5, loc: 'Ballroom' },
      { id: 's6', day: 1, start: 660, end: 720, n: 'Closing session and awards', ch: 'Meeting directors', cme: 0, loc: 'Ballroom' },
    ],
    regs: {
      seed: 11, n: 248, today: 12, titles: true, show: 0.68, p: { s1: 0.86, s2: 0.76, s3: 0.66 }, cc: ['+965', '+965', '+965', '+966', '+971'],
      fixed: [['Dr', 'Ahmed', 'Al-Mutairi'], ['Prof', 'Noura', 'Al-Qahtani'], ['Dr', 'Yousef', 'Haddad'], ['Mrs', 'Layla', 'Mansour']],
      f1: (rnd, t) => (t === 'Mrs' || t === 'Ms' || t === 'Mr' ? pick(rnd, ['Nursing', 'Pharmacy', 'Nursing']) : pick(rnd, ['Cardiology','Cardiology','Cardiology','Internal medicine','Emergency medicine','Family medicine','Nursing','Nursing','Pharmacy','Cardiac surgery','Radiology'])),
      f2: ['Chest Diseases Hospital','Mubarak Al-Kabeer Hospital','Amiri Hospital','Al-Adan Hospital','Farwaniya Hospital','Jahra Hospital','Dasman Diabetes Institute','Sabah Hospital','Royal Hayat Hospital','Private clinic'],
      dom: ['gmail.com', 'outlook.com', 'moh.gov.kw', 'hospital.kw'],
      tk: (rnd) => (rnd() < 0.06 ? 'Industry representative' : 'Healthcare professional'),
    },
    people: [P('Prof. Faisal Al-Rumaihi','International','dir',1,'Consultant interventional cardiologist and chairman of the Kuwait coronary registry. He has led the summit since its first edition.'),P('Prof. Elena Moreno','International','dir',2,'Professor of Cardiology at a university hospital in Valencia. Her research focuses on heart failure registries and quality of care.'),P('Dr Maryam Al-Kuwari','Regional','co',1,'Consultant cardiologist and head of cardiac rehabilitation at a tertiary hospital in Doha.'),P('Dr Salim Al-Harthy','Regional','co',2,'Senior consultant cardiologist in Muscat and past president of the Gulf Cardiac Society.'),P('Prof. Richard Hale','International','',3,'Professor of Cardiology in the United Kingdom, specialising in antiplatelet therapy.'),P('Prof. Martín Castro','International','',4,'Head of cardiology at a university hospital in northern Spain.'),P('Prof. Anna Lindqvist','International','',5,'Heart failure specialist at a university hospital in Stockholm.'),P('Dr Khalid Al-Mansoori','Regional','',3,'Consultant cardiologist in Dubai and lead investigator of the Gulf breathlessness registry.'),P('Dr Nadia Al-Sayegh','Regional','',4,'Heart failure consultant in Kuwait.'),P('Dr Turki Al-Shehri','Regional','',5,'Interventional cardiologist at a cardiac centre in Riyadh.'),P('Dr Hamad Al-Fadhli','Local','',1,'Electrophysiologist at a specialist chest hospital in Kuwait.'),P('Dr Yaqoub Al-Saleh','Local','',2,'Consultant cardiologist at a general hospital in Kuwait.'),P('Dr Fahad Al-Otaibi','Local','',3,'Cardiac imaging specialist at a regional hospital in Kuwait.'),P('Dr Reem Al-Hajri','Local','',4,'Consultant cardiologist and educator at a diabetes institute in Kuwait.')],
    evalQs: [...ratings(KIMS_RATINGS, KIMS_AVGS, 99), ...checks('This programme…', KIMS_STATEMENTS.map((t, i): [string, number] => [t, [241, 145, 41, 128, 25, 139][i]])), { t: 'The facilities for presentations were', type: 'choice', req: true, avg: 4.52 }, { t: 'The illustrative material was', type: 'choice', req: true, avg: 4.58 }, { t: 'Other comments', type: 'text', req: false }, { t: 'Suggestions for future meetings, and would you recommend this programme?', type: 'text', req: false }],
    evalResponses: 120,
    comments: ['The heart failure session was the best I have attended in the region. More case-based discussion please.','Excellent organisation, and scanning in and out was quick.','Please share the slides after the meeting.','The hall was cold in the afternoon.','Would recommend to colleagues. The imaging masterclass should be longer.'],
    cert: { title: 'Certificate of Attendance', activity: '002398/CAR1/Sep26', provider: 'Kuwait Institute for Medical Specialization', text: 'Under the authority of the above CPD provider accredited by the {provider} for conducting CME/CPD activities, we certify that the above participant is entitled to claim {credits} CME/CPD credits in Category 1 under the MPC Program.', signer: 'Prof. Faisal Al-Rumaihi', role: 'Organiser & Meeting Director', date: '23 September 2026', min: 1 },
    cme: { rule: 'duration', pct: 75, needEval: true },
    qs: { reg: true, cert: false, maint: false },
    tickets: [{ n: 'Healthcare professional', price: 0, cap: 800, on: true, d: 'Free for doctors, nurses and pharmacists' }, { n: 'Industry representative', price: 50, cap: 40, on: true, d: 'Pharma and device companies' }],
    promos: [],
    mail: { subject: 'Your registration for the 5th Gulf Heart Summit (ID {registration_id})', body: '<p>Hi <b>{first_name}</b>,</p><p>Welcome to the 5th Gulf Heart Summit. We can’t wait to see you in Kuwait.</p><p>The meeting will be held at The Regency, Kuwait on {event_dates}.</p><p>Your registration ID is <b>{registration_id}</b>. Bring it to the registration desk to collect your badge.</p>', kicker: 'REGISTRATION' },
    sent: [{ ago: 2 * 1440 - 1180, aud: 'All registrants', n: 236, ch: 'EMAIL', subj: 'See you on Tuesday: badge collection and parking' }, { ago: 7 * 1440, aud: 'Not checked in', n: 120, ch: 'SMS', subj: 'Reminder: the summit starts in one week' }],
    fields: [{ k: 'title', l: 'Title', type: 'Dropdown', req: true, on: true, opts: ['Prof','Dr','Mr','Mrs','Ms'] }, { k: 'first', l: 'First name', type: 'Text', req: true, on: true, lock: true }, { k: 'last', l: 'Last name', type: 'Text', req: true, on: true, lock: true }, { k: 'spec', l: 'Speciality', type: 'Dropdown', req: true, on: true, opts: ['Cardiology','Cardiac surgery','Internal medicine','Emergency medicine','Family medicine','Nursing','Pharmacy','Radiology','Other'] }, { k: 'hosp', l: 'Hospital / centre', type: 'Text', req: true, on: true }, { k: 'mob', l: 'Mobile', type: 'Phone', req: true, on: true }, { k: 'email', l: 'Email', type: 'Email', req: true, on: true, lock: true }, { k: 'lic', l: 'Medical licence number', type: 'Text', req: false, on: false }],
    site: { dates: '22–23 September 2026', org: 'Gulf Cardiac Society', hero: 'Two days of guidelines, registries and challenging cases from across the Gulf.', venue: 'The Regency', addr: 'Arabian Gulf Street, Salmiya, Kuwait City', phone: '+965 2225 0000',
      pages: [{ key: 'welcome', n: 'Welcome letter', b: '<h2>Dear colleagues,</h2><p>It gives us great pleasure to welcome you to the fifth edition of the Gulf Heart Summit.</p><p>This year’s programme focuses on the practical application of the latest guidelines, the lessons of our regional registries, and challenging cases from hospitals in Kuwait.</p>' }, { key: 'cme', n: 'Registration & CME', b: '<h2>Accreditation</h2><p>This activity is accredited by the Kuwait Institute for Medical Specialization for up to 7 CME/CPD credits in Category 1.</p><p>Points are awarded for time in the room: scan in and out of each session at the door. You need to be present for at least 75% of a session to earn its points.</p>' }, { key: 'past', n: 'Past meetings', b: '<p>Four editions since 2022, with more than 1,500 attendees.</p>' }] },
    raffle: { prize: 'Conference bag and textbook', wins: [1044] },
    logs: [['Registration desk 1', 'checked in 38 delegates to Session 3', 0], ['Hessa Al-Sabah', 'printed 12 badges', 38], ['Nabil Alhaj', 'drew a raffle winner', 189], ['Registration desk 2', 'checked out 104 delegates from Session 1', 188], ['Nabil Alhaj', 'sent “See you on Tuesday” to 236 registrants', 2 * 1440 - 1180]],
    after: null,
  },
  /* ---------- 2. design conference, live on day 2 ---------- */
  {
    key: 'form', type: 'conference', name: 'Form Week 2026', short: 'FW', slug: 'formweek', currency: 'AED', colour: '#C2410C', timezone: 'Asia/Dubai',
    now: { day: 1, min: 11 * 60 + 10 }, todayIsDay: 1,
    sessions: [
      { id: 's1', day: 0, start: 570, end: 615, n: 'Opening keynote: Designing for the next billion', ch: 'Lina Haddad', cme: 0, loc: 'Main hall' },
      { id: 's2', day: 0, start: 630, end: 720, n: 'Workshop: Arabic type systems', ch: 'Tomás Ribeiro, Rana Aziz', cme: 0, loc: 'Studio 2', cap: 24 },
      { id: 's3', day: 0, start: 630, end: 720, n: 'Talks: Brands that travel', ch: 'Omar Farouk, Maya Lindgren', cme: 0, loc: 'Main hall' },
      { id: 's4', day: 0, start: 840, end: 930, n: 'Workshop: Prototyping with AI', ch: 'Kenji Mori', cme: 0, loc: 'Studio 1', cap: 30 },
      { id: 's5', day: 0, start: 960, end: 1020, n: 'Panel: Is the portfolio dead?', ch: 'Hana Kassem, Maya Lindgren, Omar Farouk', cme: 0, loc: 'Main hall' },
      { id: 's6', day: 1, start: 570, end: 630, n: 'Keynote: Craft at scale', ch: 'Maya Lindgren', cme: 0, loc: 'Main hall' },
      { id: 's7', day: 1, start: 645, end: 735, n: 'Workshop: Motion for interfaces', ch: 'Hana Kassem', cme: 0, loc: 'Studio 1', cap: 30 },
      { id: 's8', day: 1, start: 645, end: 735, n: 'Talks: Designing public space', ch: 'Aisha Al-Suwaidi, Yousef Al-Amiri', cme: 0, loc: 'Main hall' },
      { id: 's9', day: 1, start: 840, end: 900, n: 'Closing panel and Form Awards', ch: 'All speakers', cme: 0, loc: 'Main hall' },
    ],
    regs: {
      seed: 23, n: 312, today: 9, show: 0.8, groups: [['s2', 's3'], ['s7', 's8']], p: { s1: 0.8, s2: 0.35, s3: 0.8, s4: 0.4, s5: 0.7, s6: 0.75, s7: 0.3, s8: 0.85 },
      fixed: [['', 'Sara', 'Nasser'], ['', 'Omar', 'Khoury'], ['', 'Yousef', 'Haddad']],
      f1: (rnd) => wpick(rnd, [['Product design',5],['Brand & identity',4],['Architecture',3],['Interior design',2],['Motion',2],['Type design',1],['UX research',2],['Student',3]]),
      f2: ['Studio Nakhla','Bayt Creative','Kite & Key','Northlight Design','Arc Atelier','Freelance','Sable Studio','Mesh Product','Dune Architects','University student'],
      dom: ['gmail.com', 'studio.ae', 'outlook.com', 'icloud.com'],
      tk: (rnd, f1) => (f1 === 'Student' ? 'Student' : rnd() < 0.24 ? 'Early bird' : rnd() < 0.2 ? 'Studio pass (per seat)' : 'Standard'),
    },
    people: [P('Noor Al-Kaabi','Speaker','host',1,'Festival director of Form Week and your host on the main stage.'),P('Lina Haddad','Keynote','key',1,'Creative director of a Beirut studio known for bilingual brand systems across the Levant and the Gulf.'),P('Maya Lindgren','Keynote','',2,'Design lead at a Stockholm product company, writing about craft in large teams.'),P('Tomás Ribeiro','Workshop lead','',1,'Type designer from Lisbon who has drawn Latin and Arabic families for news brands.'),P('Rana Aziz','Workshop lead','',2,'Arabic type designer and calligrapher based in Sharjah.'),P('Kenji Mori','Workshop lead','',3,'Product designer and prototyper from Tokyo, focused on AI-assisted design tools.'),P('Hana Kassem','Speaker','',2,'Motion designer from Cairo who leads motion systems for fintech apps.'),P('Omar Farouk','Speaker','',3,'Brand strategist in Riyadh, working with national and consumer brands.'),P('Aisha Al-Suwaidi','Speaker','',4,'Architect and co-founder of a Dubai practice designing shaded public spaces.'),P('Yousef Al-Amiri','Speaker','',5,'Urbanist in Abu Dhabi studying how people use streets in extreme heat.')],
    evalQs: [...ratings(['Overall, how would you rate Form Week?','The quality of the talks','The hands-on workshops','The venue and facilities','Time to meet other designers','Value for money'], [4.54,4.61,4.72,4.38,3.96,4.21], 2), ...checks('Next year, we’d like…', [['More workshops',188],['Portfolio reviews',142],['Longer breaks for networking',121],['Student sessions',64],['Evening events',97]]), { t: 'Which session stood out, and why?', type: 'text', req: false }, { t: 'What should we change next year?', type: 'text', req: false }],
    evalResponses: 90,
    comments: ['The Arabic type workshop was worth the ticket on its own.','Main hall got very full for the public space talks. Bigger room please.','Loved the check-in, took seconds.','More time between talks to actually meet people.','Please publish the slides.'],
    cert: { title: 'Certificate of Attendance', activity: '', provider: '', text: 'This certifies that the above participant attended {sessions} at Form Week 2026, Dubai Design District.', signer: 'Noor Al-Kaabi', role: 'Festival director', date: '22 September 2026', min: 1 },
    cme: { rule: 'checkin', pct: 75, needEval: false },
    qs: { reg: true, cert: false, maint: false },
    tickets: [{ n: 'Standard', price: 650, cap: 380, on: true, d: 'Both days, all talks' }, { n: 'Studio pass (per seat)', price: 550, cap: 90, on: true, d: 'For teams of 3 or more' }, { n: 'Student', price: 150, cap: 120, on: true, d: 'Valid student ID required' }, { n: 'Early bird', price: 450, cap: 100, on: false, d: 'Ended 31 August' }],
    promos: [{ code: 'DESIGNERS10', off: 10, uses: 34 }, { code: 'SPEAKERGUEST', off: 100, uses: 12 }],
    mail: { subject: 'Your Form Week ticket ({registration_id})', body: '<p>Hi <b>{first_name}</b>,</p><p>You’re in. Form Week runs on {event_dates} at Dubai Design District.</p><p>Show this ticket ID at the door: <b>{registration_id}</b>. Workshops have limited seats, so arrive ten minutes early.</p>', kicker: 'YOUR TICKET' },
    sent: [{ ago: 2 * 1440, aud: 'All attendees', n: 303, ch: 'EMAIL', subj: 'Form Week is on Monday: your guide to d3' }, { ago: 1020, aud: 'Checked in', n: 268, ch: 'EMAIL', subj: 'Day 2: workshops and the closing awards' }],
    fields: [{ k: 'first', l: 'First name', type: 'Text', req: true, on: true, lock: true }, { k: 'last', l: 'Last name', type: 'Text', req: true, on: true, lock: true }, { k: 'email', l: 'Email', type: 'Email', req: true, on: true, lock: true }, { k: 'tk', l: 'Ticket', type: 'Ticket picker', req: true, on: true, lock: true }, { k: 'spec', l: 'Discipline', type: 'Dropdown', req: true, on: true, opts: ['Product design','Brand & identity','Architecture','Interior design','Motion','Type design','UX research','Student','Other'] }, { k: 'hosp', l: 'Studio / company', type: 'Text', req: false, on: true }, { k: 'mob', l: 'Mobile', type: 'Phone', req: false, on: true }, { k: 'port', l: 'Portfolio or website', type: 'Text', req: false, on: false }],
    site: { dates: '21–22 September 2026', org: 'Form Collective', hero: 'Two days of talks and hands-on workshops for designers across the region.', venue: 'Dubai Design District (d3)', addr: 'Building 6, Dubai Design District, Dubai', phone: '+971 4 555 0142',
      pages: [{ key: 'about', n: 'About Form Week', b: '<h2>Made by designers, for designers</h2><p>Form Week brings product, brand, type and spatial designers together for two days of talks and workshops.</p>' }, { key: 'tickets', n: 'Tickets & FAQs', b: '<h2>Tickets</h2><p>Standard tickets include every talk. Workshops have limited seats and are first come, first served.</p>' }, { key: 'past', n: 'Past editions', b: '<p>Three editions since 2023.</p>' }] },
    raffle: { prize: 'A year of design software', wins: [1121] },
    logs: [['Door team', 'checked in 27 people to Motion for interfaces', 8], ['Noor Al-Kaabi', 'closed Early bird ticket sales', 22 * 1440], ['Nabil Alhaj', 'sent “Day 2” to 268 attendees', 1020]],
    after: null,
  },
  /* ---------- 3. entrepreneur summit, already ended ---------- */
  {
    key: 'mfs', type: 'summit', name: 'Majlis Founders Summit', short: 'MFS', slug: 'majlisfounders', currency: 'AED', colour: '#0E5E4E', timezone: 'Asia/Dubai',
    now: { day: 2, min: 0 }, todayIsDay: 9,
    sessions: [
      { id: 's1', day: 0, start: 540, end: 600, n: 'Opening keynote: Building for the region from day one', ch: 'Faris Al-Hashimi', cme: 0, loc: 'Main stage' },
      { id: 's2', day: 0, start: 615, end: 705, n: 'Panel: What investors want in 2027', ch: 'Dina Mourad, Ravi Menon, Salma Al-Nuaimi', cme: 0, loc: 'Main stage' },
      { id: 's3', day: 0, start: 615, end: 705, n: 'Pitch arena: Fintech and commerce', ch: 'Judges: Ravi Menon, Salma Al-Nuaimi', cme: 0, loc: 'Pitch arena' },
      { id: 's4', day: 0, start: 840, end: 930, n: 'Fireside: Scaling from Abu Dhabi to Riyadh', ch: 'Khaled Barakat', cme: 0, loc: 'Main stage' },
      { id: 's5', day: 0, start: 945, end: 1035, n: 'Pitch arena: Climate and mobility', ch: 'Judges: Dina Mourad, Tom Ellison', cme: 0, loc: 'Pitch arena' },
      { id: 's6', day: 1, start: 570, end: 630, n: 'Keynote: AI companies that last', ch: 'Leila Nasser', cme: 0, loc: 'Main stage' },
      { id: 's7', day: 1, start: 645, end: 735, n: 'Investor roundtables', ch: 'By invitation', cme: 0, loc: 'Majlis room', cap: 60 },
      { id: 's8', day: 1, start: 645, end: 735, n: 'Workshop: Your first hire outside the founding team', ch: 'Tom Ellison', cme: 0, loc: 'Studio' },
      { id: 's9', day: 1, start: 840, end: 900, n: 'Pitch final and closing', ch: 'Mariam Al-Zaabi', cme: 0, loc: 'Main stage' },
    ],
    regs: {
      seed: 37, n: 520, today: 0, show: 0.78, groups: [['s2', 's3'], ['s7', 's8']], p: { s1: 0.85, s2: 0.6, s3: 0.5, s4: 0.7, s5: 0.4, s6: 0.75, s7: 0.2, s8: 0.5, s9: 0.7 },
      fixed: [['', 'Khalid', 'Al-Mazrouei'], ['', 'Rania', 'Saleh'], ['', 'Yousef', 'Haddad']],
      f1: (rnd) => wpick(rnd, [['Founder',9],['Investor',2],['Corporate innovation',2],['Government',1],['Service provider',1],['Student',1]]),
      f2: ['Qafila Pay','Sadu Health','Marsa Logistics','Tamr Foods','Baytna Homes','Oryx Seed Partners','Sahel Mobility','Harbor Labs','Najm Robotics','Rimal Energy','Kanz Ventures'],
      dom: ['gmail.com', 'company.ae', 'outlook.com', 'startup.io'],
      tk: (rnd, f1) => (f1 === 'Investor' ? 'Investor' : f1 === 'Student' ? 'Student' : rnd() < 0.12 ? 'Startup exhibitor' : 'Founder'),
      dl: 0.46,
    },
    people: [P('Mariam Al-Zaabi','Panellist','host',1,'Founder of the Majlis Founders community and host of the summit.'),P('Faris Al-Hashimi','Keynote','key',1,'Founder of a regional payments company that now operates in six countries.'),P('Leila Nasser','Keynote','',2,'AI researcher turned founder, building tools for Arabic language models.'),P('Dina Mourad','Panellist','',2,'Partner at a seed fund investing across the Gulf and North Africa.'),P('Khaled Barakat','Panellist','',3,'Operator who scaled a logistics start-up from Abu Dhabi into Saudi Arabia.'),P('Tom Ellison','Panellist','',4,'Former head of people at a London scale-up, now advising Gulf founders on hiring.'),P('Ravi Menon','Pitch judge','',1,'Angel investor and founder of a Dubai angel network.'),P('Salma Al-Nuaimi','Pitch judge','',2,'Head of a corporate venture arm in Abu Dhabi.')],
    evalQs: [...ratings(['Overall, how would you rate the summit?','The quality of the speakers','The pitch arena','Meeting investors and partners','The venue and organisation','Value for money'], [4.47,4.52,4.31,4.08,4.63,4.12], 2), ...checks('I came away with…', [['New investor contacts',212],['Potential customers or partners',164],['A hire or co-founder lead',58],['Ideas I will act on',301],['Nothing useful',14]]), { t: 'Which session was most useful?', type: 'text', req: false }, { t: 'What should we do differently next year?', type: 'text', req: false }],
    evalResponses: 200,
    comments: ['Met two investors I had been chasing for months. Worth it.','The pitch arena needs a bigger room.','Recordings available the next morning is a great touch.','More structured matchmaking between founders and investors.','Great organisation, check-in took seconds.'],
    cert: { title: 'Certificate of Participation', activity: '', provider: '', text: 'This certifies that the above participant took part in {sessions} at the Majlis Founders Summit.', signer: 'Mariam Al-Zaabi', role: 'Founder, Majlis Founders', date: '16 September 2026', min: 1 },
    cme: { rule: 'checkin', pct: 75, needEval: false },
    qs: { reg: false, cert: true, maint: false },
    tickets: [{ n: 'Founder', price: 395, cap: 450, on: false, d: 'Both days, pitch arena access' }, { n: 'Investor', price: 1200, cap: 90, on: false, d: 'Includes investor roundtables' }, { n: 'Startup exhibitor', price: 850, cap: 80, on: false, d: 'Booth seat, per person' }, { n: 'Student', price: 95, cap: 60, on: false, d: 'Valid student ID required' }],
    promos: [{ code: 'ALUMNI20', off: 20, uses: 61 }, { code: 'HUB2026', off: 15, uses: 44 }],
    mail: { subject: 'Your Majlis Founders Summit ticket ({registration_id})', body: '<p>Hi <b>{first_name}</b>,</p><p>See you at Manarat Al Saadiyat on {event_dates}.</p><p>Your ticket ID is <b>{registration_id}</b>. After the summit, use it to unlock the recordings and slides.</p>', kicker: 'YOUR TICKET' },
    sent: [{ ago: 7 * 1440, aud: 'Checked in', n: 405, ch: 'EMAIL', subj: 'Recordings and slides are now available' }, { ago: 10 * 1440, aud: 'All attendees', n: 520, ch: 'EMAIL', subj: 'Tomorrow: parking, badges and the pitch arena' }],
    fields: [{ k: 'first', l: 'First name', type: 'Text', req: true, on: true, lock: true }, { k: 'last', l: 'Last name', type: 'Text', req: true, on: true, lock: true }, { k: 'email', l: 'Email', type: 'Email', req: true, on: true, lock: true }, { k: 'tk', l: 'Ticket', type: 'Ticket picker', req: true, on: true, lock: true }, { k: 'hosp', l: 'Company', type: 'Text', req: true, on: true }, { k: 'spec', l: 'Role', type: 'Dropdown', req: true, on: true, opts: ['Founder','Investor','Corporate innovation','Government','Service provider','Student'] }, { k: 'stage', l: 'Company stage', type: 'Dropdown', req: false, on: true, opts: ['Idea','Pre-seed','Seed','Series A or later','Not a start-up'] }, { k: 'mob', l: 'Mobile', type: 'Phone', req: false, on: true }, { k: 'li', l: 'LinkedIn profile', type: 'Text', req: false, on: false }],
    site: { dates: '15–16 September 2026', org: 'Majlis Founders', hero: 'Where the region’s founders, investors and operators meet.', venue: 'Manarat Al Saadiyat', addr: 'Saadiyat Cultural District, Abu Dhabi', phone: '+971 2 555 0199',
      pages: [{ key: 'about', n: 'About the summit', b: '<h2>Built for founders</h2><p>Two days of honest talks, a live pitch arena and meetings that matter.</p>' }, { key: 'tickets', n: 'Tickets & FAQs', b: '<h2>Tickets</h2><p>Founder, investor, exhibitor and student tickets.</p>' }, { key: 'past', n: 'Past editions', b: '<p>Second edition. 380 attendees in 2025.</p>' }] },
    raffle: { prize: 'Office hours with a keynote speaker', wins: [1188, 1333] },
    logs: [['Nabil Alhaj', 'turned on the after-event page', 7 * 1440], ['Nabil Alhaj', 'turned off ticket sales', 8 * 1440], ['Mariam Al-Zaabi', 'sent “Recordings and slides are now available” to 405 attendees', 7 * 1440]],
    after: { rec: true, slides: true, photos: true, survey: true, gate: true, msg: 'Thank you for joining us. Enter your ticket ID to watch the recordings and download the slides.', views: 1284 },
  },
  /* ---------- 4. concert, doors open tonight ---------- */
  {
    key: 'noct', type: 'concert', name: 'Nocturne Live: Oud & Electronica', short: 'NL', slug: 'nocturnelive', currency: 'AED', colour: '#6D28D9', timezone: 'Asia/Dubai',
    now: { day: 0, min: 21 * 60 + 5 }, todayIsDay: 0,
    sessions: [
      { id: 'g1', day: 0, start: 1140, end: 1439, n: 'Gate A · General admission', ch: 'General admission', cme: 0, loc: 'North plaza', cap: 2400 },
      { id: 'g2', day: 0, start: 1140, end: 1439, n: 'Gate B · Front standing', ch: 'Front standing', cme: 0, loc: 'East ramp', cap: 700 },
      { id: 'g3', day: 0, start: 1140, end: 1439, n: 'VIP lounge entrance', ch: 'VIP lounge', cme: 0, loc: 'Marina side', cap: 180 },
    ],
    gatesByTicket: { 'General admission': 'g1', 'Front standing': 'g2', 'VIP lounge': 'g3' },
    regs: {
      seed: 51, n: 1640, today: 84, show: 0.8, p: {},
      fixed: [['', 'Maha', 'Al-Ketbi'], ['', 'Daniel', 'Costa'], ['', 'Yousef', 'Haddad']],
      f1: (rnd) => wpick(rnd, [['General admission',70],['Front standing',23],['VIP lounge',7]]),
      f2: ['Abu Dhabi','Abu Dhabi','Abu Dhabi','Dubai','Dubai','Al Ain','Sharjah','Muscat','Doha','Riyadh'],
      dom: ['gmail.com', 'icloud.com', 'outlook.com', 'hotmail.com'],
      tk: (_rnd, f1) => f1,
    },
    people: [P('Rawiya Ensemble','Headliner','head',1,'A twelve-piece oud and strings collective from Baghdad and Beirut, playing new arrangements with live electronics.','22:30–23:45'),P('The Dune Signal','Support','',1,'Abu Dhabi duo blending field recordings from the desert with modular synths.','21:30–22:15'),P('Leila Oud Trio','Support','',2,'Oud, double bass and percussion, reimagining classic tarab for a standing crowd.','20:30–21:15'),P('DJ Sahar','Opening set','',1,'Resident DJ at a Dubai rooftop club, known for Arabic house and slow disco.','19:30–20:15')],
    evalQs: [...ratings(['Overall, how was the night?','Sound quality','Getting in: queues and security','Food and drink','Getting home'], [4.71,4.58,4.12,3.88,3.74], 1), ...checks('Next, I’d come to…', [['Another Nocturne night',512],['A daytime festival',233],['An acoustic, seated show',187],['A club night',142]]), { t: 'Best moment of the night?', type: 'text', req: false }, { t: 'Anything we should fix?', type: 'text', req: false }],
    evalResponses: 0,
    comments: [],
    cert: null,
    cme: { rule: 'checkin', pct: 75, needEval: false },
    qs: { reg: true, cert: false, maint: false },
    tickets: [{ n: 'General admission', price: 195, cap: 2400, on: true, d: 'Standing, main floor' }, { n: 'Front standing', price: 350, cap: 700, on: true, d: 'Closest to the stage' }, { n: 'VIP lounge', price: 750, cap: 180, on: true, d: 'Seated lounge, bar and fast-track entry' }],
    promos: [{ code: 'NOCTURNE15', off: 15, uses: 212 }, { code: 'BANDFRIENDS', off: 100, uses: 40 }],
    mail: { subject: 'Your Nocturne Live e-ticket ({registration_id})', body: '<p>Hi <b>{first_name}</b>,</p><p>Your ticket is confirmed. Doors open at 19:00 at The Waterfront Amphitheatre.</p><p>Show the code on this email at your gate. Ticket ID <b>{registration_id}</b>.</p>', kicker: 'YOUR E-TICKET' },
    sent: [{ ago: 545, aud: 'All ticket holders', n: 1556, ch: 'EMAIL', subj: 'Tonight: set times, gates and parking' }, { ago: 215, aud: 'All ticket holders', n: 1556, ch: 'SMS', subj: 'Doors open at 19:00. Have your e-ticket ready.' }],
    fields: [{ k: 'first', l: 'First name', type: 'Text', req: true, on: true, lock: true }, { k: 'last', l: 'Last name', type: 'Text', req: true, on: true, lock: true }, { k: 'email', l: 'Email', type: 'Email', req: true, on: true, lock: true }, { k: 'tk', l: 'Ticket', type: 'Ticket picker', req: true, on: true, lock: true }, { k: 'mob', l: 'Mobile', type: 'Phone', req: true, on: true }, { k: 'hosp', l: 'City', type: 'Dropdown', req: false, on: true, opts: ['Abu Dhabi','Dubai','Al Ain','Sharjah','Other'] }, { k: 'dob', l: 'Date of birth (18+ only)', type: 'Date', req: true, on: true }],
    site: { dates: 'Tuesday 22 September 2026 · Doors 19:00', org: 'Nocturne Nights', hero: 'One night of oud, strings and live electronics under the stars.', venue: 'The Waterfront Amphitheatre', addr: 'Corniche West, Abu Dhabi', phone: '+971 2 555 0110',
      pages: [{ key: 'about', n: 'About the night', b: '<h2>Oud meets electronica</h2><p>Four acts, one open-air stage.</p>' }, { key: 'faq', n: 'FAQ', b: '<h2>Good to know</h2><p>18+ only. Bags larger than A4 are not allowed. Pass-outs are allowed until 22:00.</p>' }] },
    raffle: { prize: 'Meet the band backstage', wins: [] },
    logs: [['Gate A team', 'scanned 214 guests in the last 15 minutes', 1], ['VIP host', 'checked in 11 VIP guests', 7], ['Nabil Alhaj', 'sent “Doors open at 19:00” by SMS', 215]],
    after: { rec: false, slides: false, photos: true, survey: true, gate: false, msg: 'Thank you for coming. Here are the photos from the night, and a two-minute survey.', views: 0 },
  },
];
