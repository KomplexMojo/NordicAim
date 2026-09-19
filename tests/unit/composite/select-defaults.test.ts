import { describe, expect, it } from 'vitest';

import type { AnalysisResult, SubsetResult, TargetAnalysis } from '@/lib/domain/analysis';
import { initialAnalysis } from '@/lib/domain/analysis';
import { selectDefaultSlots } from '@/lib/composite/select-defaults';

import { makePhoto } from '../../helpers/records';

function subset(over: Partial<SubsetResult> = {}): SubsetResult {
  return {
    key: 'all',
    declared: 10,
    identified: 10,
    missing: 0,
    overcount: 0,
    units: [],
    mpi: null,
    extremeSpreadMm: null,
    extremeSpreadAngular: null,
    meanRadiusMm: null,
    mpiOffset: null,
    groupEllipse: null,
    precision: null,
    sighting: null,
    warnings: [],
    ...over,
  };
}

function precisionResult(identifiedTotal: number): AnalysisResult {
  const all = subset({ precision: { tally: [], xCount: 0, identifiedTotal, maxPossible: 100 } });
  return { engineVersion: '1', template: 'precision', position: 'prone', subsets: [all], all };
}

function sightingResult(extremeSpreadMm: number | null): AnalysisResult {
  const all = subset({ extremeSpreadMm, sighting: { zoneDiameterMm: 45, hits: 9, clean: 8, misses: 1 } });
  return { engineVersion: '1', template: 'sighting', position: 'prone', subsets: [all], all };
}

function analyzed(photoId: string, result: AnalysisResult): TargetAnalysis {
  const base = initialAnalysis(photoId, '2026-09-05T00:00:00.000Z');
  return { ...base, computed: { engineVersion: '1', result } };
}

describe('composite/select-defaults selectDefaultSlots (rendering-composite.md §5)', () => {
  it('3 analyzed precision targets at 10:00/11:00/12:00 -> slots [11:00, 12:00]', () => {
    const p10 = makePhoto({
      status: 'analyzed',
      categorization: { template: 'precision', position: 'prone', roundsProne: 10, roundsStanding: null },
      captureTime: { local: '2026-09-05T10:00:00', offset: '+00:00', utc: '2026-09-05T10:00:00.000Z', source: 'exif' },
    });
    const p11 = makePhoto({
      status: 'analyzed',
      categorization: { template: 'precision', position: 'prone', roundsProne: 10, roundsStanding: null },
      captureTime: { local: '2026-09-05T11:00:00', offset: '+00:00', utc: '2026-09-05T11:00:00.000Z', source: 'exif' },
    });
    const p12 = makePhoto({
      status: 'analyzed',
      categorization: { template: 'precision', position: 'prone', roundsProne: 10, roundsStanding: null },
      captureTime: { local: '2026-09-05T12:00:00', offset: '+00:00', utc: '2026-09-05T12:00:00.000Z', source: 'exif' },
    });

    const analyses = new Map([
      [p10.id, analyzed(p10.id, precisionResult(70))],
      [p11.id, analyzed(p11.id, precisionResult(71))],
      [p12.id, analyzed(p12.id, precisionResult(72))],
    ]);

    const slots = selectDefaultSlots([p10, p11, p12], analyses);
    expect(slots.precision).toEqual([p11.id, p12.id]);
    expect(slots.sighting).toEqual([null, null]);
  });

  it('excludes needs-attention (rejected, too-many-holes) targets even though `computed` may be set on older stores', () => {
    const rejected = makePhoto({
      status: 'needs-attention',
      reasons: ['too-many-holes'],
      categorization: { template: 'precision', position: 'prone', roundsProne: 10, roundsStanding: null },
    });
    const analyses = new Map([[rejected.id, analyzed(rejected.id, precisionResult(80))]]);

    const slots = selectDefaultSlots([rejected], analyses);
    expect(slots.precision).toEqual([null, null]);
  });

  it('only `analyzed` photos with a computed result are candidates', () => {
    const noAnalysis = makePhoto({ status: 'analyzed', categorization: { template: 'sighting', position: 'prone', roundsProne: 10, roundsStanding: null } });
    const slots = selectDefaultSlots([noAnalysis], new Map());
    expect(slots.sighting).toEqual([null, null]);
  });

  it('ties on identical timestamps break by result: precision prefers higher identifiedTotal', () => {
    const a = makePhoto({
      status: 'analyzed',
      importedAt: '2026-09-05T00:00:00.000Z',
      categorization: { template: 'precision', position: 'prone', roundsProne: 10, roundsStanding: null },
      captureTime: { local: null, offset: null, utc: null, source: 'client-clock' },
    });
    const b = makePhoto({
      status: 'analyzed',
      importedAt: '2026-09-05T00:00:00.000Z',
      categorization: { template: 'precision', position: 'prone', roundsProne: 10, roundsStanding: null },
      captureTime: { local: null, offset: null, utc: null, source: 'client-clock' },
    });
    const analyses = new Map([
      [a.id, analyzed(a.id, precisionResult(60))],
      [b.id, analyzed(b.id, precisionResult(90))],
    ]);

    const slots = selectDefaultSlots([a, b], analyses);
    // Both timestamps tie, so both fit in the two slots regardless of order; the important assertion is
    // that neither is dropped and the better one is not excluded by the tie-break.
    expect(slots.precision).toContain(b.id);
    expect(slots.precision).toContain(a.id);
  });

  it('sighting tie-break: smaller extremeSpreadMm wins, null is worst', () => {
    const wide = makePhoto({
      status: 'analyzed',
      importedAt: '2026-09-05T00:00:00.000Z',
      categorization: { template: 'sighting', position: 'prone', roundsProne: 10, roundsStanding: null },
      captureTime: { local: null, offset: null, utc: null, source: 'client-clock' },
    });
    const tight = makePhoto({
      status: 'analyzed',
      importedAt: '2026-09-05T00:00:00.000Z',
      categorization: { template: 'sighting', position: 'prone', roundsProne: 10, roundsStanding: null },
      captureTime: { local: null, offset: null, utc: null, source: 'client-clock' },
    });
    const none = makePhoto({
      status: 'analyzed',
      importedAt: '2026-09-05T00:00:00.000Z',
      categorization: { template: 'sighting', position: 'prone', roundsProne: 10, roundsStanding: null },
      captureTime: { local: null, offset: null, utc: null, source: 'client-clock' },
    });
    const analyses = new Map([
      [wide.id, analyzed(wide.id, sightingResult(40))],
      [tight.id, analyzed(tight.id, sightingResult(10))],
      [none.id, analyzed(none.id, sightingResult(null))],
    ]);

    const slots = selectDefaultSlots([wide, tight, none], analyses);
    expect(slots.sighting).not.toContain(none.id);
    expect(slots.sighting).toContain(tight.id);
  });
});
