import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { BIATHLON_50M } from '@/lib/defaults/biathlon';
import type { AnalysisResult, Shot } from '@/lib/domain/analysis';
import { initialAnalysis } from '@/lib/domain/analysis';
import type { Categorization } from '@/lib/domain/photo';
import { type CompositeInput, type SlotData, COMPOSITE_CELLS, bandHeight, renderComposite, renderCompositeSvg } from '@/lib/render/composite';
import { analyzeTarget } from '@/lib/scoring/analyze';

import { makePhoto, makeSession } from '../../helpers/records';

interface ShotsFixture {
  template: 'sighting' | 'precision';
  categorization: Categorization;
  shots: Shot[];
}

function readFixture(name: string): ShotsFixture {
  const path = fileURLToPath(new URL(`../../../fixtures/reference/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf-8')) as ShotsFixture;
}

const sightingFixture = readFixture('sample-shots-sighting.json');
const precisionFixture = readFixture('sample-shots-precision.json');
const sightingResult: AnalysisResult = analyzeTarget({
  template: sightingFixture.template,
  categorization: sightingFixture.categorization,
  shots: sightingFixture.shots,
});
const precisionResult: AnalysisResult = analyzeTarget({
  template: precisionFixture.template,
  categorization: precisionFixture.categorization,
  shots: precisionFixture.shots,
});

function slot(fixture: ShotsFixture, result: AnalysisResult): SlotData {
  const photo = makePhoto({
    categorization: fixture.categorization,
    lighting: 'daylight',
    captureTime: { local: '2026-09-05T16:56:03', offset: '+00:00', utc: '2026-09-05T16:56:03.000Z', source: 'exif' },
  });
  const analysis = { ...initialAnalysis(photo.id, '2026-09-05T17:00:00.000Z'), shots: fixture.shots, computed: { engineVersion: '1', result } };
  return { photo, analysis, result };
}

function baseInput(over: Partial<CompositeInput> = {}): CompositeInput {
  return {
    session: makeSession({ name: 'Range day' }),
    slots: { sighting: [null, null], precision: [null, null] },
    generatedAtLocal: '2026-09-05 17:20',
    holeDiameterMm: BIATHLON_50M.holeDiameterMm,
    moreCount: 0,
    ...over,
  };
}

describe('render/composite four fixed positions (rendering-composite.md §5, REV-51)', () => {
  const s1 = () => slot(sightingFixture, sightingResult);
  const p1 = () => slot(precisionFixture, precisionResult);

  it('sighting 1 and 2 on the top row, precision 1 and 2 below', () => {
    expect(COMPOSITE_CELLS.map((c) => [c.template, c.index, c.x, c.y])).toEqual([
      ['sighting', 0, 0, 0],
      ['sighting', 1, 720, 0],
      ['precision', 0, 0, 720],
      ['precision', 1, 720, 720],
    ]);
  });

  it.each([
    ['1 target', { sighting: [null, null], precision: [p1(), null] }, 3],
    ['2 targets', { sighting: [s1(), null], precision: [p1(), null] }, 2],
    ['3 targets', { sighting: [s1(), s1()], precision: [p1(), null] }, 1],
    ['4 targets', { sighting: [s1(), s1()], precision: [p1(), p1()] }, 0],
  ] as const)('%s: always four cells, a blank template in each empty one', (_name, slots, blanks) => {
    const { svg } = renderComposite(baseInput({ slots: slots as never }));
    expect((svg.match(/viewBox="0 0 720 720"/g) ?? []).length).toBe(4);
    expect((svg.match(/>No target</g) ?? []).length).toBe(blanks);
  });

  it('a blank slot is its faded template, chipped without a position', () => {
    const { svg } = renderComposite(baseInput({ slots: { sighting: [s1(), null], precision: [p1(), null] } }));
    expect(svg).toContain('>SIGHTING 2<');
    expect(svg).toContain('>PRECISION 2<');
    expect(svg).toContain('opacity="0.35"');
  });

  it('0 targets throws EmptyCompositeError', () => {
    expect(() => renderComposite(baseInput())).toThrow('No analyzed targets');
  });

  it('the band is sized to its content', () => {
    expect(bandHeight(3)).toBe(100 + 34 * 3 + 64);
  });
});

describe('render/composite height vectors (§5)', () => {
  const s1 = () => slot(sightingFixture, sightingResult);
  const p1 = () => slot(precisionFixture, precisionResult);
  it.each([
    ['1 target', { sighting: [null, null], precision: [p1(), null] }, 120 + 1440 + 100 + 34 * 5 + 64],
    ['2 targets', { sighting: [s1(), null], precision: [p1(), null] }, 120 + 1440 + 100 + 34 * 3 + 64],
    ['3 targets', { sighting: [s1(), s1()], precision: [p1(), null] }, 120 + 1440 + 100 + 34 * 4 + 64],
    ['4 targets', { sighting: [s1(), s1()], precision: [p1(), p1()] }, 120 + 1440 + 100 + 34 * 5 + 64],
  ] as const)('%s', (_name, slots, expected) => {
    const { svg, height } = renderComposite(baseInput({ slots: slots as never }));
    expect(height).toBe(expected);
    expect(svg).toContain(`viewBox="0 0 1440 ${expected}"`);
  });
});

describe('render/composite the owner\'s screenshot, 2026-09-19 (REV-51)', () => {
  // Two sighting targets and one precision: the old grid gave the precision row a filler "stat card"
  // in a black frame, cut the diagrams off at the caption, and left a large empty band.
  const input = baseInput({
    slots: {
      sighting: [slot(sightingFixture, sightingResult), slot(sightingFixture, sightingResult)],
      precision: [slot(precisionFixture, precisionResult), null],
    },
  });
  const { svg } = renderComposite(input);

  it('has no stat card; the empty fourth position is a blank precision template', () => {
    expect(svg).not.toContain('x="744"');
    expect(svg).toContain('>PRECISION 2<');
    expect((svg.match(/>No target</g) ?? []).length).toBe(1);
  });

  it('fills the whole canvas first, so nothing renders black', () => {
    expect(svg).toMatch(/^<svg[^>]*><rect x="0" y="0" width="1440" height="\d+" fill="#EAF2F8"\/>/);
  });

  it('clips every filled cell drawing above its caption band, with ids unique in the document', () => {
    const ids = [...svg.matchAll(/clipPath id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(['cellclip-sighting-1', 'cellclip-sighting-2', 'cellclip-precision-1']);
  });

  it('captions say what they count (REV-49), and the footer says Nordic Aim', () => {
    expect(svg).not.toMatch(/\d+\/\d+ hit @/);
    expect(svg).toContain('9 hits · 1 miss — 45 mm · ES');
    expect(svg).toContain('Nordic Aim · generated');
  });
});

describe('render/composite one target carries its full stats in the band (§5)', () => {
  it('lists the footer lines that do not repeat the slot line', () => {
    const { svg } = renderComposite(baseInput({ slots: { sighting: [null, null], precision: [slot(precisionFixture, precisionResult), null] } }));
    expect(svg).toContain('Group size:');
    expect(svg).toContain('Targets: 1 precision · Daylight');
    expect(svg).not.toContain('Scoring summary');
    expect(svg).not.toContain('Total:');
  });
});

describe('render/composite renderCompositeSvg golden render (both demo fixtures)', () => {
  const input = baseInput({
    slots: {
      sighting: [slot(sightingFixture, sightingResult), null],
      precision: [slot(precisionFixture, precisionResult), null],
    },
  });
  const svg = renderCompositeSvg(input);

  it('two targets: root height 120 + 1440 + band (REV-51, four fixed positions)', () => {
    const height = 120 + 1440 + 100 + 34 * 3 + 64;
    expect(svg).toContain(`viewBox="0 0 1440 ${height}"`);
  });

  it('contains the required golden substrings', () => {
    expect(svg).toContain('Session analysis');
    // REV-49 (M24): the analysis band's per-slot line now reuses `targetHeadline` (issue #6).
    expect(svg).toContain('Precision 1 (prone): 72 / 100');
    expect(svg).toContain('Sighting 1 (prone): 9 hits · 1 miss — 45 mm prone');
  });

  it('has no stat cards (REV-51 removed them)', () => {
    expect(svg).not.toContain('x="744"');
  });

  it('never emits <foreignObject> or an external href', () => {
    expect(svg).not.toContain('foreignObject');
    expect(svg).not.toContain('href="http');
  });
});

describe('render/composite renderCompositeSvg slot layout', () => {
  it('two filled slots nest two cell diagrams side by side, no stat card', () => {
    const input = baseInput({
      slots: {
        precision: [slot(precisionFixture, precisionResult), slot(precisionFixture, precisionResult)],
        sighting: [null, null],
      },
    });
    const svg = renderCompositeSvg(input);
    expect(svg).not.toContain('x="744"');
    // Four nested cell <svg> roots: the two precision targets and two blank sighting templates (REV-51).
    expect((svg.match(/viewBox="0 0 720 720"/g) ?? []).length).toBe(4);
  });

  it('an empty composite (no filled slots at all) throws EmptyCompositeError', () => {
    const input = baseInput();
    expect(() => renderCompositeSvg(input)).toThrow('No analyzed targets');
  });

  it('the header carries the session name and a mixed-lighting subtitle when slots disagree', () => {
    const nightPhoto = slot(precisionFixture, precisionResult);
    nightPhoto.photo.lighting = 'night';
    const input = baseInput({
      session: makeSession({ name: 'Evening range' }),
      slots: { precision: [slot(precisionFixture, precisionResult), nightPhoto], sighting: [null, null] },
    });
    const svg = renderCompositeSvg(input);
    expect(svg).toContain('Shooting analysis — Evening range');
    expect(svg).toContain('mixed lighting');
  });

  it('appends "+<n> more target(s) in the app" when moreCount > 0', () => {
    const input = baseInput({
      slots: { precision: [slot(precisionFixture, precisionResult), null], sighting: [null, null] },
      moreCount: 2,
    });
    const svg = renderCompositeSvg(input);
    expect(svg).toContain('+2 more target(s) in the app');
  });
});

describe('render/composite renderCompositeSvg "both" slot line (fix round 1: §5\'s 110-char cap)', () => {
  it('a sighting "both" slot line stays at or under 110 chars and keeps ES visible', () => {
    const bothCategorization: Categorization = { template: 'sighting', position: 'both', roundsProne: 5, roundsStanding: 5 };
    const bothResult = analyzeTarget({ template: 'sighting', categorization: bothCategorization, shots: sightingFixture.shots });
    const bothSlot = slot({ ...sightingFixture, categorization: bothCategorization }, bothResult);
    const input = baseInput({ slots: { sighting: [bothSlot, null], precision: [null, null] } });
    const svg = renderCompositeSvg(input);

    // The headline drops the zone size for "both" (fix round 1), so the line reads "hits · miss(es)"
    // for each half without "— <zone> mm" repeated twice.
    expect(svg).toContain('Sighting 1 (prone + standing): Prone 5 hits · 0 misses · Standing 5 hits · 0 misses');

    const match = /<text[^>]*>(Sighting 1 \(prone \+ standing\): [^<]*)<\/text>/.exec(svg);
    expect(match).not.toBeNull();
    const lineText = match![1]!;
    expect(lineText.length).toBeLessThanOrEqual(110);
    // ES stays visible; the trailing "…" shows only the MPI part got cut (fix round 1).
    expect(lineText).toContain('ES 27.7 mm (1.90 MOA)');
    expect(lineText.endsWith('…')).toBe(true);
  });
});
