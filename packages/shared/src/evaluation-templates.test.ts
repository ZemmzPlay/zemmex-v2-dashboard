import { describe, expect, it } from 'vitest';
import { EVENT_TYPE_KEYS, eventType } from './event-types';
import { evaluationTemplate, KIMS_RATINGS } from './evaluation-templates';

describe('evaluationTemplate', () => {
  it('uses the KIMS form for medical events', () => {
    const qs = evaluationTemplate(eventType('medical'));
    expect(qs.filter((q) => q.kind === 'RATING').map((q) => q.text)).toEqual(KIMS_RATINGS);
    expect(qs.some((q) => q.kind === 'CHECK' && q.group === 'This programme…')).toBe(true);
  });

  it('gives every type a form with a heading on each tick box and none required', () => {
    for (const k of EVENT_TYPE_KEYS) {
      const qs = evaluationTemplate(eventType(k));
      expect(qs.length).toBeGreaterThan(3);
      for (const q of qs.filter((x) => x.kind === 'CHECK')) {
        expect(q.group).not.toBe('');
        expect(q.required).toBe(false);
      }
      // Nouns come from the type: no medical words outside medical events.
      if (!eventType(k).credits) expect(qs.map((q) => q.text).join(' ')).not.toMatch(/delegate|faculty|CME/i);
    }
  });
});
