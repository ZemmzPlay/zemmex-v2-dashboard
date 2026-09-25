import { eventType, type EventTypeKey } from '@zemmz/shared';

/** The eleven onboarding steps; three of them change with the answers. */
export function onboardingSteps(type?: string, paid = true) {
  const after = type ? afterStepName(type as EventTypeKey) : 'After the event';
  return ['Your account', 'Verify email', 'Organisation', 'Type of event', 'Your event', paid ? 'Tickets' : 'Registration', after, 'Form fields', 'Brand', 'Team', 'Plan'];
}

export function afterStepName(type: EventTypeKey) {
  const t = eventType(type);
  if (t.credits) return 'CME & certificates';
  if (t.gates) return 'Gates & after-show';
  if (t.cert === 'none') return 'After the event';
  return 'Certificates';
}

export interface FieldOption {
  key: string;
  label: string;
  /** Built-in keys live on Registration (title, spec, hosp, mob); others are custom answers. */
  builtIn: boolean;
  kind: 'TEXT' | 'DROPDOWN' | 'DATE' | 'PHONE';
  options?: string[];
  on: boolean;
}

/** Suggested form fields by type (live-marketing.html, defaultFields). Name and email are always included. */
export function fieldOptions(type: EventTypeKey): FieldOption[] {
  const t = eventType(type);
  const b = (key: string, label: string, on: boolean, kind: FieldOption['kind'] = 'TEXT'): FieldOption => ({ key, label, builtIn: true, kind, on });
  const c = (key: string, label: string, on: boolean, kind: FieldOption['kind'] = 'TEXT', options?: string[]): FieldOption => ({ key, label, builtIn: false, kind, options, on });
  switch (t.basedOn) {
    case 'medical':
      return [b('title', 'Title (Dr, Prof, Mr…)', true, 'DROPDOWN'), b('spec', t.f1, true), b('hosp', t.f2, true), b('mob', 'Mobile number', true, 'PHONE'), c('licence', 'Medical licence number', false), c('dietary', 'Dietary requirements', false)];
    case 'concert':
      return [b('mob', 'Mobile number', true, 'PHONE'), b('hosp', t.f2, true), c('date_of_birth', 'Date of birth (for 18+ events)', true, 'DATE'), c('gender', 'Gender', false, 'DROPDOWN', ['Female', 'Male', 'Prefer not to say'])];
    case 'summit':
      return [b('hosp', t.f2, true), b('spec', t.f1, true), c('company_stage', 'Company stage', false, 'DROPDOWN', ['Idea', 'Pre-seed', 'Seed', 'Series A', 'Series B or later']), b('mob', 'Mobile number', true, 'PHONE'), c('linkedin', 'LinkedIn profile', false)];
    default:
      return [b('spec', t.f1, true), b('hosp', t.f2, true), c('job_title', 'Job title', true), b('mob', 'Mobile number', false, 'PHONE'), c('dietary', 'Dietary requirements', false), c('accessibility', 'Accessibility needs', true)];
  }
}

/** Suggested ticket types and prices in AED (live-marketing.html, defaultTickets). */
export function suggestedTickets(type: EventTypeKey): { name: string; price: number }[] {
  const m: Record<EventTypeKey, [string, number][]> = {
    medical: [['Healthcare professional', 0], ['Industry representative', 50]],
    concert: [['General admission', 195], ['Front standing', 350], ['VIP lounge', 750]],
    summit: [['Founder', 395], ['Investor', 1200], ['Student', 95]],
    exhibition: [['Visitor', 0], ['Exhibitor pass', 850]],
    gala: [['Guest', 450], ['Table of 10', 4200]],
    workshop: [['Seat', 350]],
    conference: [['Standard', 650], ['Student', 150]],
  };
  return m[type].map(([name, price]) => ({ name, price }));
}

export const ACCREDITORS: [string, string][] = [
  ['Kuwait Institute for Medical Specialization (KIMS)', 'Kuwait Institute for Medical Specialization (KIMS)'],
  ['Saudi Commission for Health Specialties', 'Saudi Commission for Health Specialties (SCFHS)'],
  ['Dubai Health Authority', 'Dubai Health Authority (DHA)'],
  ['Department of Health Abu Dhabi', 'Department of Health Abu Dhabi (DOH)'],
  ['', 'Another accrediting body'],
];

export const CURRENCY_FOR_COUNTRY: Record<string, string> = { Kuwait: 'KWD', 'Saudi Arabia': 'SAR', Qatar: 'QAR', Bahrain: 'BHD', Oman: 'OMR' };
export const TZ_FOR_COUNTRY: Record<string, string> = { Kuwait: 'Asia/Kuwait', 'Saudi Arabia': 'Asia/Riyadh', Qatar: 'Asia/Qatar', Bahrain: 'Asia/Bahrain', Oman: 'Asia/Muscat', Egypt: 'Africa/Cairo', Jordan: 'Asia/Amman' };

export const ORG_KINDS = ['Event company or agency', 'Promoter', 'Company', 'Association or society', 'University', 'Hospital or medical body', 'Venue', 'Government'];
export const ORG_COUNTRIES = ['United Arab Emirates', 'Saudi Arabia', 'Kuwait', 'Qatar', 'Bahrain', 'Oman', 'Egypt', 'Jordan', 'Other'];

/** A unique organisation slug from its name. */
export async function orgSlug(name: string, taken: (slug: string) => Promise<boolean>) {
  const stem = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'organisation';
  let slug = stem;
  for (let n = 2; await taken(slug); n++) slug = `${stem}-${n}`;
  return slug;
}
