/**
 * Contrast is checked in the product, not assumed (docs/04, rules that are not
 * negotiable). Wherever a customer picks a colour we calculate the ratio,
 * switch button text between white and dark, and warn when a pair fails.
 */

export const DARK_TEXT = '#14142B';
export const LIGHT_TEXT = '#FFFFFF';

export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

export function isHexColour(hex: string): boolean {
  return parseHex(hex) !== null;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** White or dark text, whichever reads better on `bg`. */
export function textOn(bg: string): string {
  return contrastRatio(bg, LIGHT_TEXT) >= contrastRatio(bg, DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT;
}

export type ContrastLevel = 'AAA' | 'AA' | 'AA large' | 'Fails';

export function contrastLevel(ratio: number): ContrastLevel {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA large';
  return 'Fails';
}

function toHex(rgb: number[]): string {
  return '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Mix `hex` towards black by `amount` (0–1). */
export function darken(hex: string, amount: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  return toHex(rgb.map((v) => v * (1 - amount)));
}

/**
 * Darken (or lighten on dark backgrounds) `fg` until it reaches `target`
 * contrast against `bg`. Used for links drawn in a customer's brand colour
 * and by the "Fix" action in colour pickers.
 */
export function fixContrast(fg: string, bg: string, target = 4.5): string {
  const rgb = parseHex(fg);
  if (!rgb || contrastRatio(fg, bg) >= target) return fg;
  const towardsWhite = luminance(bg) < 0.2;
  for (let step = 1; step <= 20; step++) {
    const t = step / 20;
    const next = toHex(rgb.map((v) => (towardsWhite ? v + (255 - v) * t : v * (1 - t))));
    if (contrastRatio(next, bg) >= target) return next;
  }
  return towardsWhite ? LIGHT_TEXT : DARK_TEXT;
}
