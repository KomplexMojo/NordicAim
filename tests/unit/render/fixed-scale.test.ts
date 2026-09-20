import { describe, expect, it } from 'vitest';

import { CELL_SCALE, fitScale, offViewCount, renderOffViewNote } from '@/lib/render/diagram-shared';

// REV-58 / issue #16: every small target view is drawn at one fixed scale, a stray shot is clipped and counted, and the
// detail diagram zooms out to show every shot.
const at = (xMm: number, yMm: number) => ({ xMm, yMm });

describe('CELL_SCALE', () => {
  it('is the precision halo fitted to the 300 px drawing radius', () => {
    expect(CELL_SCALE).toBeCloseTo(300 / 82.7, 9);
  });
});

describe('fitScale (the detail diagram)', () => {
  const S0 = 8; // sighting full scale
  const HALO = 62.5;

  it('does not change anything while every shot is inside the printed halo', () => {
    expect(fitScale(S0, HALO, [])).toBe(S0);
    expect(fitScale(S0, HALO, [at(0, 0), at(30, -40), at(62.5, 0)])).toBe(S0); // exactly on the halo is still inside
  });

  it('zooms out until the farthest shot lands on the halo edge', () => {
    const s = fitScale(S0, HALO, [at(10, 10), at(0, -100)]);
    expect(s).toBeCloseTo((S0 * HALO) / 100, 9);
    expect(100 * s).toBeCloseTo(HALO * S0, 9); // the stray is drawn where the halo edge is
  });

  it('never goes below half scale, so one wild manual shot cannot shrink the diagram away', () => {
    expect(fitScale(S0, HALO, [at(0, -900)])).toBe(0.5 * S0);
  });
});

describe('offViewCount and the note (the small views)', () => {
  const CX = 360;
  const CY = 350;

  it('counts shots whose centre falls outside the clip, and nothing else', () => {
    // 3.6276 px/mm: 100 mm is 363 px, so x 360 + 363 = 723 > 720 is out; 90 mm is 326 px, inside.
    const shots = [at(0, 0), at(90, 0), at(100, 0), at(0, -90), at(0, -100)];
    // y: 350 + 90*3.6276 = 676 > 668 (the caption starts at 668), so even 90 mm below is clipped.
    expect(offViewCount(shots, CX, CY, CELL_SCALE)).toBe(3);
  });

  it('counts shots, not units', () => {
    expect(offViewCount([{ xMm: 200, yMm: 0, multiplicity: 3 } as never], CX, CY, CELL_SCALE)).toBe(1);
  });

  it('is nothing for a target whose shots are all inside, and the note is then empty', () => {
    expect(offViewCount([at(0, 0), at(40, 30), at(-60, 20)], CX, CY, CELL_SCALE)).toBe(0);
    expect(renderOffViewNote(0)).toBe('');
  });

  it('says how many are out', () => {
    expect(renderOffViewNote(2)).toContain('+2 off view');
  });
});

// The detail screen shows one target, so it must show every shot, including a stray far off the paper (issue #16).
import { readFileSync } from 'node:fs';
import { analyzeTarget } from '@/lib/scoring/analyze';
import { renderDiagramSvg } from '@/lib/render/diagram';
import type { Shot } from '@/lib/domain/analysis';

describe('the detail (full) diagram shows every shot', () => {
  const fx = JSON.parse(readFileSync('fixtures/reference/sample-shots-sighting.json', 'utf-8')) as {
    template: 'sighting';
    categorization: never;
    shots: Shot[];
  };
  const render = (shots: Shot[]) => {
    const result = analyzeTarget({ template: 'sighting', categorization: fx.categorization, shots });
    return renderDiagramSvg(
      { template: 'sighting', result, shots, positionLabel: 'Prone', captureLocal: null, lighting: 'daylight', holeDiameterMm: 5.6 },
      'full',
    );
  };
  const outerRadius = (svg: string) => Math.max(...[...svg.matchAll(/ r="([\d.]+)"/g)].map((m) => Number(m[1])));

  it('is unchanged while every shot is inside the halo', () => {
    // sighting full scale 8 px/mm: the halo (62.5 mm) is 500 px
    expect(outerRadius(render(fx.shots))).toBeCloseTo(500, 0);
  });

  it('zooms out when a stray is on the paper beyond the target, so the stray is drawn on the diagram', () => {
    const stray: Shot = { ...fx.shots[0]!, id: 'stray', xMm: 0, yMm: -120 };
    const svg = render([...fx.shots, stray]);
    // scale 8 * 62.5 / 120 = 4.1667: the halo shrinks to 260 px, and the stray sits on its edge, inside the canvas
    expect(outerRadius(svg)).toBeCloseTo(260.4, 0);
    const shotCircles = [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="8"/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(shotCircles.length).toBeGreaterThan(0);
    for (const [x, y] of shotCircles) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(1500);
      expect(y).toBeGreaterThan(180); // below the legend
      expect(y).toBeLessThan(1230); // above the footer panel
    }
  });
});
