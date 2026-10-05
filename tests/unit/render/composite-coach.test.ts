// M29 (coach-context-import.md §6, REV-159): 545 Coach context on the summary image. A session with no attached coach
// context must render byte-identical to the image before M29 (rendering-composite.md §5-§6 hash-compare stored images).

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { BIATHLON_50M } from '@/lib/defaults/biathlon';
import type { AnalysisResult, Shot } from '@/lib/domain/analysis';
import { initialAnalysis } from '@/lib/domain/analysis';
import type { Categorization } from '@/lib/domain/photo';
import { type CompositeInput, type SlotData, renderComposite } from '@/lib/render/composite';
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
const result = (f: ShotsFixture): AnalysisResult => analyzeTarget({ template: f.template, categorization: f.categorization, shots: f.shots });

function slot(fixture: ShotsFixture, id: string): SlotData {
  const photo = makePhoto({
    id,
    sessionId: '00000000-0000-4000-8000-000000000001',
    categorization: fixture.categorization,
    lighting: 'daylight',
    captureTime: { local: '2026-09-05T16:56:03', offset: '+00:00', utc: '2026-09-05T16:56:03.000Z', source: 'exif' },
  });
  const r = result(fixture);
  const analysis = { ...initialAnalysis(photo.id, '2026-09-05T17:00:00.000Z'), shots: fixture.shots, computed: { engineVersion: '1', result: r } };
  return { photo, analysis, result: r };
}

const S1 = '00000000-0000-4000-8000-0000000000a1';
const S2 = '00000000-0000-4000-8000-0000000000a2';
const P1 = '00000000-0000-4000-8000-0000000000b1';
const P2 = '00000000-0000-4000-8000-0000000000b2';

export function baseInput(over: Partial<CompositeInput> = {}): CompositeInput {
  return {
    session: makeSession({ id: '00000000-0000-4000-8000-000000000001', name: 'Range day' }),
    slots: { sighting: [slot(sightingFixture, S1), null], precision: [slot(precisionFixture, P1), null] },
    generatedAtLocal: '2026-09-05 17:20',
    release: 'abc1234',
    holeDiameterMm: BIATHLON_50M.holeDiameterMm,
    scoring: { rule: 'gauge', visibleHoleDiameterMm: 4.5 },
    moreCount: 0,
    ...over,
  };
}

const sha = (svg: string) => createHash('sha256').update(svg).digest('hex');

/** Captured from the renderer before M29 changed it (the commit before REV-159). */
const PRE_M29: Record<string, string> = {
  two: 'b13c1f47cd9222ae9f9e0426c8a8af5c084ee6f9bca9d7667274ddb5b856f0cb',
  one: '6f702ba0079fd93ae301c25b01e0debaa012554b541c650210eca96d8e01e37d',
  fourWithNotes: '759d87f824f6bdfc88a18629dc20f332085b7ad28ea7816674fd74c91df90f3e',
};

const variants: Record<string, () => CompositeInput> = {
  two: () => baseInput(),
  one: () => baseInput({ slots: { sighting: [null, null], precision: [slot(precisionFixture, P1), null] } }),
  fourWithNotes: () =>
    baseInput({
      session: makeSession({ id: '00000000-0000-4000-8000-000000000001', name: 'Range day', notes: 'Gusty from the left, held off one click.' }),
      slots: {
        sighting: [slot(sightingFixture, S1), slot(sightingFixture, S2)],
        precision: [slot(precisionFixture, P1), slot(precisionFixture, P2)],
      },
      moreCount: 2,
      provenance: { name: 'Test Athlete', club: 'Test Club', stamp: null },
    }),
};

describe('render/composite with no coach context is byte-identical to before M29', () => {
  it.each(Object.keys(variants))('%s', (name) => {
    const svg = renderComposite(variants[name]!()).svg;
    expect(sha(svg)).toBe(PRE_M29[name]);
  });
});

describe('render/composite with 545 Coach context attached (REV-159)', () => {
  const metal = [
    { group: 'Combo 1', position: 'prone' as const, discHits: [true, true, false, true, true], hits: 4 },
    { group: '', position: 'standing' as const, discHits: [false, true, false, true, false], hits: 2 },
  ];

  it('an attached context with nothing to draw is still byte-identical', () => {
    expect(sha(renderComposite(baseInput({ coach: { wind: null, metal: [] } })).svg)).toBe(PRE_M29.two);
  });

  it('the windage badge sits one badge-step left of the season badge, and the title gives up three characters', () => {
    const long = makeSession({ id: '00000000-0000-4000-8000-000000000001', name: 'A very long session name that goes on and on' });
    const without = renderComposite(baseInput({ session: long })).svg;
    const withWind = renderComposite(baseInput({ session: long, coach: { wind: { band: 'light', clock: 3 }, metal: [] } })).svg;
    expect(withWind).toContain('class="wind-icon" data-wind="light" data-wind-clock="3" transform="translate(956 38)"');
    expect(withWind).toContain('class="season-icon"');
    expect(withWind).toContain('transform="translate(1010 38)"');
    const title = (svg: string) => /Shooting analysis — [^<]*/.exec(svg)![0];
    expect(title(without)).toHaveLength(50);
    expect(title(withWind)).toHaveLength(47);
    expect(title(withWind).endsWith('…')).toBe(true);
    // A short name is not cut at all.
    expect(renderComposite(baseInput({ coach: { wind: { band: 'none', clock: null }, metal: [] } })).svg).toContain('Shooting analysis — Range day<');
  });

  it('one disc row per metal bout in the band, which grows to hold them', () => {
    const plain = renderComposite(baseInput());
    const withMetal = renderComposite(baseInput({ coach: { wind: null, metal } }));
    expect((withMetal.svg.match(/class="metal-bout"/g) ?? []).length).toBe(2);
    expect(withMetal.height).toBe(plain.height + 46 + 2 * 34);
    expect(withMetal.svg).not.toContain('wind-icon');
  });
});
