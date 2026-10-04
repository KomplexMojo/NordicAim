// REV-124 (analysis.md §5): the canonical payload a coach image's stamp covers — the athlete, the range and every session
// value per view and metric (REV-131: the image draws their averages, which follow from them). Pure and deterministic, like `payload.ts`: changing any single value changes the string.

import type { CoachTrends } from '../analysis/coach';

export interface TrendsProvenanceInput {
  name: string;
  club: string;
  rangeLabel: string;
  release: string;
  createdAt: string;
  trends: CoachTrends;
}

function round(value: number | null): number | null {
  if (value === null) return null;
  const r = Math.round(value * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

export function buildTrendsPayload(input: TrendsProvenanceInput): string {
  return JSON.stringify({
    v: 1,
    kind: 'trends',
    name: input.name,
    club: input.club,
    range: input.rangeLabel,
    release: input.release,
    createdAt: input.createdAt,
    sessions: input.trends.sessions.map((s) => s.sessionId),
    metrics: input.trends.metrics.map((m) => ({ id: m.id, series: m.series.map((s) => ({ view: s.view, values: s.values.map(round) })) })),
  });
}
