import { describe, expect, it } from 'vitest';

import { collectPatterns, filterByRange, type PatternPoint, type PatternSource } from '@/lib/patterns/collect';
import { summarizePatterns } from '@/lib/patterns/summarize';
import { PATTERNS_SIZE, patternsScale, patternsSizeFactor, renderPatternsSvg } from '@/lib/render/patterns';

type Unit = { xMm: number; yMm: number; position: 'prone' | 'standing'; ring: number | null; zone: 'clean' | 'hit' | 'miss' | null };

function source(over: {
  id: string;
  session?: string;
  date?: string;
  template: 'precision' | 'sighting';
  utc?: string | null;
  units: Unit[];
  status?: string;
  method?: 'cv' | 'overlay' | 'manual' | 'none';
  computed?: boolean;
  role?: 'sight-in' | 'confirm' | null;
}): PatternSource {
  return {
    sessionId: over.session ?? 's1',
    sessionDate: over.date ?? '2026-09-10',
    sessionStamp: '2026-09-10T08:00:00.000Z',
    photo: {
      id: over.id,
      sessionId: over.session ?? 's1',
      status: (over.status ?? 'analyzed') as never,
      captureTime: { local: null, offset: null, utc: over.utc ?? null, source: 'exif' },
      importedAt: '2026-09-10T00:00:00.000Z',
      categorization: { template: over.template, sightingRole: over.role ?? null },
    },
    analysis: {
      pipeline: { alignment: { method: over.method ?? 'cv', confidence: 1 } } as never,
      computed:
        over.computed === false
          ? null
          : {
              engineVersion: '1',
              result: {
                template: over.template,
                all: { units: over.units.map((u, i) => ({ shotId: `${over.id}-${i}`, unitIndex: i, radialMm: 0, isX: null, ...u })) },
              } as never,
            },
    },
  };
}

const u = (xMm: number, yMm: number, position: 'prone' | 'standing' = 'prone', ring: number | null = null, zone: Unit['zone'] = null): Unit => ({
  xMm,
  yMm,
  position,
  ring,
  zone,
});

describe('collectPatterns (patterns.md §1, §2)', () => {
  it('first sighting target of a session is Sight in, later ones are Confirm, by capture time', () => {
    const data = collectPatterns([
      source({ id: 'late', template: 'sighting', utc: '2026-09-10T12:00:00Z', units: [u(1, 1)] }),
      source({ id: 'early', template: 'sighting', utc: '2026-09-10T10:00:00Z', units: [u(2, 2)] }),
      source({ id: 'later', template: 'sighting', utc: '2026-09-10T13:00:00Z', units: [u(3, 3)] }),
    ]);
    expect(data.points['sight-in'].map((p) => p.photoId)).toEqual(['early']);
    expect(data.points.confirm.map((p) => p.photoId).sort()).toEqual(['late', 'later']);
  });

  it('a role the owner chose wins over capture order (REV-67)', () => {
    const data = collectPatterns([
      source({ id: 'first', template: 'sighting', utc: '2026-09-10T10:00:00Z', units: [u(1, 1)], role: 'confirm' }),
      source({ id: 'second', template: 'sighting', utc: '2026-09-10T11:00:00Z', units: [u(2, 2)], role: 'sight-in' }),
    ]);
    expect(data.points['sight-in'].map((p) => p.photoId)).toEqual(['second']);
    expect(data.points.confirm.map((p) => p.photoId)).toEqual(['first']);
  });

  it('a lone sighting target is Sight in; roles are per session', () => {
    const data = collectPatterns([
      source({ id: 'a', session: 's1', template: 'sighting', units: [u(0, 0)] }),
      source({ id: 'b', session: 's2', template: 'sighting', units: [u(0, 0)] }),
    ]);
    expect(data.points['sight-in']).toHaveLength(2);
    expect(data.points.confirm).toHaveLength(0);
  });

  it('a both precision target splits its units by position', () => {
    const data = collectPatterns([source({ id: 'p', template: 'precision', units: [u(1, 0, 'prone', 10), u(2, 0, 'standing', 9), u(3, 0, 'standing', 8)] })]);
    expect(data.points['precision-prone']).toHaveLength(1);
    expect(data.points['precision-standing']).toHaveLength(2);
  });

  it('leaves out targets that are unanalysed, unmeasured or have no computed result, and counts them', () => {
    const data = collectPatterns([
      source({ id: '1', template: 'precision', units: [u(0, 0)] }),
      source({ id: '2', template: 'precision', units: [u(0, 0)], status: 'needs-attention' }),
      source({ id: '3', template: 'precision', units: [u(0, 0)], method: 'overlay' }),
      source({ id: '4', template: 'precision', units: [u(0, 0)], method: 'none' }),
      source({ id: '5', template: 'precision', units: [u(0, 0)], computed: false }),
      source({ id: '6', template: 'precision', units: [u(0, 0)], method: 'manual' }),
    ]);
    expect(data.leftOut).toBe(4);
    expect(data.points['precision-prone'].map((p) => p.photoId).sort()).toEqual(['1', '6']);
  });
});

