import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { BIATHLON_50M } from '@/lib/defaults/biathlon';
import type { AnalysisResult, Shot } from '@/lib/domain/analysis';
import { initialAnalysis } from '@/lib/domain/analysis';
import type { Categorization } from '@/lib/domain/photo';
import { compositeHeight, renderCompositeSvg, type CompositeInput, type SlotData } from '@/lib/render/composite';
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

describe('render/composite compositeHeight (rendering-composite.md §5 height vectors)', () => {
  it.each([
    [1, 1, 2160],
    [0, 1, 1440],
    [1, 0, 1440],
  ] as const)('(%i, %i) -> %i', (s, p, expected) => {
    expect(compositeHeight(s, p)).toBe(expected);
  });

  it('(0, 0) throws EmptyCompositeError', () => {
    expect(() => compositeHeight(0, 0)).toThrow('No analyzed targets');
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

  it('root height is 2160 (one sighting row + one precision row)', () => {
    expect(svg).toContain('height="2160"');
    expect(svg).toContain('viewBox="0 0 1440 2160"');
  });

  it('contains the required golden substrings', () => {
    expect(svg).toContain('Session analysis');
    // REV-49 (M24): the analysis band's per-slot line now reuses `targetHeadline` (issue #6).
    expect(svg).toContain('Precision 1 (prone): 72 / 100');
    expect(svg).toContain('Sighting 1 (prone): 9 hits · 1 miss — 45 mm prone');
  });

  it('has two stat cards (one filled slot per row)', () => {
    // A stat card is a 672x672 panel rect at x 744; both rows have exactly one filled slot here.
    expect((svg.match(/x="744"/g) ?? []).length).toBe(2);
  });

  it('never emits <foreignObject> or an external href', () => {
    expect(svg).not.toContain('foreignObject');
    expect(svg).not.toContain('href="http');
  });
});

describe('render/composite renderCompositeSvg slot layout', () => {
  it('two filled slots in a row nest two cell diagrams side by side, no stat card', () => {
    const input = baseInput({
      slots: {
        precision: [slot(precisionFixture, precisionResult), slot(precisionFixture, precisionResult)],
        sighting: [null, null],
      },
    });
    const svg = renderCompositeSvg(input);
    expect(svg).not.toContain('x="744"');
    // Two nested cell <svg> roots (720x720 viewBox) inside the composite.
    expect((svg.match(/viewBox="0 0 720 720"/g) ?? []).length).toBe(2);
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
