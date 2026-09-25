/**
 * Starting question sets for the evaluation or feedback form, by type.
 * Medical events use the Kuwait Institute for Medical Specialization (KIMS)
 * standard form; the others get a short survey the organiser can edit.
 */
import type { EventTypeDef } from './event-types';

export type TemplateQuestionKind = 'RATING' | 'CHECK' | 'CHOICE' | 'TEXT';

export interface TemplateQuestion {
  text: string;
  kind: TemplateQuestionKind;
  group: string;
  required: boolean;
}

export const KIMS_RATINGS = [
  'Provided objectives at the start so I knew what I was expected to learn',
  'Presented the content in a coherent, understandable way',
  'Gave an adequate amount of detail, neither superficial nor excessive',
  'Demonstrated a thorough knowledge of the subject',
  'Stimulated my interest in the subject',
  'Used audiovisuals that complemented the presentation',
  'Provided handouts that highlighted the important concepts',
  'Presented content appropriate to my level of knowledge',
  'Used an effective presentation style',
  'Invited and encouraged audience participation',
  'Used the time allotted efficiently',
  'Used language that was easy to understand',
];

export const KIMS_STATEMENTS = [
  'Met the stated objectives',
  'Will change how I practise',
  'Won’t change how I practise, but confirmed I’m doing the right thing',
  'Will be relevant to my practice',
  'Made me wish I hadn’t attended',
  'Satisfied my expectations',
];

const rating = (text: string, required = false): TemplateQuestion => ({ text, kind: 'RATING', group: '', required });
const check = (group: string) => (text: string): TemplateQuestion => ({ text, kind: 'CHECK', group, required: false });
const open = (text: string): TemplateQuestion => ({ text, kind: 'TEXT', group: '', required: false });

export function evaluationTemplate(t: EventTypeDef): TemplateQuestion[] {
  if (t.credits) {
    return [
      ...KIMS_RATINGS.map((q) => rating(q, true)),
      ...KIMS_STATEMENTS.map(check('This programme…')),
      { text: 'The facilities for presentations were', kind: 'CHOICE', group: '', required: true },
      { text: 'The illustrative material was', kind: 'CHOICE', group: '', required: true },
      open('Other comments'),
      open('Suggestions for future meetings, and would you recommend this programme?'),
    ];
  }
  if (t.gates) {
    return [
      rating('Overall, how was the night?', true),
      rating('Sound quality'),
      rating('Getting in: queues and security'),
      rating('Food and drink'),
      open('Best moment of the night?'),
      open('Anything we should fix?'),
    ];
  }
  return [
    rating(`Overall, how would you rate the ${t.basedOn === 'summit' ? 'summit' : 'event'}?`, true),
    rating(`The quality of the ${t.people.toLowerCase()}`, true),
    rating('The venue and facilities'),
    rating('Time to meet other people'),
    rating('Value for money'),
    open(`Which ${t.unit.toLowerCase()} stood out, and why?`),
    open('What should we change next year?'),
  ];
}