describe('filterByRange (patterns.md §3)', () => {
  const at = (date: string): PatternPoint => ({ xMm: 0, yMm: 0, ring: null, isX: null, zone: null, photoId: date, sessionId: date, sessionDate: date, sessionStamp: `${date}T08:00:00.000Z` });
  const points = [at('2026-06-01'), at('2026-07-15'), at('2026-08-25'), at('2026-09-18')];
  it('all keeps everything; 30 and 90 days count back from today', () => {
    expect(filterByRange(points, 'all', '2026-09-20')).toHaveLength(4);
    expect(filterByRange(points, '30', '2026-09-20').map((p) => p.sessionDate)).toEqual(['2026-08-25', '2026-09-18']);
    expect(filterByRange(points, '30', '2026-09-20')).not.toContainEqual(expect.objectContaining({ sessionDate: '2026-06-01' }));
  });
});

describe('filterByRange: this week and latest session (REV-77)', () => {
  const at = (sessionId: string, sessionDate: string, sessionStamp: string): PatternPoint => ({
    xMm: 0,
    yMm: 0,
    ring: null,
    isX: null,
    zone: null,
    photoId: `${sessionId}-photo`,
    sessionId,
    sessionDate,
    sessionStamp,
  });

  it('this week is the calendar week from Monday to today', () => {
    // 2026-09-20 is a Sunday, so the week began on Monday 2026-09-14.
    const points = [at('a', '2026-09-13', '2026-09-13T08:00:00Z'), at('b', '2026-09-14', '2026-09-14T08:00:00Z'), at('c', '2026-09-20', '2026-09-20T08:00:00Z')];
    expect(filterByRange(points, 'week', '2026-09-20').map((p) => p.sessionId)).toEqual(['b', 'c']);
    // On a Monday the week is just that day.
    expect(filterByRange(points, 'week', '2026-09-14').map((p) => p.sessionId)).toEqual(['b', 'c']);
    expect(filterByRange([at('a', '2026-09-13', 'x')], 'week', '2026-09-14')).toEqual([]);
  });

  it('the latest session is one session: the latest date, then the latest creation time, with all its points', () => {
    const points = [
      at('old', '2026-09-01', '2026-09-01T08:00:00Z'),
      at('morning', '2026-09-10', '2026-09-10T07:00:00Z'),
      at('evening', '2026-09-10', '2026-09-10T18:00:00Z'),
      at('evening', '2026-09-10', '2026-09-10T18:00:00Z'),
    ];
    expect(filterByRange(points, 'last', '2026-09-20').map((p) => p.sessionId)).toEqual(['evening', 'evening']);
    expect(filterByRange([], 'last', '2026-09-20')).toEqual([]);
  });
});

