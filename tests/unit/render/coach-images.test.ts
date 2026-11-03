import { describe, expect, it } from 'vitest';

import type { GoalLogEntry } from '@/lib/domain/goals';
import { goalsCoach } from '@/lib/goals/coach';
import type { PatternPoint, PatternView } from '@/lib/patterns/collect';
import { patternsCoach } from '@/lib/patterns/coach';
import { formatGap } from '@/lib/render/goals-coach-row';
import { renderGoalsCoach } from '@/lib/render/goals-coach';
import { renderPatternsCoach } from '@/lib/render/patterns-coach';
import { EMPTY_ROW_HEIGHT, ROW_HEIGHT } from '@/lib/render/patterns-coach-row';

// patterns.md §7 and goals.md §9 (REV-163): the Patterns and Goals coach images.

function pt(view: string, s: number, k: number): PatternPoint {
  const date = `2026-10-${String(1 + s).padStart(2, '0')}`;
  return { xMm: (k % 4) * 3, yMm: -Math.floor(k / 4) * 3, ring: 9, isX: false, zone: 'hit', photoId: `${view}-${s}`, sessionId: `s${s}`, sessionDate: date, sessionStamp: `${date}T10:00:00.000Z` };
}

function points(views: PatternView[], sessions: number, perTarget: number): Record<PatternView, PatternPoint[]> {
  const out: Record<PatternView, PatternPoint[]> = { 'sight-in': [], confirm: [], 'precision-prone': [], 'precision-standing': [] };
  for (const v of views) for (let s = 0; s < sessions; s += 1) for (let k = 0; k < perTarget; k += 1) out[v].push(pt(v, s, k));
  return out;
}

const frame = { release: 'abc1234', generatedAtLocal: '2026-11-03 18:00' };

describe('renderPatternsCoach', () => {
  it('is 1440 wide: header, key, a full row per view with shots, a short row per empty view, footer', () => {
    const views = patternsCoach(points(['precision-prone', 'sight-in'], 3, 10), { handedness: 'right', holeDiameterMm: 5.6 });
    const out = renderPatternsCoach({ rangeLabel: 'Last 5 sessions', seasonLabel: 'Winter', views, factor: 1, ...frame });
    expect(out.width).toBe(1440);
    expect(out.height).toBe(120 + 20 + 100 + 2 * ROW_HEIGHT + 2 * EMPTY_ROW_HEIGHT + 110);
    expect(out.svg).toContain(`height="${out.height}"`);
    expect(out.svg).toContain('>Group patterns<');
    expect(out.svg).toContain('Last 5 sessions · Winter · generated 2026-11-03 18:00');
    expect(out.svg).toContain('class="patterns-coach-row" data-view="confirm" data-empty="true"');
    expect(out.svg).not.toContain('NaN');
  });

  it('prints the boxes, target to target, where the shots land and the issues for a view with shots', () => {
    const views = patternsCoach(points(['precision-prone'], 3, 10), { handedness: 'right', holeDiameterMm: 5.6 });
    const { svg } = renderPatternsCoach({ rangeLabel: 'All sessions', seasonLabel: 'All seasons', views, factor: 1, ...frame });
    for (const id of ['group', 'radius', 'mpi', 'shape']) expect(svg).toContain(`data-metric="${id}"`);
    expect(svg).toContain('>Target to target<');
    expect(svg).toContain('Typical single target');
    expect(svg).toContain('>9: 100%<');
    expect(svg).toContain('Average ring 9.0');
    expect(svg).toContain('>Potential issues<');
    expect(svg).toContain('Score 90% · 30 shots · 3 targets · 3 sessions');
  });

  it('prints the athlete line in the foot when there is one', () => {
    const views = patternsCoach(points(['precision-prone'], 1, 10), { handedness: 'right', holeDiameterMm: 5.6 });
    const { svg } = renderPatternsCoach({ rangeLabel: 'Latest session', seasonLabel: 'All seasons', views, factor: 1, provenance: { name: 'A. Athlete', club: 'Ski Club', stamp: null }, ...frame });
    expect(svg).toContain('Athlete: A. Athlete · Ski Club');
    expect(svg).toContain('release abc1234');
  });
});

describe('renderGoalsCoach', () => {
  const entries: GoalLogEntry[] = [
    { id: '1', view: 'precision-prone', metric: 'score', value: 85, setAt: '2026-09-01T00:00:00.000Z' },
    { id: '2', view: 'precision-prone', metric: 'group', value: 0.01, setAt: '2026-09-01T00:00:00.000Z' },
    { id: '3', view: 'precision-standing', metric: 'score', value: 80, setAt: '2026-11-01T00:00:00.000Z' },
  ];
  const data = points(['precision-prone', 'precision-standing'], 4, 10);
  const coach = goalsCoach(entries, { 'precision-prone': data['precision-prone'], 'precision-standing': data['precision-standing'] }, 5.6);

  it('is 1440 wide with the scoreboard, then each goal view, and no NaN', () => {
    const out = renderGoalsCoach({ seasonLabel: 'All seasons', coach, ...frame });
    expect(out.width).toBe(1440);
    // Header, scoreboard, two views (heading + 2 goal rows + 2 empty rows for prone; 1 goal row + 3 empty for standing), footer.
    expect(out.height).toBe(120 + 20 + 250 + (70 + 2 * 170 + 2 * 90 + 10) + (70 + 170 + 3 * 90 + 10) + 110);
    expect(out.svg).toContain('>Goal progress<');
    expect(out.svg).toContain('>1 of 2 goals hit<');
    expect(out.svg).not.toContain('NaN');
  });

  it('marks each goal Hit, Not yet or waiting, and says how far is left to go', () => {
    const { svg } = renderGoalsCoach({ seasonLabel: 'All seasons', coach, ...frame });
    expect(svg).toContain('data-metric="score" data-hit="true"');
    expect(svg).toContain('data-metric="group" data-hit="false"');
    expect(svg).toContain('data-metric="score" data-hit="pending"');
    expect(svg).toContain('data-metric="rms" data-hit="none"');
    expect(svg).toContain('>Goal 85% or more · set Sep 1<');
    expect(svg).toContain(' to go<');
    expect(svg).toContain('No sessions since this goal was set');
    // Four sessions since the score goal, each 90%: all ringed as met, and a steady arrow.
    expect(svg.match(/class="goal-met"/g)?.length).toBe(4);
    expect(svg).toContain('data-trend="flat"');
  });

  it('gives a gap one decimal finer than the metric, so a small one never reads as zero', () => {
    expect(formatGap({ unit: '%' }, 0.4)).toBe('0.4%');
    expect(formatGap({ unit: 'MOA' }, 0.123)).toBe('0.12 MOA');
    expect(formatGap({ unit: 'mm' }, 2.25)).toBe('2.3 mm');
  });
});
