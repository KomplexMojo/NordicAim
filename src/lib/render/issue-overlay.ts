// REV-74: draws the chosen shooting-issue regions over a target diagram. Pure: the caller supplies the target's frame.

import { PRECISION_TEMPLATE, SIGHTING_TEMPLATE } from '../defaults/templates';
import { issueById, type IssueRegion } from '../issues/catalog';
import { el, text } from './svg';

/** Where the target sits in a drawing: its centre in drawing pixels and its pixels-per-mm. */
export interface TargetFrame {
  cx: number;
  cy: number;
  s: number;
}

/** One unit of the catalog (the black disc's radius), in mm, for each template. */
export function issueUnitMm(template: 'precision' | 'sighting'): number {
  return template === 'precision' ? PRECISION_TEMPLATE.blackDiameterMm / 2 : SIGHTING_TEMPLATE.zones.standing.solidDiameterMm / 2;
}

/** Distinct colours, so several overlays at once can be told apart. */
export const ISSUE_COLOURS = ['#E8890C', '#8B3FD9', '#0E9F6E', '#D6336C'] as const;

function region(r: IssueRegion, frame: TargetFrame, unitPx: number, colour: string): { svg: string; label: { x: number; y: number } } {
  const common = { fill: colour, 'fill-opacity': 0.22, stroke: colour, 'stroke-width': 3, 'stroke-dasharray': '12 7', class: 'issue-region' };
  if (r.kind === 'circle') {
    const x = frame.cx + r.x * unitPx;
    const y = frame.cy - r.y * unitPx;
    return { svg: el('circle', { cx: x, cy: y, r: r.r * unitPx, ...common }), label: { x, y } };
  }
  if (r.kind === 'ellipse') {
    const x = frame.cx + r.x * unitPx;
    const y = frame.cy - r.y * unitPx;
    return {
      svg: el('ellipse', { cx: x, cy: y, rx: r.rx * unitPx, ry: r.ry * unitPx, transform: `rotate(${-r.angleDeg} ${x} ${y})`, ...common }),
      label: { x, y },
    };
  }
  // A ring: an even-odd path (outer circle, inner circle) so the middle is left clear.
  const { cx, cy } = frame;
  const outer = r.outer * unitPx;
  const inner = r.inner * unitPx;
  const d =
    `M ${cx - outer} ${cy} a ${outer} ${outer} 0 1 0 ${2 * outer} 0 a ${outer} ${outer} 0 1 0 ${-2 * outer} 0 ` +
    `M ${cx - inner} ${cy} a ${inner} ${inner} 0 1 0 ${2 * inner} 0 a ${inner} ${inner} 0 1 0 ${-2 * inner} 0`;
  return { svg: el('path', { d, 'fill-rule': 'evenodd', ...common }), label: { x: cx, y: cy - (inner + outer) / 2 } };
}

/**
 * The overlay for the chosen issues, as one `<g>`. Unknown ids are skipped; nothing chosen gives an empty string. Each issue
 * gets its own colour, and its letter is written at its first region.
 */
export function renderIssueOverlays(ids: readonly string[], frame: TargetFrame, template: 'precision' | 'sighting'): string {
  const unitPx = issueUnitMm(template) * frame.s;
  let out = '';
  let n = 0;
  for (const id of ids) {
    const issue = issueById(id);
    if (issue === undefined) continue;
    const colour = ISSUE_COLOURS[n % ISSUE_COLOURS.length]!;
    n += 1;
    let first = true;
    let group = '';
    for (const r of issue.regions) {
      const drawn = region(r, frame, unitPx, colour);
      group += drawn.svg;
      if (first && issue.letter !== '') {
        group += text(drawn.label.x, drawn.label.y + 9, 28, issue.letter, { bold: true, color: colour, anchor: 'middle', class: 'issue-letter' });
      }
      first = false;
    }
    out += el('g', { class: 'issue-overlay', 'data-issue': id }, group);
  }
  return out === '' ? '' : el('g', { class: 'issue-overlays', 'pointer-events': 'none' }, out);
}

