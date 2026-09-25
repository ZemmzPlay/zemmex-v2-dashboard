import { describe, expect, it } from 'vitest';
import { sniff } from './storage';

const bytes = (...b: number[]) => new Uint8Array([...b, ...Array(16).fill(0)]);

describe('sniff', () => {
  it('recognises images and PDFs by their bytes', () => {
    expect(sniff(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.type).toBe('image/png');
    expect(sniff(bytes(0xff, 0xd8, 0xff, 0xe0))?.type).toBe('image/jpeg');
    expect(sniff(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))?.type).toBe('image/webp');
    expect(sniff(new TextEncoder().encode('%PDF-1.7\n'))?.kind).toBe('pdf');
  });

  it('refuses anything else, whatever it is called', () => {
    expect(sniff(new TextEncoder().encode('<svg onload=alert(1)></svg>'))).toBeNull();
    expect(sniff(new TextEncoder().encode('<!doctype html><script>'))).toBeNull();
    expect(sniff(new Uint8Array(4))).toBeNull();
  });
});

describe('video sniffing', () => {
  const bytes = (...xs: (number | string)[]) => new Uint8Array(xs.flatMap((x) => (typeof x === 'string' ? [...x].map((c) => c.charCodeAt(0)) : [x])));
  it('recognises MP4, QuickTime and WebM by their bytes', () => {
    expect(sniff(bytes(0, 0, 0, 0x18, 'ftypisom'))?.type).toBe('video/mp4');
    expect(sniff(bytes(0, 0, 0, 0x14, 'ftypqt  '))?.type).toBe('video/quicktime');
    expect(sniff(bytes(0x1a, 0x45, 0xdf, 0xa3, 0, 0))?.type).toBe('video/webm');
    expect(sniff(bytes('<html>video</html>'))).toBeNull();
  });
});
