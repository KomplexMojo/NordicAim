import { describe, expect, it } from 'vitest';

import { goalsCoach } from '@/lib/goals/coach';
import type { PatternPoint } from '@/lib/patterns/collect';
import { patternsCoach } from '@/lib/patterns/coach';
import { buildGoalsCoachPayload, buildPatternsCoachPayload } from '@/lib/provenance/payload-coach';

// REV-163: what the Patterns and Goals coach images' stamps cover. Deterministic, and any printed number changes it.

function pt(sessionId: string, xMm: number): PatternPoint {
  return { xMm, yMm: 0, ring: 9, isX: false, zone: 'hit', photoId: `${sessionId}-p`, sessionId, sessionDate: '2026-10-01', sessionStamp: '2026-10-01T10:00:00.000Z' };
}

const common = { name: 'A', club: 'C', release: 'abc', createdAt: '2026-11-03T12:00:00.000Z' };
const options = { handedness: 'right' as const, holeDiameterMm: 5.6 };

describe('buildPatternsCoachPayload', () => {
  const views = (x: number) => patternsCoach({ 'sight-in': [], confirm: [], 'precision-prone': [pt('s1', 0), pt('s1', x)], 'precision-standing': [] }, options);

  it('is the same string for the same input and changes with a shot', () => {
    const a = buildPatternsCoachPayload({ ...common, rangeLabel: 'All sessions', seasonLabel: 'All seasons', views: views(1) });
    expect(buildPatternsCoachPayload({ ...common, rangeLabel: 'All sessions', seasonLabel: 'All seasons', views: views(1) })).toBe(a);
    expect(buildPatternsCoachPayload({ ...common, rangeLabel: 'All sessions', seasonLabel: 'All seasons', views: views(2) })).not.toBe(a);
    const parsed = JSON.parse(a) as { kind: string; season: string; views: Array<{ view: string; sessions: string[] }> };
    expect(parsed.kind).toBe('patterns');
    expect(parsed.season).toBe('All seasons');
    expect(parsed.views.find((v) => v.view === 'precision-prone')!.sessions).toEqual(['s1']);
  });
});

describe('buildGoalsCoachPayload', () => {
  const coach = (value: number) =>
    goalsCoach([{ id: '1', view: 'precision-prone', metric: 'score', value, setAt: '2026-09-01T00:00:00.000Z' }], { 'precision-prone': [pt('s1', 0)], 'precision-standing': [] }, 5.6);

  it('is the same string for the same input and changes with a goal', () => {
    const a = buildGoalsCoachPayload({ ...common, seasonLabel: 'All seasons', coach: coach(80) });
    expect(buildGoalsCoachPayload({ ...common, seasonLabel: 'All seasons', coach: coach(80) })).toBe(a);
    expect(buildGoalsCoachPayload({ ...common, seasonLabel: 'All seasons', coach: coach(81) })).not.toBe(a);
    const parsed = JSON.parse(a) as { kind: string; hit: number; judged: number };
    expect(parsed).toMatchObject({ kind: 'goals', hit: 1, judged: 1 });
  });
});
