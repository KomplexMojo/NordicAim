// goals.md §9 (REV-163): the Goals coach image, "Goal progress". The coach images' header, a scoreboard (goals hit, per
// position, sessions that met every goal, the latest session), one section per goal view, and the athlete line and credit at
// the foot. Pure SVG.

import type { GoalsCoach } from '../goals/coach';

import { coachFooter, coachHeader, coachSvg, COACH_FOOTER_HEIGHT, COACH_HEADER_HEIGHT, COACH_WIDTH } from './coach-frame';
import { renderGoalsCoachView } from './goals-coach-row';
import { PALETTE } from './palette';
import { el, num, text } from './svg';
import { shortDate } from './trends-averages';

/** Bump whenever this renderer's output changes. */
export const GOALS_COACH_RENDERER_VERSION = 1;

const SCOREBOARD_HEIGHT = 250;
const GAUGE_RADIUS = 80;

const SHORT: Record<string, string> = { 'precision-prone': 'Prone', 'precision-standing': 'Standing' };

export interface GoalsCoachInput {
  seasonLabel: string;
  coach: GoalsCoach;
  provenance?: { name: string; club: string; stamp: string | null };
  release: string;
  generatedAtLocal: string;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function gauge(cx: number, cy: number, hit: number, judged: number): string {
  const circumference = 2 * Math.PI * GAUGE_RADIUS;
  let out = el('circle', { cx, cy, r: GAUGE_RADIUS, fill: 'none', stroke: PALETTE.haloFill, 'stroke-width': 22 });
  if (judged > 0 && hit > 0) {
    out += el('circle', {
      class: 'goals-gauge',
      cx,
      cy,
      r: GAUGE_RADIUS,
      fill: 'none',
      stroke: PALETTE.goalMet,
      'stroke-width': 22,
      'stroke-dasharray': `${num((circumference * hit) / judged)} ${num(circumference)}`,
      transform: `rotate(-90 ${num(cx)} ${num(cy)})`,
    });
  }
  out += text(cx, cy + 14, 40, judged === 0 ? '—' : `${hit}/${judged}`, { anchor: 'middle', bold: true, color: PALETTE.textPrimary });
  return out;
}

function scoreboard(coach: GoalsCoach, y: number): string {
  let out = el('rect', { x: 20, y, width: COACH_WIDTH - 40, height: SCOREBOARD_HEIGHT - 20, fill: '#FFFFFF', stroke: PALETTE.panelBorder, 'stroke-width': 1 });
  out += gauge(140, y + 115, coach.hit, coach.judged);
  const headline = coach.judged === 0 ? 'No goals judged yet' : `${coach.hit} of ${plural(coach.judged, 'goal', 'goals')} hit`;
  out += text(260, y + 70, 34, headline, { bold: true, color: PALETTE.textPrimary });
  const waiting = coach.set - coach.judged;
  const sub = waiting > 0 ? `Averages since each goal was set · ${waiting} waiting for a session` : 'Averaged over the sessions since each goal was set';
  out += text(260, y + 104, 18, sub, {
    color: PALETTE.textSecondary,
  });
  coach.views.forEach((v, i) => {
    const x = 260 + i * 290;
    out += el('rect', { x, y: y + 132, width: 276, height: 70, rx: 10, fill: PALETTE.panel, stroke: PALETTE.panelBorder, 'stroke-width': 1 });
    out += text(x + 16, y + 158, 16, SHORT[v.view] ?? v.view, { color: PALETTE.textSecondary });
    const value = v.set === 0 ? 'No goals set' : v.judged === 0 ? 'No sessions yet' : `${v.hit} of ${v.judged} hit`;
    out += text(x + 16, y + 188, 22, value, { bold: true, color: PALETTE.textPrimary });
  });

  const rx = 910;
  out += el('line', { x1: 880, y1: y + 30, x2: 880, y2: y + 200, stroke: PALETTE.panelBorder, 'stroke-width': 1 });
  out += text(rx, y + 60, 18, 'Sessions that met every goal in effect', { color: PALETTE.textSecondary });
  out += text(rx, y + 102, 34, coach.sessionsWithGoals === 0 ? '—' : `${coach.sessionsAllMet} of ${coach.sessionsWithGoals}`, {
    bold: true,
    color: PALETTE.textPrimary,
  });
  if (coach.latest === null) {
    out += text(rx, y + 150, 18, 'No session has had a goal yet', { color: PALETTE.textSecondary });
  } else {
    out += text(rx, y + 150, 18, `Latest session, ${shortDate(coach.latest.sessionDate)}`, { color: PALETTE.textSecondary });
    const line = coach.latest.views.map((v) => `${SHORT[v.view] ?? v.view} ${v.met} of ${v.of}`).join(' · ');
    out += text(rx, y + 182, 20, `Met ${line}`, { bold: true, color: coach.latest.allMet ? PALETTE.goalMet : PALETTE.textPrimary });
  }
  return el('g', { class: 'goals-coach-scoreboard' }, out);
}

/** §9: the whole image, and its size, so the build rasterises exactly what was drawn. */
export function renderGoalsCoach(input: GoalsCoachInput): { svg: string; width: number; height: number } {
  let body = coachHeader('Goal progress', `${input.seasonLabel} · generated ${input.generatedAtLocal}`);
  let y = COACH_HEADER_HEIGHT + 20;
  body += scoreboard(input.coach, y);
  y += SCOREBOARD_HEIGHT;
  for (const view of input.coach.views) {
    const section = renderGoalsCoachView(view, y);
    body += section.svg;
    y += section.height + 10;
  }
  const height = y + COACH_FOOTER_HEIGHT;
  body += coachFooter(y, input.provenance, input.release);
  return { svg: coachSvg(height, body), width: COACH_WIDTH, height };
}
