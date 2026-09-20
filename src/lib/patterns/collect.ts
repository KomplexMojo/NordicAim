// patterns.md §1–§3: which recorded shots belong to which Patterns view. Pure: no clock, no storage.

import type { TargetAnalysis, UnitResult } from '../domain/analysis';
import type { TargetPhoto } from '../domain/photo';
import { sightingRoles } from '../domain/sighting-role';

export const PATTERN_VIEWS = ['sight-in', 'confirm', 'precision-prone', 'precision-standing'] as const;
export type PatternView = (typeof PATTERN_VIEWS)[number];

export const PATTERN_VIEW_LABEL: Record<PatternView, string> = {
  'sight-in': 'Sight in',
  confirm: 'Confirm',
  'precision-prone': 'Precision prone',
  'precision-standing': 'Precision standing',
};

export type PatternRange = '30' | '90' | 'all';

export interface PatternSource {
  sessionId: string;
  /** `YYYY-MM-DD`. */
  sessionDate: string;
  photo: Pick<TargetPhoto, 'id' | 'sessionId' | 'status' | 'captureTime' | 'importedAt'> & {
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

/** patterns.md §3: `today` is `YYYY-MM-DD`, supplied by the caller. */
export function filterByRange(points: PatternPoint[], range: PatternRange, today: string): PatternPoint[] {
  if (range === 'all') return points;
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - Number(range));
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  return points.filter((p) => p.sessionDate >= cutoffDate);
}
