// REV-118: the summary image's analysis band, laid out as a small table on the left and the session notes in a box on the right, instead
// of one ragged list of lines. Pure: takes a model, returns its height and its SVG.

import { PALETTE } from './palette';
import { renderScoringIcon } from './scoring-icons';
import { el, text } from './svg';

const WIDTH = 1440;
const ROW = 34;
const RULES = ['gauge', 'centre', 'visible'] as const;
type Rule = (typeof RULES)[number];

export interface BandRow {
  label: string;
  /** A sighting target's MPI offset, e.g. `3.5 R / 21.9 D mm`; null for none. */
  mpi: string | null;
  /** The score under each rule (precision: the total; sighting: the hits), or null when not compared. */
  scores: Record<Rule, string> | null;
}

export interface BandModel {
  /** `Scoring: <method>`. */
  scoring: string;
  rows: BandRow[];
  showMpi: boolean;
  showRules: boolean;
  /** Extra plain lines under the table (a single target's footer lines, `+N more target(s)`). */
  extra: string[];
  notes: string | null;
  athlete: string | null;
  footer: string;
}

const NOTES_X = 980;
const NOTES_W = 420;
const NOTES_CHARS = 44;
const NOTES_MAX_LINES = 8;

/** Word-wraps `notes` to the box, at most `NOTES_MAX_LINES` lines, the last ending in `…` when more remains. */
export function wrapNotes(notes: string): string[] {
  const words = notes.trim().split(/\s+/).filter((w) => w.length > 0);
  const lines: string[] = [];
  let current = '';
  for (const raw of words) {
    const word = raw.length > NOTES_CHARS ? `${raw.slice(0, NOTES_CHARS - 1)}…` : raw;
    if (current === '') current = word;
    else if (current.length + 1 + word.length <= NOTES_CHARS) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current !== '') lines.push(current);
  if (lines.length <= NOTES_MAX_LINES) return lines;
  const kept = lines.slice(0, NOTES_MAX_LINES);
  const last = kept[NOTES_MAX_LINES - 1]!;
  kept[NOTES_MAX_LINES - 1] = `${last.length >= NOTES_CHARS ? last.slice(0, NOTES_CHARS - 1) : last}…`;
  return kept;
}

export function layoutBand(model: BandModel, bandY: number): { height: number; svg: string } {
  const ink = { color: PALETTE.textPrimary };
  const soft = { color: PALETTE.textSecondary };
  let body = text(40, bandY + 56, 24, 'Session analysis', { bold: true, ...ink });

  // Left column.
  let y = bandY + 100;
  body += text(40, y, 18, model.scoring, ink);
  const hasTable = model.rows.length > 0 && (model.showMpi || model.showRules);
  if (hasTable) {
    y += 46;
    const mpiX = 250;
    const rulesX = model.showMpi ? 500 : 250;
    const colX = (i: number) => rulesX + i * 150;
    // Header: the rule icons sit once, over their columns.
    if (model.showMpi) body += text(mpiX, y, 16, 'MPI offset', { bold: true, ...soft });
    if (model.showRules) {
      RULES.forEach((rule, i) => {
        body += renderScoringIcon(rule, colX(i) + 14, y - 6, 0.64);
        body += text(colX(i) + 36, y, 16, rule, { bold: true, ...soft });
      });
    }
    body += el('line', { x1: 40, y1: y + 12, x2: model.showRules ? colX(2) + 110 : mpiX + 230, y2: y + 12, stroke: PALETTE.panelBorder, 'stroke-width': 1.5 });
    for (const row of model.rows) {
      y += ROW;
      body += text(40, y, 18, row.label, ink);
      if (model.showMpi && row.mpi !== null) body += text(mpiX, y, 18, row.mpi, ink);
      if (model.showRules && row.scores !== null) {
        RULES.forEach((rule, i) => {
          body += text(colX(i) + 36, y, 18, row.scores![rule], ink);
        });
      }
    }
  }
  for (const line of model.extra) {
    y += ROW;
    body += text(40, y, 18, line, ink);
  }
  const leftBottom = y + 16;

  // Right column: the session notes in a box.
  let boxBottom = 0;
  if (model.notes !== null && model.notes.trim() !== '') {
    const lines = wrapNotes(model.notes);
    const boxY = bandY + 28;
    const boxH = 56 + lines.length * 26 + 16;
    body += el('rect', { x: NOTES_X, y: boxY, width: NOTES_W, height: boxH, rx: 12, fill: PALETTE.page, stroke: PALETTE.panelBorder, 'stroke-width': 1.5 });
    body += text(NOTES_X + 20, boxY + 34, 18, 'Session notes', { bold: true, ...ink });
    lines.forEach((line, i) => {
      body += text(NOTES_X + 20, boxY + 66 + i * 26, 17, line, ink);
    });
    boxBottom = boxY + boxH;
  }

  // Athlete line and footer across the bottom, never truncated.
  const contentBottom = Math.max(leftBottom, boxBottom);
  let bottom = contentBottom;
  if (model.athlete !== null) {
    bottom = contentBottom + 32;
    body += text(40, bottom, 18, model.athlete, ink);
  }
  const footerY = bottom + 44;
  body += text(40, footerY, 13, model.footer, soft);
  const height = footerY + 28 - bandY;

  const panel = el('rect', { x: 0, y: bandY, width: WIDTH, height, fill: PALETTE.panel });
  const rail = el('rect', { x: 0, y: bandY, width: 8, height, fill: PALETTE.accent });
  return { height, svg: panel + rail + body };
}
