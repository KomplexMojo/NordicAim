import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { BIATHLON_50M } from '@/lib/defaults/biathlon';
import type { Shot } from '@/lib/domain/analysis';
import type { Categorization } from '@/lib/domain/photo';
import { cellCaption, precisionFooterLines, sightingFooterLines, targetHeadline } from '@/lib/render/text-lines';
import { analyzeTarget } from '@/lib/scoring/analyze';

interface ShotsFixture {
  template: 'sighting' | 'precision';
  categorization: Categorization;
  shots: Shot[];
}

function readFixture(name: string): ShotsFixture {
  const path = fileURLToPath(new URL(`../../../fixtures/reference/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf-8')) as ShotsFixture;
}

const HOLE_MM = BIATHLON_50M.holeDiameterMm;

describe('render/text-lines targetHeadline (rendering-composite.md §3, Steps §3)', () => {
  it('precision fixture, no missing rounds: "72 / 100 · X 1"', () => {
    const fixture = readFixture('sample-shots-precision.json');
    const result = analyzeTarget({ template: fixture.template, categorization: fixture.categorization, shots: fixture.shots });
    expect(targetHeadline(result)).toBe('72 / 100 · X 1');
  });

  it('sighting fixture (prone): "9/10 hits @ 45 mm"', () => {
    const fixture = readFixture('sample-shots-sighting.json');
    const result = analyzeTarget({ template: fixture.template, categorization: fixture.categorization, shots: fixture.shots });
    expect(targetHeadline(result)).toBe('9/10 hits @ 45 mm');
  });

  it('precision with P8 multiplicity reduced to 1 (missing=1): a definite "66 / 100 · 1 miss · X 1" (REV-39)', () => {
    const fixture = readFixture('sample-shots-precision.json');
    const shots = fixture.shots.map((s) => (s.id === 'P8' ? { ...s, multiplicity: 1 } : s));
    const result = analyzeTarget({ template: fixture.template, categorization: fixture.categorization, shots });
    expect(result.all.missing).toBe(1);
    expect(targetHeadline(result)).toBe('66 / 100 · 1 miss · X 1');
  });

  it('M20 scoring vector: declared 10, rings [10, 9, 9, 8] + 1 double on the 9 + 5 misses -> "45 / 100 · 5 misses"', () => {
    const categorization: Categorization = { template: 'precision', position: 'prone', roundsProne: 10, roundsStanding: null };
    const at = (id: string, xMm: number, multiplicity = 1): Shot => ({
      id,
      xMm,
      yMm: 0,
      multiplicity,
      positionOverrides: null,
      source: 'auto',
      confidence: null,
      cluster: false,
      possibleOverlap: false,
    });
    // radial 6 -> 10 (not X), 12 -> 9, 14 -> 9 (with its inferred double), 20 -> 8.
    const shots = [at('a', 6), at('b', 12), { ...at('c', 14, 2), inferred: 'double-punch' as const }, at('d', 20)];
    const result = analyzeTarget({ template: 'precision', categorization, shots });
    expect(result.all.precision!.identifiedTotal).toBe(45);
    expect(result.all.missing).toBe(5);
    expect(targetHeadline(result)).toBe('45 / 100 · 5 misses · X 0');
  });

  it('M20 scoring vector, sighting: the 5 missing rounds count as misses', () => {
    const categorization: Categorization = { template: 'sighting', position: 'prone', roundsProne: 10, roundsStanding: null };
    const at = (id: string, xMm: number, multiplicity = 1): Shot => ({
      id,
      xMm,
      yMm: 0,
      multiplicity,
      positionOverrides: null,
      source: 'auto',
      confidence: null,
      cluster: false,
      possibleOverlap: false,
    });
    const shots = [at('a', 6), at('b', 12), at('c', 14, 2), at('d', 20)];
    const result = analyzeTarget({ template: 'sighting', categorization, shots });
    expect(result.all.sighting).toEqual({ zoneDiameterMm: 45, hits: 5, clean: 5, misses: 5 });
    expect(targetHeadline(result)).toBe('5/10 hits @ 45 mm');
  });

  it('"both" position joins each subset\'s own headline as "Prone <h> · Standing <h>"', () => {
    const fixture = readFixture('sample-shots-sighting.json');
    const categorization: Categorization = { template: 'sighting', position: 'both', roundsProne: 5, roundsStanding: 5 };
    const result = analyzeTarget({ template: fixture.template, categorization, shots: fixture.shots });
    const headline = targetHeadline(result);
    expect(headline).toMatch(/^Prone .+ · Standing .+$/);
    expect(headline).not.toContain('undefined');
    expect(headline).not.toContain('null');
  });
});

describe('render/text-lines golden checks (rendering-composite.md §3 "Golden check")', () => {
  it('precisionFooterLines contains the golden substrings', () => {
    const fixture = readFixture('sample-shots-precision.json');
    const result = analyzeTarget({ template: fixture.template, categorization: fixture.categorization, shots: fixture.shots });
    const lines = precisionFooterLines(result, fixture.shots).join('\n');

    expect(lines).toContain('x2'); // largest cluster note (P8 multiplicity 2)
    expect(lines).toContain('41.9 mm');
    expect(lines).toContain('2.88 MOA');
    expect(lines).toContain('0.84 MRAD');
    expect(lines).toContain('Total: 72 / 100 · X count 1');
  });

  it('sightingFooterLines contains the golden substrings', () => {
    const fixture = readFixture('sample-shots-sighting.json');
    const result = analyzeTarget({ template: fixture.template, categorization: fixture.categorization, shots: fixture.shots });
    const lines = sightingFooterLines(result, fixture.shots, 'Prone', HOLE_MM).join('\n');

    expect(lines).toContain('9 hit / 1 miss');
    expect(lines).toContain('10 hit / 0 miss');
    expect(lines).toContain('27.7 mm');
    expect(lines).toContain('1.90 MOA');
    expect(lines).toContain('0.55 MRAD');
    expect(lines).toContain('x4'); // largest cluster note (S2 multiplicity 4)
  });

  it('precisionFooterLines adds a "Prone: … · Standing: …" line only when position is both', () => {
    const fixture = readFixture('sample-shots-precision.json');
    const single = analyzeTarget({ template: fixture.template, categorization: fixture.categorization, shots: fixture.shots });
    // REV-39 removed the "Range:" line, so a single-position target has 5 lines.
    expect(precisionFooterLines(single, fixture.shots)).toHaveLength(5);

    const both: Categorization = { template: 'precision', position: 'both', roundsProne: 5, roundsStanding: 5 };
    const bothResult = analyzeTarget({ template: fixture.template, categorization: both, shots: fixture.shots });
    const lines = precisionFooterLines(bothResult, fixture.shots);
    expect(lines).toHaveLength(6);
    expect(lines[5]).toMatch(/^Prone: \d+\/\d+ · Standing: \d+\/\d+$/);
  });
});

describe('render/text-lines cellCaption (rendering-composite.md §4)', () => {
  it('sighting: "<hits>/<declared> hit @ <zone> mm · ES <es> mm · <moa> MOA"', () => {
    const fixture = readFixture('sample-shots-sighting.json');
    const result = analyzeTarget({ template: fixture.template, categorization: fixture.categorization, shots: fixture.shots });
    expect(cellCaption(result)).toBe('9/10 hit @ 45 mm · ES 27.7 mm · 1.90 MOA');
  });

  it('precision: "<total>/<max> · X <x> · ES <es> mm · <moa> MOA"', () => {
    const fixture = readFixture('sample-shots-precision.json');
    const result = analyzeTarget({ template: fixture.template, categorization: fixture.categorization, shots: fixture.shots });
    expect(cellCaption(result)).toBe('72/100 · X 1 · ES 41.9 mm · 2.88 MOA');
  });

  it('shows the definite total, never a range, when missing > 0 (REV-39)', () => {
    const fixture = readFixture('sample-shots-precision.json');
    const shots = fixture.shots.map((s) => (s.id === 'P8' ? { ...s, multiplicity: 1 } : s));
    const result = analyzeTarget({ template: fixture.template, categorization: fixture.categorization, shots });
    expect(cellCaption(result)).toBe('66/100 · X 1 · ES 41.9 mm · 2.88 MOA');
  });

  it('precisionFooterLines names the misses on the Total line (REV-39)', () => {
    const fixture = readFixture('sample-shots-precision.json');
    const shots = fixture.shots.map((s) => (s.id === 'P8' ? { ...s, multiplicity: 1 } : s));
    const result = analyzeTarget({ template: fixture.template, categorization: fixture.categorization, shots });
    const lines = precisionFooterLines(result, shots);
    expect(lines[2]).toBe('Total: 66 / 100 · X count 1 · 1 miss');
    expect(lines.join('\n')).not.toContain('Range');
  });

  it('sighting "both" uses "P <h>/<d> · S <h>/<d>" instead of a single zone', () => {
    const fixture = readFixture('sample-shots-sighting.json');
    const categorization: Categorization = { template: 'sighting', position: 'both', roundsProne: 5, roundsStanding: 5 };
    const result = analyzeTarget({ template: fixture.template, categorization, shots: fixture.shots });
    expect(cellCaption(result)).toMatch(/^P \d+\/\d+ · S \d+\/\d+ · ES/);
  });
});
