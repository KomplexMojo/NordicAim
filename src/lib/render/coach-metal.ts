// M29 (REV-159, coach-context-import.md §6): 545 Coach metal bouts as rows of five hit/miss discs, for the summary image's analysis
// band and the attach preview. Pure.

import type { MetalBoutRow } from '../domain/coach-context-view';
import { PALETTE } from './palette';
import { el, text } from './svg';

const ROW = 34;
export const METAL_DISC_R = 11;
const DISC_PITCH = 30;
/** Column x offsets from the section's left edge: combo, position, the first disc's centre, the hit count. */
const COL = { group: 0, position: 130, discs: 260 + METAL_DISC_R, hits: 260 + 4 * DISC_PITCH + 2 * METAL_DISC_R + 16 };

const POSITION_LABEL = { prone: 'Prone', standing: 'Standing' } as const;

/**
 * Five discs, alpha..echo left to right downrange (§4 `conventions.discOrder`), centred on `cy` from `x0`: a hit is a filled disc,
 * a miss an open ring (§6).
 */
export function renderMetalDiscs(discHits: readonly boolean[], x0: number, cy: number): string {
  return discHits
    .map((hit, i) =>
      el('circle', {
        cx: x0 + i * DISC_PITCH,
        cy,
        r: METAL_DISC_R,
        fill: hit ? PALETTE.discPrecision : PALETTE.page,
        stroke: PALETTE.discPrecision,
        'stroke-width': 2,
        'data-hit': String(hit),
      }),
    )
    .join('');
}

/**
 * The metal section: a `Metal targets (545 Coach)` header row with a rule, then one 34 px row per bout (combo on its first row,
 * position, the five discs, `n/5`). Starts with the header baseline at `y`; returns the last row's baseline.
 */
export function layoutMetalRows(rows: readonly MetalBoutRow[], x: number, y: number): { svg: string; lastY: number } {
  const ink = { color: PALETTE.textPrimary };
  const soft = { color: PALETTE.textSecondary };
  let svg = text(x + COL.group, y, 16, 'Metal targets (545 Coach)', { bold: true, ...soft });
  svg += text(x + COL.hits, y, 16, 'Hits', { bold: true, ...soft });
  svg += el('line', { x1: x, y1: y + 12, x2: x + COL.hits + 50, y2: y + 12, stroke: PALETTE.panelBorder, 'stroke-width': 1.5 });
  let rowY = y;
  for (const row of rows) {
    rowY += ROW;
    let inner = '';
    if (row.group !== '') inner += text(x + COL.group, rowY, 18, row.group, ink);
    inner += text(x + COL.position, rowY, 18, POSITION_LABEL[row.position], ink);
    inner += renderMetalDiscs(row.discHits, x + COL.discs, rowY - 6);
    inner += text(x + COL.hits, rowY, 18, `${row.hits}/${row.discHits.length}`, ink);
    svg += el('g', { class: 'metal-bout', 'data-position': row.position, 'data-hits': row.hits }, inner);
  }
  return { svg, lastY: rowY };
}
