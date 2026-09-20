// REV-79/80/86: the small marks on a diagram: the sighting role symbol, the score star and the position mark. Pure SVG.

import { medalFor } from '../scoring/medal';
import { el, text } from './svg';

/**
 * REV-79: the sighting diagram's top-left mark, in place of the text chip. A small black circle with a scatter of small shot holes
 * is the initial sight-in; a black circle with a scope's plus sign is the confirm.
 */
export function renderSightingRoleSymbol(role: 'sight-in' | 'confirm'): string {
  const cx = 48;
  const cy = 46;
  const disc = el('circle', { cx, cy, r: 24, fill: '#111111' });
  let mark = '';
  if (role === 'sight-in') {
    // A loose scatter, well inside the disc.
    for (const [dx, dy] of [[-10, -6], [4, -12], [11, 3], [-3, 2], [-12, 9], [5, 12], [0, -3]] as const) {
      mark += el('circle', { cx: cx + dx, cy: cy + dy, r: 2.6, fill: '#FFFFFF' });
    }
  } else {
    // Scope sight: a plus with a small gap at the centre, inside a fine ring.
    mark +=
      el('circle', { cx, cy, r: 15, fill: 'none', stroke: '#FFFFFF', 'stroke-width': 1.5 }) +
      el('line', { x1: cx - 18, y1: cy, x2: cx - 4, y2: cy, stroke: '#FFFFFF', 'stroke-width': 2.5 }) +
      el('line', { x1: cx + 4, y1: cy, x2: cx + 18, y2: cy, stroke: '#FFFFFF', 'stroke-width': 2.5 }) +
      el('line', { x1: cx, y1: cy - 18, x2: cx, y2: cy - 4, stroke: '#FFFFFF', 'stroke-width': 2.5 }) +
      el('line', { x1: cx, y1: cy + 4, x2: cx, y2: cy + 18, stroke: '#FFFFFF', 'stroke-width': 2.5 });
  }
  return el('g', { class: 'sighting-role-symbol', 'data-role': role }, disc + mark);
}

const MEDAL_COLOURS = {
  gold: { fill: '#F2B705', stroke: '#B58500' },
  silver: { fill: '#C5CBD3', stroke: '#8A929C' },
  bronze: { fill: '#CD7F32', stroke: '#8B5A22' },
} as const;

/** The points of a five-pointed star centred on (cx, cy): outer radius `outer`, inner radius `inner`, one point straight up. */
function starPoints(cx: number, cy: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(' ');
}

/**
 * REV-80: the precision target's score in a gold, silver or bronze star (`medalFor`), the score written inside it. `scale`
 * sizes it for the cell (1) or the detail diagram (larger).
 */
export function renderScoreStar(cx: number, cy: number, total: number, maxPossible: number, scale = 1): string {
  const medal = medalFor(total, maxPossible);
  if (medal === 'none') {
    // REV-107: under 70% no star, only the score in a plain circle.
    const circle = el('circle', { cx, cy, r: 30 * scale, fill: 'none', stroke: '#000000', 'stroke-width': 2.5 * scale });
    const value = text(cx, cy + 6 * scale, 17 * scale, String(total), { bold: true, anchor: 'middle', color: '#000000' });
    return el('g', { class: 'score-star', 'data-medal': 'none', 'data-score': String(total) }, circle + value);
  }
  const colours = MEDAL_COLOURS[medal];
  const star = el('polygon', {
    points: starPoints(cx, cy, 44 * scale, 21 * scale),
    fill: colours.fill,
    stroke: colours.stroke,
    'stroke-width': 2.5 * scale,
    'stroke-linejoin': 'round',
  });
  const label = text(cx, cy + 6 * scale, 17 * scale, String(total), { bold: true, anchor: 'middle', color: '#1B1F24' });
  return el('g', { class: 'score-star', 'data-medal': medal, 'data-score': String(total) }, star + label);
}

/**
 * REV-86: the precision diagram's top-left mark, in place of the text chip, in the same style as the sighting symbols: a black disc with a
 * white **horizontal** bar for prone (lying flat) or a white **vertical** bar for standing (upright).
 */
export function renderPositionSilhouette(position: 'prone' | 'standing'): string {
  const cx = 48;
  const cy = 46;
  const disc = el('circle', { cx, cy, r: 24, fill: '#111111' });
  const bar =
    position === 'prone'
      ? el('rect', { x: cx - 15, y: cy - 3.5, width: 30, height: 7, rx: 3.5, fill: '#FFFFFF' })
      : el('rect', { x: cx - 3.5, y: cy - 15, width: 7, height: 30, rx: 3.5, fill: '#FFFFFF' });
  const title = `<title>${position === 'standing' ? 'Standing' : 'Prone'}</title>`;
  return el('g', { class: 'position-silhouette', 'data-position': position }, title + disc + bar);
}
