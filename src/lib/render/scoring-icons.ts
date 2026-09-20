// REV-81: one small mark per scoring rule, so a score can be read with how it was measured. Pure SVG builders.
//
// Each is a dark disc with white line-work in the same language as the sighting symbols: a vertical ring line, and a hole against it.
//   gauge   — a full-size hole just touching the line from inside (the whole hole reaches the line)
//   centre  — a full-size hole across the line with a dot at its centre (only the centre counts)
//   visible — a smaller hole touching the line (the hole you can see)

import type { ScoringRule } from '../domain/settings';
import { SCORING_RULE_LABEL } from '../domain/settings';
import { el } from './svg';

const R = 22;

export function renderScoringIcon(rule: ScoringRule, cx: number, cy: number, scale = 1): string {
  const s = scale;
  const lineX = cx + 8 * s;
  const white = '#FFFFFF';
  const disc = el('circle', { cx, cy, r: R * s, fill: '#111111' });
  const line = el('line', { x1: lineX, y1: cy - 16 * s, x2: lineX, y2: cy + 16 * s, stroke: white, 'stroke-width': 2.5 * s });
  const hx = rule === 'gauge' ? lineX - 10 * s : rule === 'centre' ? lineX - 3 * s : lineX - 5 * s;
  const holeR = rule === 'visible' ? 5 * s : 10 * s;
  const hole =
    el('circle', { cx: hx, cy, r: holeR, fill: 'none', stroke: white, 'stroke-width': 2 * s }) +
    (rule === 'centre' ? el('circle', { cx: hx, cy, r: 2.2 * s, fill: white }) : '');
  const title = `<title>${SCORING_RULE_LABEL[rule]}</title>`;
  return el('g', { class: 'scoring-icon', 'data-rule': rule }, title + disc + line + hole);
}
