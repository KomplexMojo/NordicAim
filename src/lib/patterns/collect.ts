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

export type PatternRange = 'last' | '7' | '14' | '30' | '90' | 'all';

/** patterns.md §3: each range as read in a sentence (the coach image's subtitle, analysis.md §5, and `ViewRangeControls`'s
 * accessible label — its visible tick text is its own, shorter set). */
export const PATTERN_RANGE_LABEL: Record<PatternRange, string> = {
  last: 'Latest session',
  '7': '7 days',
  '14': '14 days',
  '30': '30 days',
  '90': '90 days',
  all: 'All time',
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

/**
 * patterns.md §3: `today` is `YYYY-MM-DD`, supplied by the caller. `last` is the most recent session that has points here
 * (latest session date, then latest creation time); `7`, `14`, `30` and `90` count back that many days from today.
 */
export function filterByRange(points: PatternPoint[], range: PatternRange, today: string): PatternPoint[] {
  if (range === 'all') return points;
  if (range === 'last') {
    let latest: PatternPoint | null = null;
    for (const p of points) {
      if (latest === null || p.sessionDate > latest.sessionDate || (p.sessionDate === latest.sessionDate && p.sessionStamp > latest.sessionStamp)) {
        latest = p;
      }
    }
    return latest === null ? [] : points.filter((p) => p.sessionId === latest.sessionId);
  }
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - Number(range));
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  return points.filter((p) => p.sessionDate >= cutoffDate);
}

/** REV-154 (issue #29): only the shots whose target counts in `season`; `all` keeps everything. Applied before the date range. */
export function filterBySeason(points: PatternPoint[], season: SeasonFilter): PatternPoint[] {
  return season === 'all' ? points : points.filter((p) => seasonMatches(p.season, season));
}
