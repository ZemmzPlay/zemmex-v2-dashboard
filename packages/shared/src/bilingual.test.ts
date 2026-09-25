import { describe, expect, it } from 'vitest';
import { localise, mergeArabic, optionLabels } from './bilingual';

const form = (o: Record<string, string>) => ({ get: (k: string) => (k in o ? o[k] : null) });

describe('organiser text in Arabic', () => {
  const row = { name: 'Gulf Heart Summit', bio: 'English bio', ar: { name: 'قمة الخليج', bio: '  ' } };
  it('uses the Arabic where written and falls back to the English', () => {
    expect(localise(row, 'ar')).toMatchObject({ name: 'قمة الخليج', bio: 'English bio' });
    expect(localise(row, 'en')).toBe(row);
    expect(localise({ name: 'x', ar: null }, 'ar').name).toBe('x');
  });
  it('shows Arabic option labels but keeps English values', () => {
    const f = { options: ['Cardiology', 'Surgery'], ar: { options: ['القلب', ''] } };
    expect(optionLabels(f, 'ar')).toEqual(['القلب', 'Surgery']);
    expect(optionLabels(f, 'en')).toEqual(['Cardiology', 'Surgery']);
  });
  it('only changes the fields a form sent, and clears emptied ones', () => {
    const before = { name: 'قديم', bio: 'سيرة' };
    expect(mergeArabic(before, form({ ar_name: 'جديد' }), ['name', 'bio'])).toEqual({ name: 'جديد', bio: 'سيرة' });
    expect(mergeArabic(before, form({ ar_bio: '' }), ['name', 'bio'])).toEqual({ name: 'قديم' });
    expect(mergeArabic(before, form({}), ['name', 'bio'])).toEqual(before);
  });
});
