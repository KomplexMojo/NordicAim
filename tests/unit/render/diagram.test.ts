import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { BIATHLON_50M } from '@/lib/defaults/biathlon';
import type { AnalysisResult, Shot } from '@/lib/domain/analysis';
import type { Categorization } from '@/lib/domain/photo';
import { renderDiagramSvg, type DiagramInput } from '@/lib/render/diagram';
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

function analyze(fixture: ShotsFixture, categorization: Categorization = fixture.categorization): AnalysisResult {
  return analyzeTarget({ template: fixture.template, categorization, shots: fixture.shots });
}

function buildInput(fixture: ShotsFixture, result: AnalysisResult, positionLabel = 'Prone'): DiagramInput {
  return {
    template: fixture.template,
    result,
    shots: fixture.shots,
    positionLabel,
    captureLocal: '2026-09-05T16:56:03',
    lighting: 'daylight',
    holeDiameterMm: BIATHLON_50M.holeDiameterMm,
  };
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

const sightingFixture = readFixture('sample-shots-sighting.json');
const precisionFixture = readFixture('sample-shots-precision.json');
const sightingResult = analyze(sightingFixture);
const precisionResult = analyze(precisionFixture);

describe('render/diagram renderDiagramSvg structure (rendering-composite.md §3-4)', () => {
  it('precision full: 9 shot circles and 11 results-row entries', () => {
    const svg = renderDiagramSvg(buildInput(precisionFixture, precisionResult), 'full');
    expect(countOccurrences(svg, 'class="shot"')).toBe(9);
    expect(countOccurrences(svg, 'class="results-row"')).toBe(11);
  });

  it('sighting full: 7 shot circles', () => {
    const svg = renderDiagramSvg(buildInput(sightingFixture, sightingResult), 'full');
    expect(countOccurrences(svg, 'class="shot"')).toBe(7);
  });

  it('the group ellipse transform rotates by the negative of angleDeg', () => {
    const svg = renderDiagramSvg(buildInput(precisionFixture, precisionResult), 'full');
    expect(svg).toContain('rotate(-');
  });

  it('the "both" legend is present only when position is both', () => {
    const single = renderDiagramSvg(buildInput(sightingFixture, sightingResult), 'full');
    expect(single).not.toContain('class="legend-both"');

    const bothCategorization: Categorization = { template: 'sighting', position: 'both', roundsProne: 5, roundsStanding: 5 };
    const bothResult = analyze(sightingFixture, bothCategorization);
    const both = renderDiagramSvg(buildInput(sightingFixture, bothResult, 'Prone + standing'), 'full');
    expect(both).toContain('class="legend-both"');
  });

  it('shots use fixed display radii: full 8 (x1.25 for multiplicity), cell 5 (REV-22)', () => {
    const full = renderDiagramSvg(buildInput(sightingFixture, sightingResult), 'full');
    expect(full).toContain('r="8" fill');
    expect(full).toContain('r="10" fill');
    const cell = renderDiagramSvg(buildInput(sightingFixture, sightingResult), 'cell');
    expect(cell).toContain('r="5" fill');
  });

  it('x<k> and MPI labels carry a white outline for contrast (REV-23)', () => {
    const svg = renderDiagramSvg(buildInput(precisionFixture, precisionResult), 'full');
    expect(countOccurrences(svg, 'paint-order="stroke"')).toBe(2);
    expect(svg).toMatch(/stroke="#FFFFFF" stroke-width="4" stroke-linejoin="round" paint-order="stroke">x2</);
    expect(svg).toMatch(/paint-order="stroke">MPI</);
  });

  it('sighting zone labels "45 mm" and "115 mm" appear in full only (REV-22)', () => {
    const full = renderDiagramSvg(buildInput(sightingFixture, sightingResult), 'full');
    expect(countOccurrences(full, 'class="zone-label"')).toBe(2);
    expect(full).toContain('>45 mm</text>');
    expect(full).toContain('>115 mm</text>');
    const cell = renderDiagramSvg(buildInput(sightingFixture, sightingResult), 'cell');
    expect(cell).not.toContain('class="zone-label"');
  });

  it('the precision cell variant has no ring-label (scale < 4)', () => {
    const svg = renderDiagramSvg(buildInput(precisionFixture, precisionResult), 'cell');
    expect(svg).not.toContain('class="ring-label"');
  });

  it('the precision full variant does have ring-label elements (scale >= 4)', () => {
    const svg = renderDiagramSvg(buildInput(precisionFixture, precisionResult), 'full');
    expect(svg).toContain('class="ring-label"');
  });

  it.each([
    ['sighting', sightingFixture, sightingResult, 1500, 1700, 'full'] as const,
    ['sighting', sightingFixture, sightingResult, 720, 720, 'cell'] as const,
    ['precision', precisionFixture, precisionResult, 1500, 1700, 'full'] as const,
    ['precision', precisionFixture, precisionResult, 720, 720, 'cell'] as const,
  ])('%s %s variant has the required SVG root attributes', (_template, fixture, result, width, height, variant) => {
    const svg = renderDiagramSvg(buildInput(fixture, result), variant);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain(`width="${width}"`);
    expect(svg).toContain(`height="${height}"`);
    expect(svg).toContain(`viewBox="0 0 ${width} ${height}"`);
  });

  it('never emits <foreignObject> or an external href', () => {
    for (const svg of [
      renderDiagramSvg(buildInput(sightingFixture, sightingResult), 'full'),
      renderDiagramSvg(buildInput(precisionFixture, precisionResult), 'full'),
    ]) {
      expect(svg).not.toContain('foreignObject');
      expect(svg).not.toContain('href="http');
    }
  });
});

describe('render/diagram renderDiagramSvg golden checks (rendering-composite.md §3 "Golden check")', () => {
  it('precision full SVG contains the golden substrings', () => {
    const svg = renderDiagramSvg(buildInput(precisionFixture, precisionResult), 'full');
    expect(svg).toContain('Total  72 / 100');
    expect(svg).toContain('x2');
    expect(svg).toContain('41.9 mm');
    expect(svg).toContain('2.88 MOA');
    expect(svg).toContain('0.84 MRAD');
  });

  it('sighting full SVG contains the golden substrings', () => {
    const svg = renderDiagramSvg(buildInput(sightingFixture, sightingResult), 'full');
    expect(svg).toContain('9 hit / 1 miss');
    expect(svg).toContain('10 hit / 0 miss');
    expect(svg).toContain('27.7 mm');
    expect(svg).toContain('1.90 MOA');
    expect(svg).toContain('0.55 MRAD');
    expect(svg).toContain('x4');
  });
});

describe('render/diagram renderDiagramSvg touch-credit marker (M24, REV-49: rendering-composite §3 item 7a)', () => {
  function shot(id: string, xMm: number): Shot {
    return { id, xMm, yMm: 0, multiplicity: 1, positionOverrides: null, source: 'auto', confidence: null, cluster: false, possibleOverlap: false };
  }

  it('a precision unit scored by touching the line (7.05 mm) draws the touch-credit ring and the footer explains it', () => {
    const categorization: Categorization = { template: 'precision', position: 'prone', roundsProne: 1, roundsStanding: null };
    const shots = [shot('a', 7.05)];
    const result = analyzeTarget({ template: 'precision', categorization, shots });
    const svg = renderDiagramSvg(
      { template: 'precision', result, shots, positionLabel: 'Prone', captureLocal: null, lighting: 'daylight', holeDiameterMm: BIATHLON_50M.holeDiameterMm },
      'full',
    );
    expect(svg).toContain('class="touch-credit"');
    expect(svg).toContain('scored by touching the line');
  });

  it('a precision unit within its ring (3.55 mm) draws no touch-credit ring', () => {
    const categorization: Categorization = { template: 'precision', position: 'prone', roundsProne: 1, roundsStanding: null };
    const shots = [shot('a', 3.55)];
    const result = analyzeTarget({ template: 'precision', categorization, shots });
    const svg = renderDiagramSvg(
      { template: 'precision', result, shots, positionLabel: 'Prone', captureLocal: null, lighting: 'daylight', holeDiameterMm: BIATHLON_50M.holeDiameterMm },
      'full',
    );
    expect(svg).not.toContain('class="touch-credit"');
    expect(svg).not.toContain('scored by touching the line');
  });

  it('the golden fixtures (no touch-credited unit) draw no touch-credit ring or note', () => {
    expect(renderDiagramSvg(buildInput(sightingFixture, sightingResult), 'full')).not.toContain('class="touch-credit"');
    expect(renderDiagramSvg(buildInput(precisionFixture, precisionResult), 'full')).not.toContain('class="touch-credit"');
  });

  it('a sighting unit scored by touching the line (23.4 mm, 45 mm prone zone) draws the touch-credit ring', () => {
    const categorization: Categorization = { template: 'sighting', position: 'prone', roundsProne: 1, roundsStanding: null };
    const shots = [shot('a', 23.4)];
    const result = analyzeTarget({ template: 'sighting', categorization, shots });
    expect(result.all.sighting).toMatchObject({ hits: 1, misses: 0 });
    const svg = renderDiagramSvg(
      { template: 'sighting', result, shots, positionLabel: 'Prone', captureLocal: null, lighting: 'daylight', holeDiameterMm: BIATHLON_50M.holeDiameterMm },
      'full',
    );
    expect(svg).toContain('class="touch-credit"');
    expect(svg).toContain('scored by touching the line');
  });

  it('a sighting unit outside the zone (26.2 mm, 45 mm prone zone) is a miss and draws no touch-credit ring', () => {
    const categorization: Categorization = { template: 'sighting', position: 'prone', roundsProne: 1, roundsStanding: null };
    const shots = [shot('a', 26.2)];
    const result = analyzeTarget({ template: 'sighting', categorization, shots });
    expect(result.all.sighting).toMatchObject({ hits: 0, misses: 1 });
    const svg = renderDiagramSvg(
      { template: 'sighting', result, shots, positionLabel: 'Prone', captureLocal: null, lighting: 'daylight', holeDiameterMm: BIATHLON_50M.holeDiameterMm },
      'full',
    );
    expect(svg).not.toContain('class="touch-credit"');
    expect(svg).not.toContain('scored by touching the line');
  });
});

describe('render/diagram renderDiagramSvg snapshots', () => {
  it('sighting full', () => {
    expect(renderDiagramSvg(buildInput(sightingFixture, sightingResult), 'full')).toMatchSnapshot();
  });
  it('sighting cell', () => {
    expect(renderDiagramSvg(buildInput(sightingFixture, sightingResult), 'cell')).toMatchSnapshot();
  });
  it('precision full', () => {
    expect(renderDiagramSvg(buildInput(precisionFixture, precisionResult), 'full')).toMatchSnapshot();
  });
  it('precision cell', () => {
    expect(renderDiagramSvg(buildInput(precisionFixture, precisionResult), 'cell')).toMatchSnapshot();
  });
});
