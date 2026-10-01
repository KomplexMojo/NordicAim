// REV-154 (issue #29): the season filter on Patterns, Analysis, Goals and Home.

import { describe, expect, it } from 'vitest';

import { parseSeasonFilter, seasonMatches, SEASON_FILTERS, targetSeason } from '@/lib/domain/season';
import { collectPatterns, filterByRange, filterBySeason, type PatternPoint, type PatternSource } from '@/lib/patterns/collect';
import { parseViewRange, viewRangeSearch } from '@/lib/patterns/url';
import { seasonsBySession, sessionInSeason } from '@/lib/sessions/seasons';

describe('season filter values', () => {
  it('All first, then the four seasons', () => {
    expect(SEASON_FILTERS).toEqual(['all', 'winter', 'spring', 'summer', 'fall']);
  });

  it('a query value names a season, anything else is all', () => {
    expect(parseSeasonFilter('winter')).toBe('winter');
    expect(parseSeasonFilter(null)).toBe('all');
    expect(parseSeasonFilter('monsoon')).toBe('all');
  });

  it("a target's season: the chosen one, else its capture date's, else the session date's", () => {
    expect(targetSeason('summer', '2026-01-10T10:00:00', '2026-01-10')).toBe('summer');
    expect(targetSeason(null, '2026-01-10T10:00:00', '2026-07-01')).toBe('winter');
    expect(targetSeason(undefined, null, '2026-04-02')).toBe('spring');
    expect(targetSeason(null, null, null)).toBeNull();
  });

  it('a target with no season passes only All', () => {
    expect(seasonMatches(null, 'all')).toBe(true);
    expect(seasonMatches(null, 'fall')).toBe(false);
    expect(seasonMatches('fall', 'fall')).toBe(true);
    expect(seasonMatches('fall', 'winter')).toBe(false);
  });
});

describe('Patterns points carry their season', () => {
  const src = (id: string, session: string, date: string, season?: 'winter' | 'summer'): PatternSource => ({
    sessionId: session,
    sessionDate: date,
    sessionStamp: `${date}T08:00:00.000Z`,
    photo: {
      id,
      sessionId: session,
      status: 'analyzed',
      captureTime: { local: null, offset: null, utc: null, source: 'exif' },
      importedAt: `${date}T00:00:00.000Z`,
      categorization: { template: 'precision', sightingRole: null },
      ...(season === undefined ? {} : { season }),
    },
    analysis: {
      pipeline: { alignment: { method: 'cv', confidence: 1 } } as never,
      computed: {
        engineVersion: '1',
        result: { template: 'precision', all: { units: [{ shotId: id, unitIndex: 0, xMm: 0, yMm: 0, radialMm: 0, ring: 10, isX: null, zone: null, position: 'prone' }] } } as never,
      },
    },
  });

  it('by the chosen season, else the session date, and the filter keeps only that season', () => {
    const data = collectPatterns([src('a', 's1', '2026-01-10'), src('b', 's2', '2026-09-10', 'winter'), src('c', 's3', '2026-07-10')]);
    const prone = data.points['precision-prone'];
    expect(prone.map((p) => p.season)).toEqual(['winter', 'winter', 'summer']);
    expect(filterBySeason(prone, 'winter').map((p) => p.photoId)).toEqual(['a', 'b']);
    expect(filterBySeason(prone, 'all')).toBe(prone);
  });

  it('applied before the date range, so Latest session under a season is that season\'s latest session', () => {
    const at = (id: string, date: string, season: 'winter' | 'summer'): PatternPoint => ({
      xMm: 0, yMm: 0, ring: null, isX: null, zone: null, photoId: id, sessionId: id, sessionDate: date, sessionStamp: `${date}T08:00:00.000Z`, season,
    });
    const points = [at('w1', '2026-01-10', 'winter'), at('w2', '2026-02-10', 'winter'), at('s1', '2026-07-10', 'summer')];
    expect(filterByRange(filterBySeason(points, 'winter'), 'last', '2026-10-01').map((p) => p.photoId)).toEqual(['w2']);
  });
});

describe('the season in the address', () => {
  it('is left out for All and round-trips otherwise', () => {
    expect(viewRangeSearch('confirm', '90')).toBe('view=confirm&range=90');
    expect(viewRangeSearch('confirm', '90', 'all')).toBe('view=confirm&range=90');
    const search = viewRangeSearch('confirm', '90', 'spring');
    expect(search).toBe('view=confirm&range=90&season=spring');
    expect(parseViewRange(new URLSearchParams(search))).toEqual({ view: 'confirm', range: '90', season: 'spring' });
  });
});

describe('Home: a session belongs to the seasons of its targets', () => {
  const photo = (sessionId: string, season: 'winter' | 'summer' | null, local: string | null, origin: 'import' | 'backing-card' = 'import') => ({
    sessionId,
    origin: origin as never,
    season,
    captureTime: { local, offset: null, utc: null, source: 'exif' as const },
  });
  const seasons = seasonsBySession([
    photo('s1', 'winter', null),
    photo('s1', null, '2026-07-02T10:00:00'),
    photo('s2', null, null),
    photo('s3', 'summer', null, 'backing-card'),
  ]);

  it('any target in the season keeps the session', () => {
    const s1 = { id: 's1', sessionDate: '2026-07-02' };
    expect(sessionInSeason(s1, seasons, 'winter')).toBe(true);
    expect(sessionInSeason(s1, seasons, 'summer')).toBe(true);
    expect(sessionInSeason(s1, seasons, 'fall')).toBe(false);
  });

  it('an undated target, or a session with no targets (a backing card is not one), goes by the session date', () => {
    expect(sessionInSeason({ id: 's2', sessionDate: '2026-10-01' }, seasons, 'fall')).toBe(true);
    expect(sessionInSeason({ id: 's3', sessionDate: '2026-10-01' }, seasons, 'fall')).toBe(true);
    expect(sessionInSeason({ id: 's3', sessionDate: '2026-10-01' }, seasons, 'summer')).toBe(false);
    expect(sessionInSeason({ id: 's9', sessionDate: '2026-12-24' }, undefined, 'winter')).toBe(true);
  });

  it('All keeps every session', () => {
    expect(sessionInSeason({ id: 's1', sessionDate: '2026-07-02' }, seasons, 'all')).toBe(true);
  });
});
