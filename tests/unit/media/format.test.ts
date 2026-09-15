import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

import { detectFormat, fitLongest } from '@/lib/media/format';

const FIXTURES = new URL('../../../fixtures/reference/', import.meta.url);

describe('fitLongest', () => {
  it('fitLongest(4032, 3024, 3000)', () => {
    const r = fitLongest(4032, 3024, 3000);
    expect(r.w).toBe(3000);
    expect(r.h).toBe(2250);
    expect(r.scale).toBeCloseTo(0.744048, 6);
  });

  it('fitLongest(1080, 1920, 3000)', () => {
    expect(fitLongest(1080, 1920, 3000)).toEqual({ w: 1080, h: 1920, scale: 1 });
  });

  it('fitLongest(3024, 4032, 480)', () => {
    const r = fitLongest(3024, 4032, 480);
    expect(r.w).toBe(360);
    expect(r.h).toBe(480);
    expect(r.scale).toBeCloseTo(0.119048, 6);
  });

  it('fitLongest(1200, 1600, 480)', () => {
    expect(fitLongest(1200, 1600, 480)).toEqual({ w: 360, h: 480, scale: 0.3 });
  });
});

describe('detectFormat', () => {
  it('detects jpeg from the first 16 bytes', () => {
    const bytes = new Uint8Array(16);
    bytes.set([0xff, 0xd8, 0xff]);
    expect(detectFormat(bytes)).toBe('jpeg');
  });

  it('detects png from the first 16 bytes', () => {
    const bytes = new Uint8Array(16);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectFormat(bytes)).toBe('png');
  });

  it('detects heic from the first 16 bytes (ftyp + heic brand)', () => {
    const bytes = new Uint8Array(16);
    // bytes 0..4 box size (arbitrary), 4..8 'ftyp', 8..12 'heic'
    bytes.set([0, 0, 0, 24, ...[...'ftyp'].map((c) => c.charCodeAt(0)), ...[...'heic'].map((c) => c.charCodeAt(0))]);
    expect(detectFormat(bytes)).toBe('heic');
  });

  it('detects fixtures/reference/tiny-sighting.heic as heic', async () => {
    const buf = await readFile(new URL('tiny-sighting.heic', FIXTURES));
    expect(detectFormat(new Uint8Array(buf))).toBe('heic');
  });

  it('returns null for random bytes', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    expect(detectFormat(bytes)).toBeNull();
  });
});
