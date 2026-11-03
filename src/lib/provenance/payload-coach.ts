// REV-163 (patterns.md §7, goals.md §9): the canonical payloads the Patterns and Goals coach images' stamps cover — the
// athlete, the filters and every number the image prints. Pure and deterministic, like `payload-trends.ts`: changing any
// single value changes the string.

import type { GoalsCoach } from '../goals/coach';
import type { PatternsCoachView } from '../patterns/coach';

function round(value: number | null): number | null {
  if (value === null) return null;
  const r = Math.round(value * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

interface Common {
  name: string;
  club: string;
  release: string;
  createdAt: string;
}

export function buildPatternsCoachPayload(input: Common & { rangeLabel: string; seasonLabel: string; views: readonly PatternsCoachView[] }): string {
  return JSON.stringify({
    v: 1,
    kind: 'patterns',
    name: input.name,
    club: input.club,
    range: input.rangeLabel,
    season: input.seasonLabel,
    release: input.release,
    createdAt: input.createdAt,
    views: input.views.map((v) => ({
      view: v.view,
      sessions: [...new Set(v.points.map((p) => p.sessionId))].sort(),
      shots: v.summary.shots,
      targets: v.summary.targets,
      groupMoa: round(v.summary.extremeSpreadMoa),
      meanRadiusMoa: round(v.characteristics.meanRadiusMoa),
      mpi: v.summary.mpi === null ? null : [round(v.summary.mpi.xMm), round(v.summary.mpi.yMm)],
      averageRing: round(v.summary.averageRing),
      zoneHitShare: round(v.summary.zoneHitShare),
      outsideShare: round(v.characteristics.outsideShare),
      typicalTargetMoa: round(v.typicalTargetMoa),
      issues: v.issues.map((i) => ({ id: i.id, targets: i.targets, wholeSet: i.wholeSet })),
    })),
  });
}

export function buildGoalsCoachPayload(input: Common & { seasonLabel: string; coach: GoalsCoach }): string {
  const { coach } = input;
  return JSON.stringify({
    v: 1,
    kind: 'goals',
    name: input.name,
    club: input.club,
    season: input.seasonLabel,
    release: input.release,
    createdAt: input.createdAt,
    hit: coach.hit,
    judged: coach.judged,
    sessionsAllMet: coach.sessionsAllMet,
    sessionsWithGoals: coach.sessionsWithGoals,
    views: coach.views.map((v) => ({
      view: v.view,
      metrics: v.metrics.map((m) => ({
        metric: m.metric,
        goal: m.goal === null ? null : round(m.goal.value),
        setAt: m.goal?.setAt ?? null,
        average: round(m.progress?.average ?? null),
        hit: m.progress?.hit ?? null,
        since: m.since.map((s) => [s.sessionId, round(s.value)]),
      })),
    })),
  });
}
