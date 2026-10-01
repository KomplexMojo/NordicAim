// REV-148 (goals.md §8): the summary image's goal marks — a seal on a precision target whose session met every goal in effect
// for its position, and the band's per-goal rows. Pure SVG.

import type { GoalView } from '../domain/goals';
import { goalCheckLabel, type SessionGoalChecks } from '../goals/session';
import { PATTERN_VIEW_LABEL } from '../patterns/collect';
import type { GoalBandRow } from './composite-band';
import { PALETTE } from './palette';
import { el } from './svg';

/** A precision target's goal view, from the position its result was scored in; a `both` target has none. */
export function goalViewOf(position: string): GoalView | null {
  if (position === 'prone') return 'precision-prone';
  if (position === 'standing') return 'precision-standing';
  return null;
}

/** A white tick, centred on (cx, cy), `size` across. */
export function tickPath(cx: number, cy: number, size: number, colour: string, width: number): string {
  const s = size / 2;
  const d = `M${cx - s} ${cy} L${cx - s * 0.3} ${cy + s * 0.65} L${cx + s} ${cy - s * 0.7}`;
  return el('path', { d, fill: 'none', stroke: colour, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
}

/** A cross, centred on (cx, cy), `size` across. */
export function crossPath(cx: number, cy: number, size: number, colour: string, width: number): string {
  const s = size / 2;
  const d = `M${cx - s} ${cy - s} L${cx + s} ${cy + s} M${cx + s} ${cy - s} L${cx - s} ${cy + s}`;
  return el('path', { d, fill: 'none', stroke: colour, 'stroke-width': width, 'stroke-linecap': 'round' });
}

/**
 * The "goals met" seal: a green disc with a white tick, ringed in white, drawn in a precision cell's right-hand column under the
 * scoring-rule icon (cell (664, 198)), clear of the target's halo.
 */
export function renderGoalsSeal(cx: number, cy: number): string {
  const disc = el('circle', { cx, cy, r: 26, fill: PALETTE.goalMet, stroke: '#FFFFFF', 'stroke-width': 3 });
  return el('g', { class: 'goals-seal', 'data-goals': 'met' }, disc + tickPath(cx, cy, 24, '#FFFFFF', 5));
}

/** The band's rows: one per goal in effect, grouped by view (the view named on its first row only). */
export function goalBandRows(goals: SessionGoalChecks | undefined): GoalBandRow[] {
  if (goals === undefined) return [];
  const rows: GoalBandRow[] = [];
  for (const view of ['precision-prone', 'precision-standing'] as const) {
    const checks = goals[view]?.checks ?? [];
    checks.forEach((check, i) => {
      const label = goalCheckLabel(view, check);
      rows.push({ view: i === 0 ? PATTERN_VIEW_LABEL[view] : '', metric: label.title, value: label.value, goal: label.goal, met: check.met });
    });
  }
  return rows;
}
