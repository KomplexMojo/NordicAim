import { describe, expect, it } from 'vitest';

import { characterize, moa, type CharacterizeOptions, type Pt } from '@/lib/scoring/characteristics';

const MM = moa(1); // MOA per mm; 1 MOA ≈ 14.54 mm

const opts: CharacterizeOptions = { handedness: 'right', position: 'prone', discRadiusMm: 56.2 };
const ids = (points: Pt[], o = opts) => characterize(points, o).issues.map((i) => i.id);
const at = (xs: number[], ys: number[]): Pt[] => xs.map((x, i) => ({ xMm: x, yMm: ys[i]! }));
const mirror = (points: Pt[]): Pt[] => points.map((p) => ({ xMm: -p.xMm, yMm: p.yMm }));

/** Eight shots on a line through (cx, cy) at `deg` degrees, `half` mm either side, with a little jitter across it. */
function line(cx: number, cy: number, deg: number, half: number): Pt[] {
  const t = [-1, -0.7, -0.4, -0.1, 0.1, 0.4, 0.7, 1];
  const jitter = [1, -1, 1, -1, 1, -1, 1, -1];
  const a = (deg * Math.PI) / 180;
  return t.map((k, i) => ({
    xMm: cx + k * half * Math.cos(a) - jitter[i]! * 1.2 * Math.sin(a),
    yMm: cy + k * half * Math.sin(a) + jitter[i]! * 1.2 * Math.cos(a),
  }));
}

describe('characterize: the numbers (REV-88)', () => {
  it('needs five shots for any issue, but still reports the numbers', () => {
    const c = characterize(at([0, 2, -2, 1], [0, 1, -1, 2]), opts);
    expect(c.enough).toBe(false);
    expect(c.issues).toEqual([]);
    expect(c.esMm).not.toBeNull();
    expect(characterize([], opts).n).toBe(0);
  });

  it('spread, mean radius, offset and accuracy match the definitions', () => {
    // A 2 x 2 mm square of five shots (four corners + centre) centred 10 mm right of the bullseye.
    const c = characterize(at([9, 11, 9, 11, 10], [-1, -1, 1, 1, 0]), opts);
    expect(c.esMm).toBeCloseTo(Math.hypot(2, 2), 9);
    expect(c.meanRadiusMm).toBeCloseTo((4 * Math.SQRT2 + 0) / 5, 9);
    expect(c.offsetMm).toBeCloseTo(10, 9);
    expect(c.accuracyMm).toBeCloseTo(Math.sqrt((2 * 82 + 2 * 122 + 100) / 5), 9);
    expect(c.esMoa).toBeCloseTo(Math.hypot(2, 2) * MM, 9);
  });
});

describe('characterize: the rules (spec §3)', () => {
  it('1 tight: spread at or under 1.5 MOA (21.8 mm)', () => {
    expect(ids(at([0, 5, -5, 3, -3, 0, 2, -2], [0, 4, -4, -2, 2, 6, -6, 1]))).toContain('tight');
    expect(ids(line(0, 0, 0, 20))).not.toContain('tight'); // a 40 mm line is 2.7 MOA
  });

  it('2 scattered: spread at or over 3.0 MOA (43.6 mm)', () => {
    expect(ids(line(0, 0, 0, 40))).toContain('scattered');
  });

  it('3 zero off: a tight group well away from the bullseye', () => {
    const off = at([-20, -18, -22, -19, -21, -20, -18, -22], [10, 12, 8, 9, 11, 10, 12, 8]);
    expect(ids(off)).toContain('zero-off');
    expect(ids(off)).toContain('tight');
    expect(ids(at([0, 2, -2, 1, -1, 0, 2, -2], [0, 2, -2, 1, -1, 3, -3, 0]))).not.toContain('zero-off');
  });

  it('6 position change (prone only): two separated clusters', () => {
    const two = at([-15, -14, -16, -15, 15, 14, 16, 15], [0, 1, -1, 0, 0, 1, -1, 0]);
    expect(ids(two)).toContain('position-change');
    expect(ids(two, { ...opts, position: 'standing' })).not.toContain('position-change');
  });

  it('7 wind or light drift: a horizontal string near the centre', () => {
    expect(ids(line(0, 0, 0, 25))).toContain('wind-light');
  });

  it('9 trigger-arm elbow (down to the trigger side) and 10 sling too tight (up to it), prone', () => {
    expect(ids(line(0, 0, 135, 30))).toContain('trigger-elbow-out');
    expect(ids(line(0, 0, 45, 30))).toContain('sling-tight');
    expect(ids(line(0, 0, 45, 30), { ...opts, position: 'standing' })).not.toContain('sling-tight');
  });

  it('11 trigger finger: a small diagonal up to the trigger side', () => {
    expect(ids(line(0, 0, 45, 14))).toContain('trigger-finger');
  });

  it('12 sling too loose or slipping, prone: a vertical string; 13 breath or timing: a long vertical string with shots above and below', () => {
    expect(ids(line(0, 0, 90, 20))).toContain('sling-loose');
    // a compact vertical core with a flyer well above and another well below
    const chart = [...at([0, 1, -1, 0, 1, -1], [0, 3, -3, 5, -5, 2]), { xMm: 0, yMm: 60 }, { xMm: 0, yMm: -60 }];
    expect(ids(chart)).toContain('breath-timing');
    expect(ids(line(0, 0, 90, 20))).not.toContain('breath-timing');
  });

  it('14 butt low (prone): a group high on the target; 15 drift down: a small group low', () => {
    expect(ids(at([-1, 1, 0, 2, -2, 0, 1, -1], [21, 23, 22, 20, 24, 22, 21, 23]))).toContain('butt-low');
    expect(ids(at([-1, 1, 0, 2, -2, 0, 1, -1], [-21, -23, -22, -20, -24, -22, -21, -23]))).toContain('drift-down');
  });

  it('17 flinch: a tight core and one flyer to the trigger side and above', () => {
    const core = at([-2, 2, 0, 1, -1, 2, -2], [-2, 2, 0, -1, 1, 1, -1]);
    expect(ids([...core, { xMm: 30, yMm: 30 }])).toContain('flinch');
    expect(ids([...core, { xMm: -30, yMm: -30 }])).not.toContain('flinch');
  });

  it('4 fundamentals: half or more of the shots outside the black disc', () => {
    const wide = at([70, -70, 60, -65, 0, 5, 68, -60], [0, 5, -66, 62, 3, -2, 60, -70]);
    expect(ids(wide)).toContain('fundamentals');
  });
});

describe('characterize: handedness mirrors every rule (spec §1)', () => {
  it('a sling-arm elbow group is to the left for a right-hander and to the right for a left-hander', () => {
    const rightHanderGroup = line(-25, 0, 0, 25); // centred 25 mm on the left, a horizontal string
    expect(ids(rightHanderGroup)).toContain('sling-elbow-in');
    expect(ids(rightHanderGroup, { ...opts, handedness: 'left' })).not.toContain('sling-elbow-in');
    expect(ids(mirror(rightHanderGroup), { ...opts, handedness: 'left' })).toContain('sling-elbow-in');
  });

  it('every finding is the same for a group and its mirror under the opposite hand', () => {
    const groups = [line(0, 0, 45, 30), line(0, 0, 135, 30), line(-25, 0, 0, 25), at([-2, 2, 0, 1, -1, 2, -2, 30], [-2, 2, 0, -1, 1, 1, -1, 30])];
    for (const g of groups) {
      expect(ids(g, opts)).toEqual(ids(mirror(g), { ...opts, handedness: 'left' }));
    }
  });
});
