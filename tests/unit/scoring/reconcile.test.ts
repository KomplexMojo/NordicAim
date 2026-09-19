// M20 (REV-39): reconcileRounds — the declared rounds are fact.

import { describe, expect, it } from 'vitest';

import {
  CONFIDENT_HOLE_MIN,
  DOUBLE_PUNCH_MIN_RATIO,
  DOUBLE_PUNCH_MIN_RATIO_STANDARD,
  REJECT_MARGIN,
  reconcileRounds,
  type FoundHole,
} from '@/lib/scoring/reconcile';

const COLOUR = { doublePunchMinRatio: DOUBLE_PUNCH_MIN_RATIO };
const STANDARD = { doublePunchMinRatio: DOUBLE_PUNCH_MIN_RATIO_STANDARD };

/** A colour-path hole: always confident (step 2), with its coloured-area ratio to the median. */
function colourHole(i: number, overlapRatio = 1): FoundHole {
  return { id: `auto-${i}`, xMm: i * 3, yMm: 0, confidence: null, confident: true, overlapRatio };
}

function colourHoles(n: number, ratios: Record<number, number> = {}): FoundHole[] {
  return Array.from({ length: n }, (_, i) => colourHole(i + 1, ratios[i + 1] ?? 1));
}

/** A standard-path hole: confident only at or above CONFIDENT_HOLE_MIN. */
function standardHole(i: number, confidence: number): FoundHole {
  return {
    id: `auto-${String(i).padStart(2, '0')}`,
    xMm: i * 3,
    yMm: 0,
    confidence,
    confident: confidence >= CONFIDENT_HOLE_MIN,
    overlapRatio: 1,
  };
}

describe('M20 constants', () => {
  it('REJECT_MARGIN is 0 (owner, 2026-09-17: reject at any excess)', () => {
    expect(REJECT_MARGIN).toBe(0);
  });

  it('CONFIDENT_HOLE_MIN is the measured 0.94; DOUBLE_PUNCH_MIN_RATIO starts at 1.8; the standard path infers none', () => {
    expect(CONFIDENT_HOLE_MIN).toBe(0.94);
    expect(DOUBLE_PUNCH_MIN_RATIO).toBe(1.8);
    expect(DOUBLE_PUNCH_MIN_RATIO_STANDARD).toBeNull();
  });
});

