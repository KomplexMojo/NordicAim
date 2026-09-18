// M16 R4 (REV-37). The owner's labelled holes from the 2026-09-17 detection review, and the matcher
// `pnpm cv:eval` gates detection on. Node-only; the labels live in gitignored `fixtures/private/`, so
// every caller must cope with them being absent (CI).

import { existsSync, readFileSync } from 'node:fs';

import type { TemplateId } from '@/lib/domain/enums';
import type { CalibrationLike } from '@/lib/geometry/transform';

export const LABELLED_HOLES_RELATIVE_PATH = 'fixtures/private/review/ground-truth-holes-v2.json';

/** R4: a detection matches a labelled hole within this many hole diameters (the owner tapped by eye). */
export const MATCH_HOLE_DIAMETERS = 0.8;

/**
 * Floors on the gated set. R4 set both at 0.85 provisionally, "the owner may move them"; the owner's
 * re-rating of 2026-09-18 moved the recall floor, and DESIGN-REVISIONS 2026-09-18 records why.
 *
 * **Precision stays at 0.85** and passes with room to spare (93.8%): a false detection is a phantom shot
 * in someone's score, so this floor must not move.
 *
 * **Recall is 0.72 against a measured 76.2%**, because reaching 0.85 by tuning was tried and rejected.
 * The glyph filter discards 807 candidates across the 41 targets of which only 25 are real holes, so
 * admitting them costs 493 false detections and takes precision to 37.9%; no measured feature separates
 * them. Hand-written features are at their ceiling on bare paper. The remaining gap is closed by
 * **M21** (the ambiguous candidates are offered to the user, measured at 83.3% recall with precision
 * unchanged) and **M19** (a coloured backing, where hue separates what shape and brightness cannot).
 * This floor is therefore a "do not regress" line, not a target: it leaves ~4 points of headroom.
 */
export const GATE_RECALL_MIN = 0.72;
export const GATE_PRECISION_MIN = 0.85;

/**
 * R4: the first detector's numbers in the owner's review, reported alongside every run.
 *
 * Measured against the **v1** labels, so it is no longer directly comparable with the numbers above,
 * which are measured against the corrected v2 set. The v1 labels were incomplete — holes the first
 * detector never showed the owner counted as false positives — which understated precision by about
 * 13 points. Treat the baseline as a direction of travel, not a difference.
 */
export const REVIEW_BASELINE: Record<'all' | TemplateId, { recall: number; precision: number }> = {
  all: { recall: 0.53, precision: 0.61 },
  precision: { recall: 0.54, precision: 0.54 },
  sighting: { recall: 0.51, precision: 0.87 },
};

export interface LabelledHole {
  xPx: number;
  yPx: number;
  xMm: number;
  yMm: number;
  source: string;
}

export interface LabelledPhoto {
  id: string;
  name: string;
  template: TemplateId;
  /** [width, height] of the 1200 px working image the labels are in. */
  workingSize: [number, number];
  calibrationUsed: CalibrationLike;
  holes: LabelledHole[];
  /** Why this photo's labels are unreliable; caveated photos are reported but never gated. */
  caveat: string | null;
}

export interface LabelledSet {
  photos: LabelledPhoto[];
  /** Photos in the review with no target, or whose target was not found. */
  withoutTarget: string[];
}

interface RawEntry {
  name: string;
  template?: TemplateId;
  workingSize?: [number, number];
  calibrationUsed?: CalibrationLike;
  holes?: LabelledHole[];
  caveat?: string | null;
}

/** Parses the labels file's JSON text. */
export function parseLabelledHoles(text: string): LabelledSet {
  const raw = JSON.parse(text) as { entries: Record<string, RawEntry> };
  const photos: LabelledPhoto[] = [];
  const withoutTarget: string[] = [];
  for (const [id, entry] of Object.entries(raw.entries)) {
    if (entry.holes === undefined || entry.template === undefined || entry.calibrationUsed === undefined) {
      withoutTarget.push(id);
      continue;
    }
    photos.push({
      id,
      name: entry.name,
      template: entry.template,
      workingSize: entry.workingSize ?? [0, 0],
      calibrationUsed: entry.calibrationUsed,
      holes: entry.holes,
      caveat: entry.caveat ?? null,
    });
  }
  photos.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { photos, withoutTarget };
}

/** Loads the labels, or null when the private file is absent. */
export function loadLabelledHoles(repoRoot: string): LabelledSet | null {
  const path = `${repoRoot}${LABELLED_HOLES_RELATIVE_PATH}`;
  return existsSync(path) ? parseLabelledHoles(readFileSync(path, 'utf-8')) : null;
}

/** R4: the match tolerance in working px, from the calibration's own scale. */
export function matchTolerancePx(calibration: CalibrationLike, holeDiameterMm: number): number {
  return MATCH_HOLE_DIAMETERS * holeDiameterMm * (calibration.radiusPx / (calibration.anchorDiameterMm / 2));
}

export interface PointPx {
  x: number;
  y: number;
}

export interface LabelledMatch {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  /** Indices into `detections` that matched no labelled hole — each one for the owner to confirm. */
  unmatchedDetections: number[];
  recall: number;
  precision: number;
}

/** R4: greedy matching in working px, closest pairs first, each side used at most once. */
export function matchLabelled(detections: PointPx[], holes: PointPx[], tolerancePx: number): LabelledMatch {
  const pairs: Array<{ d: number; h: number; distance: number }> = [];
  detections.forEach((det, d) => {
    holes.forEach((hole, h) => {
      const distance = Math.hypot(det.x - hole.x, det.y - hole.y);
      if (distance <= tolerancePx) pairs.push({ d, h, distance });
    });
  });
  pairs.sort((a, b) => a.distance - b.distance || a.d - b.d || a.h - b.h);
  const usedDetections = new Set<number>();
  const usedHoles = new Set<number>();
  for (const pair of pairs) {
    if (usedDetections.has(pair.d) || usedHoles.has(pair.h)) continue;
    usedDetections.add(pair.d);
    usedHoles.add(pair.h);
  }
  const tp = usedDetections.size;
  return {
    truePositives: tp,
    falsePositives: detections.length - tp,
    falseNegatives: holes.length - tp,
    unmatchedDetections: detections.map((_, i) => i).filter((i) => !usedDetections.has(i)),
    recall: holes.length === 0 ? 1 : tp / holes.length,
    precision: detections.length === 0 ? (holes.length === 0 ? 1 : 0) : tp / detections.length,
  };
}

export interface Totals {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
}

/** Pooled recall and precision over several photos (never an average of per-photo ratios). */
export function pooled(matches: Totals[]): { recall: number; precision: number } & Totals {
  const t = matches.reduce(
    (sum, m) => ({
      truePositives: sum.truePositives + m.truePositives,
      falsePositives: sum.falsePositives + m.falsePositives,
      falseNegatives: sum.falseNegatives + m.falseNegatives,
    }),
    { truePositives: 0, falsePositives: 0, falseNegatives: 0 },
  );
  const labelled = t.truePositives + t.falseNegatives;
  const detected = t.truePositives + t.falsePositives;
  return {
    ...t,
    recall: labelled === 0 ? 1 : t.truePositives / labelled,
    precision: detected === 0 ? (labelled === 0 ? 1 : 0) : t.truePositives / detected,
  };
}

/** R4: the gate passes when both pooled figures clear their floors. */
export function passesGate(result: { recall: number; precision: number }): boolean {
  return result.recall >= GATE_RECALL_MIN && result.precision >= GATE_PRECISION_MIN;
}
