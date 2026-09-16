import { describe, expect, it } from 'vitest';

import { estimateBrightnessValue, suggestLighting } from '@/lib/media/lighting';
import type { ImageStats } from '@/lib/domain/photo';

function warmStats(): ImageStats {
  return { meanLuma: 100, brightMeanR: 250, brightMeanG: 200, brightMeanB: 150 }; // 250/150 = 1.667 > 1.15
}

function neutralStats(): ImageStats {
  return { meanLuma: 100, brightMeanR: 150, brightMeanG: 150, brightMeanB: 150 }; // ratio 1
}

describe('estimateBrightnessValue', () => {
  it('returns null when any input is null', () => {
    expect(estimateBrightnessValue({ fNumber: null, exposureTimeSec: 0.01, iso: 100 })).toBeNull();
    expect(estimateBrightnessValue({ fNumber: 2, exposureTimeSec: null, iso: 100 })).toBeNull();
    expect(estimateBrightnessValue({ fNumber: 2, exposureTimeSec: 0.01, iso: null })).toBeNull();
  });

  it('estimateBrightnessValue({ fNumber: 2.2, exposureTimeSec: 0.010101010101010102, iso: 64 })', () => {
    const bv = estimateBrightnessValue({ fNumber: 2.2, exposureTimeSec: 0.010101010101010102, iso: 64 });
    expect(bv).not.toBeNull();
    expect(bv as number).toBeCloseTo(4.5482, 3);
  });
});

describe('suggestLighting', () => {
  it('bv 5.5687... flash false, hour 19 (IMG_5057) -> daylight 0.9', () => {
    const r = suggestLighting({ bv: 5.568700362668135, flashFired: false, localHour: 19, stats: null });
    expect(r.label).toBe('daylight');
    expect(r.confidence).toBe(0.9);
  });

  it('bv 9.71442... flash false, hour 16 (IMG_5132) -> daylight 0.9', () => {
    const r = suggestLighting({ bv: 9.714420456927268, flashFired: false, localHour: 16, stats: null });
    expect(r.label).toBe('daylight');
    expect(r.confidence).toBe(0.9);
  });

  it('bv 1.2, hour 20, warm -> artificial 0.6', () => {
    const r = suggestLighting({ bv: 1.2, flashFired: false, localHour: 20, stats: warmStats() });
    expect(r.label).toBe('artificial');
    expect(r.confidence).toBe(0.6);
    expect(r.reasons).toEqual(['dim', 'warm-cast']);
  });

  it('bv -2.5, hour 23, not warm -> night 0.6', () => {
    const r = suggestLighting({ bv: -2.5, flashFired: false, localHour: 23, stats: neutralStats() });
    expect(r.label).toBe('night');
    expect(r.confidence).toBe(0.6);
    expect(r.reasons).toEqual(['dark']);
  });

  it('bv 6, hour 23 -> mixed 0.4 (bright + night-hour)', () => {
    const r = suggestLighting({ bv: 6, flashFired: false, localHour: 23, stats: null });
    expect(r.label).toBe('mixed');
    expect(r.confidence).toBe(0.4);
    expect(r.reasons).toEqual(['bright', 'night-hour']);
  });

  it('flash true, bv 8 -> artificial 0.7', () => {
    const r = suggestLighting({ bv: 8, flashFired: true, localHour: 12, stats: null });
    expect(r.label).toBe('artificial');
    expect(r.confidence).toBe(0.7);
    expect(r.reasons).toEqual(['flash']);
  });

  it('bv 2, hour 13, not warm -> mixed 0.4', () => {
    const r = suggestLighting({ bv: 2, flashFired: false, localHour: 13, stats: neutralStats() });
    expect(r.label).toBe('mixed');
    expect(r.confidence).toBe(0.4);
    expect(r.reasons).toEqual(['dim']);
  });

  it('bv null, hour 14, not warm -> daylight 0.5', () => {
    const r = suggestLighting({ bv: null, flashFired: null, localHour: 14, stats: neutralStats() });
    expect(r.label).toBe('daylight');
    expect(r.confidence).toBe(0.5);
    expect(r.reasons).toEqual(['day-hour']);
  });

  it('bv null, hour 22, warm -> artificial 0.5', () => {
    const r = suggestLighting({ bv: null, flashFired: null, localHour: 22, stats: warmStats() });
    expect(r.label).toBe('artificial');
    expect(r.confidence).toBe(0.5);
    expect(r.reasons).toEqual(['night-hour', 'warm-cast']);
  });

  it('bv null, hour 19, not warm -> mixed 0.3 (twilight-hour)', () => {
    const r = suggestLighting({ bv: null, flashFired: null, localHour: 19, stats: neutralStats() });
    expect(r.label).toBe('mixed');
    expect(r.confidence).toBe(0.3);
    expect(r.reasons).toEqual(['twilight-hour']);
  });

  it('bv null, hour null, stats null -> unknown 0 (no-signals)', () => {
    const r = suggestLighting({ bv: null, flashFired: null, localHour: null, stats: null });
    expect(r.label).toBe('unknown');
    expect(r.confidence).toBe(0);
    expect(r.reasons).toEqual(['no-signals']);
  });

  it('bv null, hour null, warm stats -> artificial 0.4 (warm-cast)', () => {
    const r = suggestLighting({ bv: null, flashFired: null, localHour: null, stats: warmStats() });
    expect(r.label).toBe('artificial');
    expect(r.confidence).toBe(0.4);
    expect(r.reasons).toEqual(['warm-cast']);
  });

  it('bv null, hour null, not warm stats -> unknown 0 (no-exposure)', () => {
    const r = suggestLighting({ bv: null, flashFired: null, localHour: null, stats: neutralStats() });
    expect(r.label).toBe('unknown');
    expect(r.confidence).toBe(0);
    expect(r.reasons).toEqual(['no-exposure']);
  });

  it('bv null, day hour, warm -> mixed 0.3 (day-hour, warm-cast)', () => {
    const r = suggestLighting({ bv: null, flashFired: null, localHour: 10, stats: warmStats() });
    expect(r.label).toBe('mixed');
    expect(r.confidence).toBe(0.3);
    expect(r.reasons).toEqual(['day-hour', 'warm-cast']);
  });

  it('bv null, night hour, not warm -> mixed 0.3 (night-hour)', () => {
    const r = suggestLighting({ bv: null, flashFired: null, localHour: 22, stats: neutralStats() });
    expect(r.label).toBe('mixed');
    expect(r.confidence).toBe(0.3);
    expect(r.reasons).toEqual(['night-hour']);
  });

  it('bv >= 4 with no localHour skips night-hour override -> daylight 0.9', () => {
    const r = suggestLighting({ bv: 5, flashFired: false, localHour: null, stats: null });
    expect(r.label).toBe('daylight');
    expect(r.confidence).toBe(0.9);
  });
});
