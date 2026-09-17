// M16 step 4 / REV-28: never report more shots than the declared rounds.

import { describe, expect, it } from 'vitest';

import type { Shot } from '@/lib/domain/analysis';
import { capShots, type CappableShot } from '@/lib/scoring/cap-shots';

function shot(over: Partial<CappableShot> & { id: string }): CappableShot {
  return {
    xMm: 0,
    yMm: 0,
    multiplicity: 1,
    positionOverrides: null,
    source: 'auto',
    confidence: 0.5,
    cluster: false,
    ...over,
  };
}

/** 12 auto shots whose confidence falls with the index, so the ranking is unambiguous. */
function twelveShots(): CappableShot[] {
  return Array.from({ length: 12 }, (_, i) =>
    shot({ id: `auto-${i + 1}`, xMm: i, yMm: 0, confidence: 1 - i * 0.05 }),
  );
}

describe('capShots (REV-28)', () => {
  it('keeps the best 10 of 12 and drops the two lowest-confidence shots', () => {
    const { kept, dropped } = capShots(twelveShots(), 10);

    expect(kept).toHaveLength(10);
    expect(dropped).toHaveLength(2);
    expect(dropped.map((s) => s.id)).toEqual(['auto-11', 'auto-12']);
    // Kept shots stay in their original order: a kept shot is never renumbered.
    expect(kept.map((s) => s.id)).toEqual([
      'auto-1', 'auto-2', 'auto-3', 'auto-4', 'auto-5',
      'auto-6', 'auto-7', 'auto-8', 'auto-9', 'auto-10',
    ]);
  });

  it('breaks a confidence tie by larger area', () => {
    const shots = [
      shot({ id: 'small', confidence: 0.8, areaMm2: 12, xMm: 1 }),
      shot({ id: 'big', confidence: 0.8, areaMm2: 24, xMm: 1 }),
    ];
    const { kept, dropped } = capShots(shots, 1);

    expect(kept.map((s) => s.id)).toEqual(['big']);
    expect(dropped.map((s) => s.id)).toEqual(['small']);
  });

  it('breaks a confidence and area tie by the smaller radial distance', () => {
    const shots = [
      shot({ id: 'far', confidence: 0.8, areaMm2: 20, xMm: 30, yMm: 40 }),
      shot({ id: 'near', confidence: 0.8, areaMm2: 20, xMm: 3, yMm: 4 }),
    ];
    const { kept, dropped } = capShots(shots, 1);

    expect(kept.map((s) => s.id)).toEqual(['near']);
    expect(dropped.map((s) => s.id)).toEqual(['far']);
  });

  it('is a total order: equal confidence, area and radius fall back to the id', () => {
    const shots = [shot({ id: 'b', xMm: 5 }), shot({ id: 'a', xMm: -5 })];
    const { kept } = capShots(shots, 1);

    expect(kept.map((s) => s.id)).toEqual(['a']);
  });

  it('leaves the shots alone when there are no more than declared', () => {
    const shots = twelveShots().slice(0, 9);
    const { kept, dropped } = capShots(shots, 10);

    expect(kept).toEqual(shots);
    expect(dropped).toEqual([]);
  });

  it('leaves the shots alone at exactly declared', () => {
    const shots = twelveShots().slice(0, 10);
    expect(capShots(shots, 10)).toEqual({ kept: shots, dropped: [] });
  });

  it('never drops a shot the owner placed by hand (analysis-pipeline §8)', () => {
    const shots: CappableShot[] = [
      shot({ id: 'm-1', source: 'manual', confidence: null }),
      shot({ id: 'm-2', source: 'manual', confidence: null }),
      shot({ id: 'auto-1', confidence: 0.9 }),
      shot({ id: 'auto-2', confidence: 0.1 }),
    ];
    const { kept, dropped } = capShots(shots, 3);

    expect(kept.map((s) => s.id)).toEqual(['m-1', 'm-2', 'auto-1']);
    expect(dropped.map((s) => s.id)).toEqual(['auto-2']);
  });

  it('drops every auto shot when the manual ones already fill the declared rounds', () => {
    const shots: CappableShot[] = [
      shot({ id: 'm-1', source: 'manual', confidence: null }),
      shot({ id: 'm-2', source: 'manual', confidence: null }),
      shot({ id: 'auto-1', confidence: 0.9 }),
    ];
    const { kept, dropped } = capShots(shots, 2);

    expect(kept.map((s) => s.id)).toEqual(['m-1', 'm-2']);
    expect(dropped.map((s) => s.id)).toEqual(['auto-1']);
  });

  it('is pure: the input array and its shots are untouched', () => {
    const shots = twelveShots();
    const snapshot = JSON.parse(JSON.stringify(shots)) as Shot[];
    capShots(shots, 5);

    expect(shots).toEqual(snapshot);
  });
});