describe('summarizePatterns (patterns.md §4)', () => {
  const pt = (xMm: number, yMm: number, ring: number | null, zone: PatternPoint['zone'] = null, photoId = 'a', sessionId = 's'): PatternPoint => ({
    xMm,
    yMm,
    ring,
    isX: null,
    zone,
    photoId,
    sessionId,
    sessionDate: '2026-09-10',
    sessionStamp: '2026-09-10T08:00:00.000Z',
  });

  it('empty', () => {
    const s = summarizePatterns([], 'precision');
    expect(s).toMatchObject({ shots: 0, targets: 0, mpi: null, averageRing: null, thin: true, ellipse: null });
  });

  it('counts, mean point of impact, ring shares and thin flag', () => {
    const s = summarizePatterns([pt(2, 0, 10, null, 'a', 's1'), pt(4, 0, 8, null, 'b', 's2'), pt(0, 0, 10, null, 'b', 's2')], 'precision');
    expect(s).toMatchObject({ shots: 3, targets: 2, sessions: 2, thin: true, ellipse: null });
    expect(s.mpi).toEqual({ xMm: 2, yMm: 0 });
    expect(s.ringCounts![10]).toBe(2);
    expect(s.ringCounts![8]).toBe(1);
    expect(s.averageRing).toBeCloseTo(28 / 3, 9);
  });

  it('draws an ellipse only from ten shots up, and sighting reports the hit-zone share', () => {
    const many = Array.from({ length: 12 }, (_, i) => pt(i, (i % 3) - 1, null, i < 9 ? 'hit' : 'miss'));
    const s = summarizePatterns(many, 'sighting');
    expect(s.thin).toBe(false);
    expect(s.ellipse).not.toBeNull();
    expect(s.zoneHitShare).toBeCloseTo(9 / 12, 9);
  });
});

describe('renderPatternsSvg (patterns.md §5)', () => {
  const pt = (xMm: number, yMm: number): PatternPoint => ({ xMm, yMm, ring: 9, isX: false, zone: null, photoId: 'a', sessionId: 's', sessionDate: '2026-09-10', sessionStamp: '2026-09-10T08:00:00.000Z' });

  it('draws one dot per point and is deterministic', () => {
    const points = [pt(1, 1), pt(-3, 2), pt(0, -5)];
    const input = { kind: 'precision' as const, points, summary: summarizePatterns(points, 'precision'), factor: 1 };
    const svg = renderPatternsSvg(input);
    expect(svg.match(/class="pattern-dot"/g)).toHaveLength(3);
    expect(svg).toContain(`viewBox="0 0 ${PATTERNS_SIZE} ${PATTERNS_SIZE}"`);
    expect(renderPatternsSvg(input)).toBe(svg);
  });

  it('draws both targets with the same outer diameter, and one shared zoom-out keeps a stray on the paper in every view', () => {
    const halo = { precision: 82.7, sighting: 62.5 };
    expect(patternsScale('precision', 1) * halo.precision).toBeCloseTo(patternsScale('sighting', 1) * halo.sighting, 6);

    expect(patternsSizeFactor([{ kind: 'precision', points: [pt(0, 0)] }, { kind: 'sighting', points: [pt(1, 1)] }])).toBe(1);
    const shared = patternsSizeFactor([
      { kind: 'precision', points: [pt(0, 0)] },
      { kind: 'sighting', points: [pt(120, 0)] }, // a stray on the small sighting target only
    ]);
    expect(shared).toBeLessThan(1);
    expect(shared).toBeGreaterThanOrEqual(0.5);
    // The same factor is applied to both, so the two halos stay the same size.
    expect(patternsScale('precision', shared) * halo.precision).toBeCloseTo(patternsScale('sighting', shared) * halo.sighting, 6);
    expect(patternsScale('sighting', shared) * 120).toBeLessThanOrEqual(patternsScale('sighting', 1) * halo.sighting + 1e-6);
    expect(patternsSizeFactor([{ kind: 'precision', points: [pt(5000, 0)] }])).toBe(0.5);
  });
});
