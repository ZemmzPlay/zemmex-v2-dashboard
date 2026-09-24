import { describe, expect, it } from 'vitest';
import { code39Bars } from './code39';
import { contrastRatio, fixContrast, textOn } from './contrast';
import { EVENT_TYPE_KEYS, EVENT_TYPES, lowerFirst } from './event-types';
import { applyMergeTags, stripHtml } from './merge-tags';
import { formatMoney, ticketFee, toMinor } from './money';
import { sanitizeRichText } from './sanitize';
import { formatDateRange, formatTime, zonedTime } from './time';

describe('ticket fee (docs/05-pricing.md)', () => {
  it('is free for free tickets', () => expect(ticketFee(0, 'AED')).toBe(0));
  it('is 2.5% + AED 2', () => expect(ticketFee(toMinor(100, 'AED'), 'AED')).toBe(toMinor(4.5, 'AED')));
  it('is capped at AED 25', () => expect(ticketFee(toMinor(750, 'AED'), 'AED')).toBe(toMinor(20.75, 'AED')));
  it('stops at the cap for premium tickets', () => expect(ticketFee(toMinor(2000, 'AED'), 'AED')).toBe(toMinor(25, 'AED')));
  it('uses three decimals for KWD', () => expect(toMinor(50, 'KWD')).toBe(50000));
});

describe('formatMoney', () => {
  it('writes AED 7,500', () => expect(formatMoney(750000, 'AED')).toBe('AED 7,500'));
  it('keeps fils', () => expect(formatMoney(20188, 'AED')).toBe('AED 201.88'));
  it('says Free when asked', () => expect(formatMoney(0, 'AED', { freeLabel: true })).toBe('Free'));
});

describe('contrast', () => {
  it('computes WCAG ratios', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 1);
  });
  it('picks readable button text', () => {
    expect(textOn('#B3122E')).toBe('#FFFFFF');
    expect(textOn('#F5C451')).toBe('#14142B');
  });
  it('fixes a colour until it passes AA', () => {
    const fixed = fixContrast('#F5C451', '#FFFFFF');
    expect(contrastRatio(fixed, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(fixContrast('#7C3AED', '#0B0714')).not.toBe('#7C3AED');
  });
});

describe('sanitizeRichText', () => {
  const vectors: [string, (out: string) => void][] = [
    ['<script>alert(1)</script><p>ok</p>', (o) => expect(o).toBe('<p>ok</p>')],
    ['<img src=x onerror=alert(1)>', (o) => expect(o).not.toContain('<img')],
    ['<a href="javascript:alert(1)">x</a>', (o) => expect(o).toBe('<a rel="noopener noreferrer">x</a>')],
    ['<a href="  JaVaScRiPt:alert(1)">x</a>', (o) => expect(o).not.toContain('javascript')],
    ['<p onclick="alert(1)" style="x">hi</p>', (o) => expect(o).toBe('<p>hi</p>')],
    ['<svg><script>alert(1)</script></svg>', (o) => expect(o).not.toMatch(/<svg|<script/i)],
    ['<iframe src="https://evil"></iframe>', (o) => expect(o).toBe('')],
    ['<b>unclosed', (o) => expect(o).toBe('<b>unclosed</b>')],
    ['a < b > c', (o) => expect(o).toBe('a &lt; b &gt; c')],
    ['<a href="https://example.com/?a=1&b=2">x</a>', (o) => expect(o).toContain('href="https://example.com/?a=1&amp;b=2"')],
    ['<p>x<style>body{}</style></p>', (o) => expect(o).toBe('<p>x</p>')],
  ];
  for (const [input, check] of vectors) it(`neutralises ${input.slice(0, 40)}`, () => check(sanitizeRichText(input)));
});

describe('merge tags', () => {
  it('escapes values in HTML', () => {
    expect(applyMergeTags('<p>Hi {first_name}</p>', { first_name: '<script>' }, { html: true })).toBe('<p>Hi &lt;script&gt;</p>');
  });
  it('leaves unknown tags visible so the organiser sees the mistake', () => {
    expect(applyMergeTags('ID {registraton_id}', { registration_id: 1001 }, { html: false })).toBe('ID {registraton_id}');
  });
  it('strips HTML for plain text', () => expect(stripHtml('<p>Hi <b>Sara</b></p><p>Bye</p>')).toBe('Hi Sara\nBye'));
});

describe('time', () => {
  it('converts wall-clock time in a Gulf timezone', () => {
    expect(zonedTime('2026-09-22', '13:40', 'Asia/Kuwait').toISOString()).toBe('2026-09-22T10:40:00.000Z');
    expect(zonedTime('2026-09-22', '19:00', 'Asia/Dubai').toISOString()).toBe('2026-09-22T15:00:00.000Z');
  });
  it('formats 24-hour times in the event timezone', () => expect(formatTime(new Date('2026-09-22T10:40:00Z'), 'Asia/Kuwait')).toBe('13:40'));
  it('writes date ranges the house way', () => {
    const d = (s: string) => new Date(`${s}T00:00:00Z`);
    expect(formatDateRange(d('2026-09-22'), d('2026-09-23'), 'UTC')).toBe('22–23 September 2026');
    expect(formatDateRange(d('2026-09-30'), d('2026-10-01'), 'UTC')).toBe('30 September – 1 October 2026');
    expect(formatDateRange(d('2026-09-22'), d('2026-09-22'), 'UTC')).toBe('22 September 2026');
  });
});

describe('event types', () => {
  it('every type defines the vocabulary the views rely on', () => {
    for (const k of EVENT_TYPE_KEYS) {
      const t = EVENT_TYPES[k];
      for (const field of ['guest', 'guests', 'regs', 'people', 'unit', 'units', 'ckNav', 'certNav', 'idName', 'inLbl', 'outLbl'] as const) {
        expect(t[field], `${k}.${field}`).toBeTruthy();
      }
    }
  });
  it('only medical has CME', () => {
    expect(EVENT_TYPE_KEYS.filter((k) => EVENT_TYPES[k].credits)).toEqual(['medical']);
  });
  it('lowerFirst keeps acronyms', () => expect(lowerFirst('Ticket ID')).toBe('ticket ID'));
});

describe('Code 39', () => {
  it('encodes digits with start and stop characters', () => {
    const { bars, width } = code39Bars('1001');
    expect(bars.length).toBe(6 * 5); // 6 characters incl. * *, 5 bars each
    expect(width).toBeGreaterThan(0);
  });
  it('rejects characters it cannot encode', () => expect(() => code39Bars('a_b')).toThrow());
});
