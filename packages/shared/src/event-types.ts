/**
 * The event type model — the product's core abstraction.
 *
 * An event's type decides two things: the words the product uses and which
 * modules exist. Views must take nouns from here rather than hard-coding
 * "delegate" or "session". Adding a type means adding an entry below; nothing
 * else should need editing.
 *
 * Ported from TYPES in the prototype (src/live-dashboard/N3a.js).
 */

export const EVENT_TYPE_KEYS = [
  'conference',
  'medical',
  'summit',
  'concert',
  'workshop',
  'exhibition',
  'gala',
] as const;

export type EventTypeKey = (typeof EVENT_TYPE_KEYS)[number];

/** What an event owes attendees afterwards. */
export type CertMode = 'cme' | 'attendance' | 'none';

export type AvatarShape = 'hex' | 'square' | 'circle' | 'round';

export interface EventTypeDef {
  key: EventTypeKey;
  label: string;
  /** Types without their own sample data borrow another type's setup. */
  basedOn: EventTypeKey;
  guest: string;
  guests: string;
  regs: string;
  one: string;
  people: string;
  person: string;
  unit: string;
  units: string;
  ckNav: string;
  chair: string;
  /** CME points exist. True only for medical. */
  credits: boolean;
  cert: CertMode;
  certNav: string;
  evalNav: string;
  openLbl: string;
  openDesc: string;
  openForm: string;
  afterLbl: string;
  afterDesc: string;
  afterForm: string;
  idName: string;
  /** Registrants have titles (Dr, Prof). */
  titles: boolean;
  f1: string;
  f1s: string;
  f2: string;
  cats: string[];
  catSfx: string;
  highlights: [string, string][];
  inLbl: string;
  outLbl: string;
  roomLbl: string;
  raffle: string;
  shape: AvatarShape;
  badge: string;
  role: string;
  register: string;
  /** Scans are gates: tickets are tied to one gate, pass-outs allowed. */
  gates: boolean;
}

const medical: EventTypeDef = {
  key: 'medical', label: 'Medical conference', basedOn: 'medical',
  guest: 'Delegate', guests: 'delegates', regs: 'Registrations', one: 'registration',
  people: 'Faculty', person: 'faculty member', unit: 'Session', units: 'sessions',
  ckNav: 'Schedule & check-in', chair: 'Co-chairs', credits: true, cert: 'cme',
  certNav: 'Certificates & CME', evalNav: 'Evaluation', openLbl: 'Registration',
  openDesc: 'Visitors can register on the homepage', openForm: 'Registration',
  afterLbl: 'Certificate issuing', afterDesc: 'Attendees claim certificates with their ID',
  afterForm: 'Certificate', idName: 'Registration ID', titles: true,
  f1: 'Speciality', f1s: 'specialities', f2: 'Hospital / centre',
  cats: ['International', 'Regional', 'Local'], catSfx: ' faculty',
  highlights: [['dir', 'Meeting director'], ['co', 'Meeting co-director']],
  inLbl: 'Checking in', outLbl: 'Checking out', roomLbl: 'In the room now',
  raffle: 'Raffle draw', shape: 'hex', badge: 'badge', role: 'DELEGATE',
  register: 'Register someone', gates: false,
};

const conference: EventTypeDef = {
  key: 'conference', label: 'Conference', basedOn: 'conference',
  guest: 'Attendee', guests: 'attendees', regs: 'Attendees', one: 'attendee',
  people: 'Speakers', person: 'speaker', unit: 'Session', units: 'sessions',
  ckNav: 'Agenda & check-in', chair: 'With', credits: false, cert: 'attendance',
  certNav: 'Certificates', evalNav: 'Feedback', openLbl: 'Ticket sales',
  openDesc: 'Visitors can buy tickets on the homepage', openForm: 'Tickets',
  afterLbl: 'Certificate issuing', afterDesc: 'Attendees download a certificate of attendance',
  afterForm: 'Certificate', idName: 'Ticket ID', titles: false,
  f1: 'Discipline', f1s: 'disciplines', f2: 'Studio / company',
  cats: ['Keynote', 'Speaker', 'Workshop lead'], catSfx: '',
  highlights: [['host', 'Host'], ['key', 'Headline keynote']],
  inLbl: 'Checking in', outLbl: 'Checking out', roomLbl: 'In the room now',
  raffle: 'Raffle draw', shape: 'square', badge: 'badge', role: 'ATTENDEE',
  register: 'Add attendee', gates: false,
};