describe('reconcileRounds, colour path (every hole confident)', () => {
  it('declared 10, 15 confident -> rejected; every hole kept, nothing inferred, nothing missed', () => {
    const found = colourHoles(15);
    const r = reconcileRounds(found, 10, COLOUR);
    expect(r.outcome).toBe('rejected');
    expect(r.confident).toBe(15);
    expect(r.kept).toEqual(found);
    expect(r.dropped).toEqual([]);
    expect(r.extraShots).toEqual({});
    expect(r.missesAssumed).toBe(0);
  });

  it('declared 10, 11 confident -> rejected (margin 0)', () => {
    expect(reconcileRounds(colourHoles(11), 10, COLOUR).outcome).toBe('rejected');
  });

  it('declared 10, 10 found, two with ratio 2.2 -> no inference: every round is accounted for', () => {
    const r = reconcileRounds(colourHoles(10, { 3: 2.2, 7: 2.2 }), 10, COLOUR);
    expect(r.outcome).toBe('exact');
    expect(r.extraShots).toEqual({});
    expect(r.missesAssumed).toBe(0);
  });

  it("IMG_5193's two long tears (2.31x, 1.87x, 10 rounds, 10 holes) do not become doubles", () => {
    const r = reconcileRounds(colourHoles(10, { 1: 2.31, 2: 1.87 }), 10, COLOUR);
    expect(r.extraShots).toEqual({});
    expect(r.missesAssumed).toBe(0);
  });

  it('declared 10, 8 found, one at ratio 2.23 -> 1 double inferred, 1 miss', () => {
    const r = reconcileRounds(colourHoles(8, { 5: 2.23 }), 10, COLOUR);
    expect(r.outcome).toBe('short');
    expect(r.extraShots).toEqual({ 'auto-5': 1 });
    expect(r.missesAssumed).toBe(1);
  });

  it('IMG_5191-shaped case (9 real shots on 8 holes, declared 10) -> 1 double, 1 miss', () => {
    // The ratios the colour path measures on IMG_5191 with the REV-44 alignment.
    const ratios = [2.11, 1.12, 1.02, 1.0, 1.0, 0.97, 0.75, 0.47];
    const found = ratios.map((ratio, i) => colourHole(i + 1, ratio));
    const r = reconcileRounds(found, 10, COLOUR);
    expect(r.extraShots).toEqual({ 'auto-1': 1 });
    expect(r.missesAssumed).toBe(1);
  });

  it('declared 10, 7 found, none qualifying -> 3 misses', () => {
    const r = reconcileRounds(colourHoles(7, { 2: 1.79 }), 10, COLOUR);
    expect(r.extraShots).toEqual({});
    expect(r.missesAssumed).toBe(3);
  });

  it('gives one extra shot per qualifying hole, strongest evidence first, until short is used up', () => {
    const r = reconcileRounds(colourHoles(9, { 2: 1.9, 4: 2.5 }), 10, COLOUR);
    expect(r.extraShots).toEqual({ 'auto-4': 1 });
    expect(r.missesAssumed).toBe(0);
  });

  it('a third shot only on 2x the evidence, and only after every qualifying hole has two', () => {
    // short 3: auto-1 (3.7) and auto-2 (2.0) take one each; then auto-1 clears 3.6 and takes a third.
    const r = reconcileRounds(colourHoles(8, { 1: 3.7, 2: 2.0 }), 11, COLOUR);
    expect(r.extraShots).toEqual({ 'auto-1': 2, 'auto-2': 1 });
    expect(r.missesAssumed).toBe(0);
  });

  it('no third shot below 2 x DOUBLE_PUNCH_MIN_RATIO: the rest are misses', () => {
    const r = reconcileRounds(colourHoles(8, { 1: 3.5 }), 11, COLOUR);
    expect(r.extraShots).toEqual({ 'auto-1': 1 });
    expect(r.missesAssumed).toBe(2);
  });

  it('an unmeasured hole (null evidence) never qualifies', () => {
    const found = [...colourHoles(7), { ...colourHole(8), overlapRatio: null }];
    expect(reconcileRounds(found, 10, COLOUR).missesAssumed).toBe(2);
  });
});

describe('reconcileRounds, standard path', () => {
  it('a hole below CONFIDENT_HOLE_MIN never triggers rejection: 15 found at 0.93 on 10 declared are capped', () => {
    const found = Array.from({ length: 15 }, (_, i) => standardHole(i + 1, 0.93));
    const r = reconcileRounds(found, 10, STANDARD);
    expect(r.confident).toBe(0);
    expect(r.outcome).toBe('capped');
    expect(r.kept).toHaveLength(10);
    expect(r.dropped).toHaveLength(5);
  });

  it('12 found / 10 declared with 9 confident -> capped to 10: all 9 confident kept, plus the best other', () => {
    const confident = Array.from({ length: 9 }, (_, i) => standardHole(i + 1, 0.95));
    const others = [standardHole(10, 0.6), standardHole(11, 0.8), standardHole(12, 0.7)];
    const r = reconcileRounds([...confident, ...others], 10, STANDARD);
    expect(r.outcome).toBe('capped');
    expect(r.kept.map((h) => h.id)).toEqual([...confident.map((h) => h.id), 'auto-11']);
    expect(r.dropped.map((h) => h.id)).toEqual(['auto-10', 'auto-12']);
  });

  it('more confident holes than rounds still rejects on the standard path', () => {
    const found = Array.from({ length: 11 }, (_, i) => standardHole(i + 1, 0.97));
    expect(reconcileRounds(found, 10, STANDARD).outcome).toBe('rejected');
  });

  it('fewer holes than rounds: no double punch is inferred on this path, so every short round is a miss', () => {
    const found = Array.from({ length: 8 }, (_, i) => ({ ...standardHole(i + 1, 0.8), overlapRatio: 3.4 }));
    const r = reconcileRounds(found, 10, STANDARD);
    expect(r.extraShots).toEqual({});
    expect(r.missesAssumed).toBe(2);
  });
});
