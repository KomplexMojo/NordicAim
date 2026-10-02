// patterns.md §1–§3: which recorded shots belong to which Patterns view. Pure: no clock, no storage.

import type { TargetAnalysis, UnitResult } from '../domain/analysis';
import type { Season } from '../domain/enums';
import type { TargetPhoto } from '../domain/photo';
import { seasonMatches, targetSeason, type SeasonFilter } from '../domain/season';
import { sightingRoles } from '../domain/sighting-role';

export const PATTERN_VIEWS = ['sight-in', 'confirm', 'precision-prone', 'precision-standing'] as const;
export type PatternView = (typeof PATTERN_VIEWS)[number];

export const PATTERN_VIEW_LABEL: Record<PatternView, string> = {
  'sight-in': 'Sight in',
  confirm: 'Confirm',
  'precision-prone': 'Precision prone',
  'precision-standing': 'Precision standing',
};

/** REV-156: how many of the most recent sessions to show, broadest last; `last` is one, `all` is every session. */
export type PatternRange = 'last' | '3' | '5' | '10' | '20' | 'all';

/** patterns.md §3: each range as read in a sentence (the coach image's subtitle, analysis.md §5, and `ViewRangeControls`'s
 * accessible label — its visible tick text is its own, shorter set). */
export const PATTERN_RANGE_LABEL: Record<PatternRange, string> = {
  last: 'Latest session',
  '3': 'Last 3 sessions',
  '5': 'Last 5 sessions',
  '10': 'Last 10 sessions',
  '20': 'Last 20 sessions',
  all: 'All sessions',
};

export interface PatternSource {
  sessionId: string;
  /** `YYYY-MM-DD`. */
  sessionDate: string;
  /** When the session was created (ISO), to tell two sessions on the same day apart. */
  sessionStamp: string;
  photo: Pick<TargetPhoto, 'id' | 'sessionId' | 'status' | 'captureTime' | 'importedAt' | 'season'> & {
    categorization: Pick<TargetPhoto['categorization'], 'template' | 'sightingRole'>;
  };
  analysis: Pick<TargetAnalysis, 'computed' | 'pipeline'> | null;
}

export interface PatternPoint {
  xMm: number;
  yMm: number;
  ring: number | null;
  isX: boolean | null;
  zone: UnitResult['zone'];
  photoId: string;
  sessionId: string;
  sessionDate: string;
  sessionStamp: string;
  /** REV-154: the season its target counts in (`targetSeason`); absent or null = no season, shown only under All. */
  season?: Season | null;
}

export interface PatternData {
  points: Record<PatternView, PatternPoint[]>;
  /** Targets left out because they are not analysed with a measured or confirmed alignment. */
  leftOut: number;
}

/** patterns.md §2. */
export function isIncluded(source: PatternSource): boolean {
  const { photo, analysis } = source;
  if (photo.status !== 'analyzed' || analysis === null || analysis.computed === null) return false;
  const method = analysis.pipeline.alignment.method;
  return method === 'cv' || method === 'manual';
}

function toPoint(unit: UnitResult, source: PatternSource): PatternPoint {
  return {
    xMm: unit.xMm,
    yMm: unit.yMm,
    ring: unit.ring,
    isX: unit.isX,
    zone: unit.zone,
    photoId: source.photo.id,
    sessionId: source.sessionId,
    sessionDate: source.sessionDate,
    sessionStamp: source.sessionStamp,
    season: targetSeason(source.photo.season, source.photo.captureTime.local, source.sessionDate),
  };
}

export function collectPatterns(sources: PatternSource[]): PatternData {
  const points: Record<PatternView, PatternPoint[]> = { 'sight-in': [], confirm: [], 'precision-prone': [], 'precision-standing': [] };
  let leftOut = 0;

  const sightingBySession = new Map<string, PatternSource[]>();
  const sessionSighting = new Map<string, PatternSource['photo'][]>();
  for (const source of sources) {
    if (source.photo.categorization.template === 'sighting') {
      const all = sessionSighting.get(source.sessionId) ?? [];
      all.push(source.photo);
      sessionSighting.set(source.sessionId, all);
    }
    if (!isIncluded(source)) {
      leftOut += 1;
      continue;
    }
    const result = source.analysis!.computed!.result;
    if (result.template === 'precision') {
      for (const unit of result.all.units) {
        points[unit.position === 'standing' ? 'precision-standing' : 'precision-prone'].push(toPoint(unit, source));
      }
    } else {
      const list = sightingBySession.get(source.sessionId) ?? [];
      list.push(source);
      sightingBySession.set(source.sessionId, list);
    }
  }

  for (const list of sightingBySession.values()) {
    // Roles are worked out over every sighting target in the session, so a target left out here still counts for inference.
    const roles = sightingRoles(sessionSighting.get(list[0]!.sessionId) ?? list.map((s) => s.photo));
    for (const source of list) {
      const view: PatternView = roles.get(source.photo.id) === 'confirm' ? 'confirm' : 'sight-in';
      for (const unit of source.analysis!.computed!.result.all.units) points[view].push(toPoint(unit, source));
    }
  }
  return { points, leftOut };
}

/** How many sessions each range keeps; `null` keeps every one. */
export const RANGE_SESSIONS: Record<PatternRange, number | null> = { last: 1, '3': 3, '5': 5, '10': 10, '20': 20, all: null };

/**
 * patterns.md §3 (REV-156): the points of the most recent N sessions that have points here, newest by session date, then
 * by creation time. Counting sessions, not days, means a season (filtered first) never empties a range by itself.
 */
export function filterByRange(points: PatternPoint[], range: PatternRange): PatternPoint[] {
  const keep = RANGE_SESSIONS[range];
  if (keep === null) return points;
  const newest = new Map<string, { date: string; stamp: string }>();
  for (const p of points) if (!newest.has(p.sessionId)) newest.set(p.sessionId, { date: p.sessionDate, stamp: p.sessionStamp });
  const kept = new Set(
    [...newest.entries()]
      .sort(([, a], [, b]) => (a.date === b.date ? (a.stamp < b.stamp ? 1 : a.stamp > b.stamp ? -1 : 0) : a.date < b.date ? 1 : -1))
      .slice(0, keep)
      .map(([id]) => id),
  );
  return points.filter((p) => kept.has(p.sessionId));
}

/** REV-154 (issue #29): only the shots whose target counts in `season`; `all` keeps everything. Applied before the range. */
export function filterBySeason(points: PatternPoint[], season: SeasonFilter): PatternPoint[] {
  return season === 'all' ? points : points.filter((p) => seasonMatches(p.season, season));
}