const summit: EventTypeDef = {
  key: 'summit', label: 'Summit or business event', basedOn: 'summit',
  guest: 'Attendee', guests: 'attendees', regs: 'Attendees', one: 'attendee',
  people: 'Speakers', person: 'speaker', unit: 'Session', units: 'sessions',
  ckNav: 'Agenda & check-in', chair: 'Speakers', credits: false, cert: 'none',
  certNav: 'After-event page', evalNav: 'Feedback', openLbl: 'Ticket sales',
  openDesc: 'Visitors can buy tickets on the homepage', openForm: 'Tickets',
  afterLbl: 'After-event page', afterDesc: 'Attendees unlock recordings and slides with their ticket ID',
  afterForm: 'Recordings', idName: 'Ticket ID', titles: false,
  f1: 'Role', f1s: 'roles', f2: 'Company',
  cats: ['Keynote', 'Panellist', 'Pitch judge'], catSfx: '',
  highlights: [['host', 'Host'], ['key', 'Keynote']],
  inLbl: 'Checking in', outLbl: 'Checking out', roomLbl: 'In the room now',
  raffle: 'Raffle draw', shape: 'circle', badge: 'badge', role: 'ATTENDEE',
  register: 'Add attendee', gates: false,
};

const concert: EventTypeDef = {
  key: 'concert', label: 'Concert or festival', basedOn: 'concert',
  guest: 'Guest', guests: 'guests', regs: 'Ticket holders', one: 'ticket',
  people: 'Line-up', person: 'artist', unit: 'Entrance', units: 'entrances',
  ckNav: 'Entry & gates', chair: 'Accepts', credits: false, cert: 'none',
  certNav: 'After-show page', evalNav: 'Feedback', openLbl: 'Ticket sales',
  openDesc: 'Visitors can buy tickets on the homepage', openForm: 'Tickets',
  afterLbl: 'After-show page', afterDesc: 'Homepage shows photos and the post-show survey',
  afterForm: 'Photos & survey', idName: 'Ticket ID', titles: false,
  f1: 'Ticket', f1s: 'ticket types', f2: 'City',
  cats: ['Headliner', 'Support', 'Opening set'], catSfx: '',
  highlights: [['head', 'Headliner']],
  inLbl: 'Entering', outLbl: 'Leaving', roomLbl: 'Inside now',
  raffle: 'Giveaway draw', shape: 'round', badge: 'e-ticket', role: '',
  register: 'Issue a ticket', gates: true,
};

/* The last three borrow the closest sample configuration (docs/01, event types). */
const workshop: EventTypeDef = {
  ...conference, key: 'workshop', label: 'Workshop or training', basedOn: 'conference',
  people: 'Trainers', person: 'trainer', cats: ['Lead trainer', 'Trainer', 'Assistant'],
  afterDesc: 'Attendees download a certificate of completion',
};

const exhibition: EventTypeDef = {
  ...conference, key: 'exhibition', label: 'Exhibition or trade show', basedOn: 'conference',
  guest: 'Visitor', guests: 'visitors', regs: 'Visitors', one: 'visitor',
  people: 'Exhibitors', person: 'exhibitor', unit: 'Entrance', units: 'entrances',
  ckNav: 'Entry & halls', cert: 'none', certNav: 'Visitor reports',
  cats: ['Hall 1', 'Hall 2', 'Outdoor'], register: 'Add visitor',
};

const gala: EventTypeDef = {
  ...summit, key: 'gala', label: 'Gala, launch or party', basedOn: 'summit',
  guest: 'Guest', guests: 'guests', regs: 'Guests', one: 'guest',
  people: 'Hosts', person: 'host', unit: 'Entrance', units: 'entrances',
  ckNav: 'Entry & guest list', certNav: 'After-event page',
  afterDesc: 'Guests see photos and a thank-you note', afterForm: 'Photos',
  cats: ['Host', 'Performer', 'Guest of honour'], register: 'Add guest',
};

export const EVENT_TYPES: Record<EventTypeKey, EventTypeDef> = {
  conference, medical, summit, concert, workshop, exhibition, gala,
};

export function eventType(key: string): EventTypeDef {
  const t = EVENT_TYPES[key as EventTypeKey];
  if (!t) throw new Error(`Unknown event type: ${key}`);
  return t;
}

export function isEventTypeKey(key: string): key is EventTypeKey {
  return (EVENT_TYPE_KEYS as readonly string[]).includes(key);
}

/** Lowercases the first letter only, so "Ticket ID" reads "ticket ID" mid-sentence. */
export function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
