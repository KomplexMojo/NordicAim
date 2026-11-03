// patterns.md §7 (REV-163): the Patterns coach image, "Group patterns". The coach images' header, a short key, one row per
// view (Sight in, Confirm, Precision prone, Precision standing) and the athlete line and credit at the foot. Pure SVG.

import type { PatternsCoachView } from '../patterns/coach';

import { coachFooter, coachHeader, coachSvg, COACH_FOOTER_HEIGHT, COACH_HEADER_HEIGHT, COACH_WIDTH } from './coach-frame';
import { PALETTE } from './palette';
import { renderPatternsCoachRow } from './patterns-coach-row';
import { el, text } from './svg';

/** Bump whenever this renderer's output changes. */
export const PATTERNS_COACH_RENDERER_VERSION = 1;

const KEY_HEIGHT = 100;

export interface PatternsCoachInput {
  /** The screen's range and season, as read in a sentence (`Last 10 sessions`, `Winter`). */
  rangeLabel: string;
  seasonLabel: string;
  views: readonly PatternsCoachView[];
  /** `patternsSizeFactor` over every recorded shot, so the drawings match the Patterns screen. */
  factor: number;
  provenance?: { name: string; club: string; stamp: string | null };
  release: string;
  generatedAtLocal: string;
}

function key(y: number): string {
  let out = el('rect', { x: 0, y, width: 8, height: KEY_HEIGHT - 20, fill: PALETTE.accent });
  out += text(40, y + 30, 18, 'Every recorded shot in the range, per kind of target. Sizes are at 50 m; group size is the widest spread.', {
    color: PALETTE.textPrimary,
  });
  out += text(40, y + 58, 16, 'Potential issues use provisional rules: a starting point to talk through with a coach, not a verdict.', {
    color: PALETTE.textSecondary,
  });
  return out;
}

/** §7: the whole image, and its size, so the build rasterises exactly what was drawn. */
export function renderPatternsCoach(input: PatternsCoachInput): { svg: string; width: number; height: number } {
  let body = coachHeader('Group patterns', `${input.rangeLabel} · ${input.seasonLabel} · generated ${input.generatedAtLocal}`);
  let y = COACH_HEADER_HEIGHT + 20;
  body += key(y);
  y += KEY_HEIGHT;
  for (const view of input.views) {
    const row = renderPatternsCoachRow(view, input.factor, y);
    body += row.svg;
    y += row.height;
  }
  const height = y + COACH_FOOTER_HEIGHT;
  body += coachFooter(y, input.provenance, input.release);
  return { svg: coachSvg(height, body), width: COACH_WIDTH, height };
}
