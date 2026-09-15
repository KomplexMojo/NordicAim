// rendering-composite.md §3 item 11 (REV-24). Pure, deterministic placement of the small marker labels
// (`x<k>`, "MPI") so they don't sit on top of shots, the MPI marker, or each other.

export interface Circle {
  x: number;
  y: number;
  r: number;
}

/** Axis-aligned box in SVG pixels (+y down). */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface LabelRequest {
  text: string;
  sizePx: number;
  color: string;
  /** The marker the label belongs to; candidates are arranged around it. */
  anchor: Circle;
  /** Spec default text origin (x = left edge, y = baseline). Tried first. */
  preferred: { x: number; y: number };
}

export interface PlacedLabel {
  text: string;
  sizePx: number;
  color: string;
  x: number;
  y: number;
  box: Box;
}

const CHAR_WIDTH_EM = 0.62; // generous for bold system-font digits and capitals
const ASCENT_EM = 0.75;
const DESCENT_EM = 0.25;
const PAD_PX = 2; // half the 4 px label outline
const GAPS_PX = [4, 12, 20];

function textWidth(text: string, sizePx: number): number {
  return text.length * CHAR_WIDTH_EM * sizePx;
}

/** The estimated box a label occupies, including its outline. */
export function labelBox(text: string, sizePx: number, x: number, baselineY: number): Box {
  return {
    left: x - PAD_PX,
    top: baselineY - ASCENT_EM * sizePx - PAD_PX,
    right: x + textWidth(text, sizePx) + PAD_PX,
    bottom: baselineY + DESCENT_EM * sizePx + PAD_PX,
  };
}

export function circleHitsBox(c: Circle, b: Box): boolean {
  const nearestX = Math.min(Math.max(c.x, b.left), b.right);
  const nearestY = Math.min(Math.max(c.y, b.top), b.bottom);
  const dx = c.x - nearestX;
  const dy = c.y - nearestY;
  return dx * dx + dy * dy < c.r * c.r;
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function insideArea(b: Box, area: Box): boolean {
  return b.left >= area.left && b.right <= area.right && b.top >= area.top && b.bottom <= area.bottom;
}

/** Text origins to try: the preferred one, then NE, E, SE, S, SW, W, NW, N around the anchor at each gap. */
export function labelCandidates(req: LabelRequest): Array<{ x: number; y: number }> {
  const { x, y, r } = req.anchor;
  const w = textWidth(req.text, req.sizePx);
  const ascent = ASCENT_EM * req.sizePx;
  const middle = y + 0.35 * req.sizePx;
  const d = r * Math.SQRT1_2;
  const out = [req.preferred];
  for (const g of GAPS_PX) {
    out.push(
      { x: x + d + g, y: y - d - g },
      { x: x + r + g, y: middle },
      { x: x + d + g, y: y + d + g + ascent },
      { x: x - w / 2, y: y + r + g + ascent },
      { x: x - d - g - w, y: y + d + g + ascent },
      { x: x - r - g - w, y: middle },
      { x: x - d - g - w, y: y - d - g },
      { x: x - w / 2, y: y - r - g },
    );
  }
  return out;
}

/**
 * Places labels in request order. Each takes the first candidate inside `area` that hits no obstacle and
 * no earlier label; if none is clear, the in-area candidate with the fewest collisions (earliest wins
 * ties); if none fits the area, the preferred position.
 */
export function placeLabels(requests: LabelRequest[], obstacles: Circle[], area: Box): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  for (const req of requests) {
    let best: PlacedLabel | null = null;
    let bestHits = Number.POSITIVE_INFINITY;
    for (const candidate of labelCandidates(req)) {
      const box = labelBox(req.text, req.sizePx, candidate.x, candidate.y);
      if (!insideArea(box, area)) continue;
      const hits =
        obstacles.filter((o) => circleHitsBox(o, box)).length + placed.filter((p) => boxesOverlap(p.box, box)).length;
      if (hits < bestHits) {
        best = { text: req.text, sizePx: req.sizePx, color: req.color, x: candidate.x, y: candidate.y, box };
        bestHits = hits;
        if (hits === 0) break;
      }
    }
    if (best === null) {
      const { x, y } = req.preferred;
      best = { text: req.text, sizePx: req.sizePx, color: req.color, x, y, box: labelBox(req.text, req.sizePx, x, y) };
    }
    placed.push(best);
  }
  return placed;
}
