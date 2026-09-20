import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { BIATHLON_50M } from '@/lib/defaults/biathlon';
import type { AnalysisResult, Shot } from '@/lib/domain/analysis';
import { initialAnalysis } from '@/lib/domain/analysis';
import type { Categorization } from '@/lib/domain/photo';
import { type CompositeInput, type SlotData, COMPOSITE_CELLS, bandHeight, positionName, renderComposite, renderCompositeSvg } from '@/lib/render/composite';
import { CELL_SCALE } from '@/lib/render/diagram-shared';
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
    expect(svg).toContain('>CONFIRM<');
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

describe('render/composite sight in, then confirm (REV-53)', () => {
  it('names the sighting positions for what they are; precision stays numbered', () => {
    expect([positionName('sighting', 0), positionName('sighting', 1)]).toEqual(['Sight in', 'Confirm']);
    expect([positionName('precision', 0), positionName('precision', 1)]).toEqual(['Precision 1', 'Precision 2']);
  });

  it('chips and band lines use them, filled or blank', () => {
    const { svg } = renderComposite(
      baseInput({
        slots: {
          sighting: [slot(sightingFixture, sightingResult), null],
          precision: [slot(precisionFixture, precisionResult), null],
        },
      }),
    );
    expect(svg).toContain('>SIGHT IN · PRONE<'); // filled
    expect(svg).toContain('>CONFIRM<'); // blank, so no position
    expect(svg).toContain('>PRECISION 1 · PRONE<');
    expect(svg).toContain('Sight in (prone): 9 hits');
    expect(svg).not.toContain('Sighting 1');
    expect(svg).not.toContain('SIGHTING 2');
  });

  it('the earlier sighting target is the one sighted in on (selection is chronological)', () => {
    // selectDefaultSlots puts the older target in slot 1; slot 1 is "Sight in".
    expect(COMPOSITE_CELLS[0]).toMatchObject({ template: 'sighting', index: 0 });
    expect(positionName('sighting', 0)).toBe('Sight in');
  });
});

describe('render/composite one fixed scale for every target (REV-52, REV-58)', () => {
  const s1 = () => slot(sightingFixture, sightingResult);
  const p1 = () => slot(precisionFixture, precisionResult);

  /** The target's outer (halo) radius in each nested cell, keyed by its position — scale x haloRadiusMm. */
  function cellRadii(svg: string): Map<string, number> {
    const cells = svg.split('<svg ').slice(2); // [0] is the composite root, [1..] the nested cells
    const byLabel = new Map<string, number>();
    for (const cell of cells) {
      // The chip reads "SIGHT IN · PRONE" when filled and "CONFIRM" when blank; key on the position name.
      const label = /<text[^>]*>(SIGHT IN|CONFIRM|PRECISION \d)/.exec(cell)?.[1] ?? '?';
      // The largest circle is the target's halo; a filled cell also draws shot dots, a blank one does not.
      const radii = [...cell.matchAll(/ r="([\d.]+)"/g)].map((m) => Number(m[1]));
      byLabel.set(label, Math.max(...radii));
    }
    return byLabel;
  }

  it('the two sighting targets are drawn identically, even when one has a shot beyond the target', () => {
    // The owner's report: a far shot zoomed its own cell, so the pair no longer matched.
    const far = { ...sightingFixture.shots[0]!, id: 'far', xMm: -8, yMm: -64 };
    const withFar = slot({ ...sightingFixture, shots: [...sightingFixture.shots, far] } as never, sightingResult);
    const { svg } = renderComposite(baseInput({ slots: { sighting: [s1(), withFar], precision: [p1(), null] } }));
    const radii = cellRadii(svg);
    expect(radii.get('SIGHT IN')).toBeDefined();
    expect(radii.get('SIGHT IN')).toEqual(radii.get('CONFIRM'));
  });

  it('a blank slot matches the filled one of its template', () => {
    const { svg } = renderComposite(baseInput({ slots: { sighting: [s1(), null], precision: [p1(), null] } }));
    const radii = cellRadii(svg);
    expect(radii.get('SIGHT IN')).toBeDefined();
    expect(radii.get('SIGHT IN')).toEqual(radii.get('CONFIRM'));
    expect(radii.get('PRECISION 1')).toEqual(radii.get('PRECISION 2'));
  });

  it('a stray shot never zooms anything out: the far cell is clipped and counted, not shrunk (REV-58)', () => {
    const far = { ...sightingFixture.shots[0]!, id: 'far', xMm: 0, yMm: -120 };
    const withFar = slot({ ...sightingFixture, shots: [...sightingFixture.shots, far] } as never, sightingResult);
    const alone = renderComposite(baseInput({ slots: { sighting: [s1(), null], precision: [p1(), null] } })).svg;
    const strayed = renderComposite(baseInput({ slots: { sighting: [withFar, null], precision: [p1(), null] } })).svg;
    // Every target keeps the same outer radius whether or not a stray is present ...
    expect(cellRadii(strayed).get('SIGHT IN')).toBe(cellRadii(alone).get('SIGHT IN'));
    expect(cellRadii(strayed).get('PRECISION 1')).toBe(cellRadii(alone).get('PRECISION 1'));
    // ... and the stray is counted instead.
    expect(strayed).toContain('+1 off view');
    expect(alone).not.toContain('off view');
  });

  it('the precision sheet\'s halo sets the one scale, so a sighting target is drawn smaller than its cell (REV-58)', () => {
    expect(CELL_SCALE).toBeCloseTo(300 / 82.7, 6);
    const { svg } = renderComposite(baseInput({ slots: { sighting: [s1(), null], precision: [p1(), null] } }));
    const radii = cellRadii(svg);
    // sighting halo 62.5 mm and precision halo 82.7 mm at the same scale
    expect(radii.get('SIGHT IN')! / radii.get('PRECISION 1')!).toBeCloseTo(62.5 / 82.7, 2);
    expect(radii.get('PRECISION 1')).toBeCloseTo(300, 0);
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

  it('captions say what they count (REV-49), and the footer credits the app and its developer', () => {
    expect(svg).not.toMatch(/\d+\/\d+ hit @/);
    expect(svg).toContain('9 hits · 1 miss — 45 mm · ES');
    expect(svg).toContain('Developed using Nordic Aim by KomplexMojo · generated'); // REV-54
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
    expect(svg).toContain('Sight in (prone): 9 hits · 1 miss — 45 mm prone');
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
    expect(svg).toContain('Sight in (prone + standing): Prone 5 hits · 0 misses · Standing 5 hits · 0 misses');

    const match = /<text[^>]*>(Sight in \(prone \+ standing\): [^<]*)<\/text>/.exec(svg);
    expect(match).not.toBeNull();
    const lineText = match![1]!;
    expect(lineText.length).toBeLessThanOrEqual(110);
    // ES stays visible; the trailing "…" shows only the MPI part got cut (fix round 1).
    expect(lineText).toContain('ES 27.7 mm (1.90 MOA)');
    expect(lineText.endsWith('…')).toBe(true);
  });
});
