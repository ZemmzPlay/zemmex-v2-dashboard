import { describe, expect, it } from 'vitest';
import { EVENT_TYPE_KEYS, eventType } from './event-types';
import { siteText } from './site-text';

const shape = (o: object): string[] =>
  Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? shape(v).map((x) => `${k}.${x}`) : [`${k}:${typeof v}`])).sort();

describe('siteText', () => {
  it('has an Arabic version of every English string, for every type', () => {
    for (const k of EVENT_TYPE_KEYS) {
      const en = siteText(eventType(k), 'en');
      const ar = siteText(eventType(k), 'ar');
      expect(shape(ar)).toEqual(shape(en));
      expect(ar.dir).toBe('rtl');
      // Nothing left in English by accident: the Arabic strings contain Arabic letters.
      for (const key of ['home', 'register', 'claimTitle', 'closed', 'total', 'certifyThat'] as const) expect(ar[key]).toMatch(/[؀-ۿ]/);
      expect(ar.err.checkFields).toMatch(/[؀-ۿ]/);
    }
  });

  it('translates standard labels but leaves the organiser’s own words alone', () => {
    const ar = siteText(eventType('medical'), 'ar');
    expect(ar.term('First name')).toBe('الاسم الأول');
    expect(ar.term('Speciality')).toBe('التخصص');
    expect(ar.term('Interventional cardiology')).toBe('Interventional cardiology');
  });
});
