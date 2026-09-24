/**
 * Code 39 barcodes, drawn as SVG rectangles. Readable by any handheld scanner
 * in keyboard-wedge mode, which types the ID into the check-in scan field.
 */

// Each pattern is 9 elements (bar, space, bar, …); 'w' wide, 'n' narrow.
const PATTERNS: Record<string, string> = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn', '9': 'nnwwnnwnn', A: 'wnnnnwnnw', B: 'nnwnnwnnw',
  C: 'wnwnnwnnn', D: 'nnnnwwnnw', E: 'wnnnwwnnn', F: 'nnwnwwnnn',
  G: 'nnnnnwwnw', H: 'wnnnnwwnn', I: 'nnwnnwwnn', J: 'nnnnwwwnn',
  K: 'wnnnnnnww', L: 'nnwnnnnww', M: 'wnwnnnnwn', N: 'nnnnwnnww',
  O: 'wnnnwnnwn', P: 'nnwnwnnwn', Q: 'nnnnnnwww', R: 'wnnnnnwwn',
  S: 'nnwnnnwwn', T: 'nnnnwnwwn', U: 'wwnnnnnnw', V: 'nwwnnnnnw',
  W: 'wwwnnnnnn', X: 'nwnnwnnnw', Y: 'wwnnwnnnn', Z: 'nwwnwnnnn',
  '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '*': 'nwnnwnwnn',
};

export interface Bar {
  x: number;
  w: number;
}

/** Returns bars in narrow-module units, and the total width. */
export function code39Bars(value: string, wide = 2.5): { bars: Bar[]; width: number } {
  const text = `*${value.toUpperCase()}*`;
  const bars: Bar[] = [];
  let x = 0;
  for (const ch of text) {
    const p = PATTERNS[ch];
    if (!p) throw new Error(`Code 39 cannot encode "${ch}"`);
    for (let i = 0; i < 9; i++) {
      const w = p[i] === 'w' ? wide : 1;
      if (i % 2 === 0) bars.push({ x, w });
      x += w;
    }
    x += 1; // inter-character gap
  }
  return { bars, width: x - 1 };
}
