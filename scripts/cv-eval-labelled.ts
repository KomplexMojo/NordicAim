// M16 R4 (REV-37). Gates shot detection on the owner's labelled holes. Node-only; called by
// `scripts/cv-eval.ts`. The labels and photos are gitignored, so everything here is skipped — loudly —
// when they are absent (CI).

import { calibrationWithPerspective } from '../src/lib/cv/alignment-perspective.ts';
import { detectAnchor } from '../src/lib/cv/anchor.ts';
import { detectShotCandidates, type DetectionReport } from '../src/lib/cv/holes.ts';
import type { OpenCv } from '../src/lib/cv/opencv.ts';
import { equivalentDiameterMm, HOLE_DIAMETER_TOLERANCE } from '../src/lib/cv/multiplicity.ts';
import { suggestShots } from '../src/lib/cv/suggestions.ts';
import { inNumeralBox } from '../src/lib/cv/print-mask.ts';
import { hintTemplate } from '../src/lib/cv/template-hint.ts';
import { PRECISION_TEMPLATE } from '../src/lib/defaults/templates.ts';
import { CONFIDENT_HOLE_MIN } from '../src/lib/scoring/reconcile.ts';
import { mmToPx } from '../src/lib/geometry/transform.ts';
import {
  GATE_PRECISION_MIN,
  GATE_RECALL_MIN,
  LABELLED_HOLES_RELATIVE_PATH,
  REVIEW_BASELINE,
  loadLabelledHoles,
  matchLabelled,
  matchTolerancePx,
  passesGate,
  pooled,
  type LabelledMatch,
  type LabelledPhoto,
} from '../tests/helpers/labelled-holes.ts';
import { jpegFileToRgba } from '../tests/helpers/rgba.ts';

const WORKING_LONGEST = 1200;
const HOLE_DIAMETER_MM = 5.6;

export interface LabelledEvaluation {
  lines: string[];
  /** True when the gate ran and failed. */
  failed: boolean;
}

function table(header: string[], rows: string[][]): string {
  return [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

interface PhotoRun {
  photo: LabelledPhoto;
  report: DetectionReport | null;
  match: LabelledMatch | null;
  ms: number;
  /** REV-44: time spent measuring the printed circles for the tilt (0 when not run). */
  perspectiveMs: number;
  /** REV-44: whether the tilt measurement succeeded (null when not run). */
  tilted: boolean | null;
  /** Detections in working px, parallel to `report.candidates`. */
  detectionsPx: Array<{ x: number; y: number }>;
}

/**
 * The pipeline's own A4 and template hint, then A5 — exactly what the app runs. `perspective: false`
 * is the pre-M18 A4 (the detected disc alone), kept so the report shows what REV-44 changed.
 */
async function runPhoto(cv: OpenCv, repoRoot: string, photo: LabelledPhoto, perspective: boolean): Promise<PhotoRun> {
  const img = await jpegFileToRgba(`${repoRoot}fixtures/private/additional references/${photo.name}`, WORKING_LONGEST);
  const t0 = performance.now();
  const detection = detectAnchor(cv, img, null, 'both');
  if (detection === null) {
    return { photo, report: null, match: null, ms: performance.now() - t0, perspectiveMs: 0, tilted: null, detectionsPx: [] };
  }
  const template = hintTemplate(cv, img, detection.calibration).template;
  // The worker's A4 (REV-44): no overlay template on an import, so the hint picks the circles.
  const t1 = performance.now();
  const refined = perspective ? calibrationWithPerspective(img, detection.calibration, template) : null;
  const perspectiveMs = perspective ? performance.now() - t1 : 0;
  const calibration = refined ?? detection.calibration;
  const report = detectShotCandidates(cv, img, calibration, template, HOLE_DIAMETER_MM);
  const ms = performance.now() - t0;
  const detectionsPx = report.candidates.map((c) => mmToPx(c, calibration));
  const match = matchLabelled(
    detectionsPx,
    photo.holes.map((h) => ({ x: h.xPx, y: h.yPx })),
    matchTolerancePx(calibration, HOLE_DIAMETER_MM),
  );
  return { photo, report, match, ms, perspectiveMs, tilted: perspective ? refined !== null : null, detectionsPx };
}

/**
 * M21 step 5 (REV-40): the suggestion rule's yield on the gated photos, REPORTED and never gated, so the
 * rule can be re-measured as the sample grows. A suggestion "lands on" a labelled hole within the same
 * 0.8 hole diameters the detection match uses; "new" counts labelled holes no detection matched that a
 * suggestion lands on, i.e. the recall accepting every real suggestion would add.
 */
function suggestionYieldReport(gated: PhotoRun[]): string[] {
  const perPhoto: number[] = [];
  let total = 0;
  let onHole = 0;
  let newHoles = 0;
  let labelled = 0;
  let detected = 0;
  let falseDetections = 0;
  for (const run of gated) {
    labelled += run.photo.holes.length;
    if (run.report === null || run.match === null) {
      perPhoto.push(0);
      continue;
    }
    detected += run.match.truePositives;
    falseDetections += run.match.falsePositives;
    const suggestions = suggestShots(run.report.rejected, HOLE_DIAMETER_MM);
    perPhoto.push(suggestions.length);
    total += suggestions.length;
    const radius = 0.8 * HOLE_DIAMETER_MM;
    const matchedDetections = run.report.candidates.filter((_, i) => !run.match!.unmatchedDetections.includes(i));
    const credited = new Set<number>();
    for (const s of suggestions) {
      const hit = run.photo.holes.findIndex((h) => Math.hypot(h.xMm - s.xMm, h.yMm - s.yMm) <= radius);
      if (hit < 0) continue;
      onHole += 1;
      const hole = run.photo.holes[hit]!;
      const alreadyFound = matchedDetections.some((c) => Math.hypot(c.xMm - hole.xMm, c.yMm - hole.yMm) <= radius);
      if (!alreadyFound && !credited.has(hit)) {
        credited.add(hit);
        newHoles += 1;
      }
    }
  }
  const sorted = [...perPhoto].sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1] ?? 0;
  const recallNow = labelled === 0 ? 0 : detected / labelled;
  const recallAll = labelled === 0 ? 0 : (detected + newHoles) / labelled;
  const precisionAll = detected + newHoles + falseDetections === 0 ? 1 : (detected + newHoles) / (detected + newHoles + falseDetections);
  return [
    '\n### Suggested holes (M21 step 5, REV-40; REPORTED, never gated)\n',
    `Rule: reason glyph/paper/mark-score, radial <= 60 mm, elongation <= 6, stroke >= 0.70 mm, best 3 by rank. On ${gated.length} gated photos:`,
    `- suggestions: ${total} (median ${median} per photo, max ${sorted[sorted.length - 1] ?? 0}); ${onHole} land within 0.8 hole diameters of a labelled hole (${pct(total === 0 ? 0 : onHole / total)} of suggestions).`,
    `- labelled holes no detection found that a suggestion lands on: ${newHoles}. Accepting every real suggestion: recall ${pct(recallNow)} -> ${pct(recallAll)}, precision ${pct(precisionAll)} (unconfirmed suggestions are never counted).`,
    '- NOTE: the labels are approximate (the owner tapped by eye); this matches positions, not the owner\'s per-candidate judgement in the review export.',
  ];
}

/**
 * M21 step 3 (REV-41), REPORTED: why the standard path supplies no hole width. Over detections that match
 * a labelled hole (nearly all single shots: 13 of 41 targets hold one multi-shot hole), the blob's
 * equivalent diameter against the one-shot bound 5.6 mm x (1 + 5%). A usable width would sit near 5.6 mm.
 */
function standardWidthReport(gated: PhotoRun[]): string[] {
  const widths: number[] = [];
  for (const run of gated) {
    if (run.report === null || run.match === null) continue;
    run.report.candidates.forEach((c, i) => {
      if (!run.match!.unmatchedDetections.includes(i)) widths.push(equivalentDiameterMm(c.areaMm2));
    });
  }
  widths.sort((a, b) => a - b);
  const q = (p: number) => (widths[Math.floor(p * (widths.length - 1))] ?? 0).toFixed(1);
  const bound = HOLE_DIAMETER_MM * (1 + HOLE_DIAMETER_TOLERANCE);
  const wide = widths.filter((w) => w > bound).length;
  return [
    `- REV-41 width on the standard path: equivalent diameter of ${widths.length} matched detections p10 ${q(0.1)} / p50 ${q(0.5)} / p90 ${q(0.9)} mm; ` +
      `${pct(widths.length === 0 ? 0 : wide / widths.length)} read wider than ${bound.toFixed(2)} mm, so the standard path offers no double-punch prompt (M21 Open questions).`,
  ];
}

/** M20 step 2: the precision the reject rule relies on, at CONFIDENT_HOLE_MIN and around it. */
const CONFIDENT_PRECISION_MIN = 0.98;

function confidentHoleReport(gated: PhotoRun[]): string[] {
  const scored: Array<{ confidence: number; real: boolean }> = [];
  for (const run of gated) {
    if (run.report === null || run.match === null) continue;
    const unmatched = new Set(run.match.unmatchedDetections);
    run.report.candidates.forEach((c, i) => scored.push({ confidence: c.confidence, real: !unmatched.has(i) }));
  }
  const at = (t: number) => {
    const above = scored.filter((s) => s.confidence >= t);
    const real = above.filter((s) => s.real).length;
    return { n: above.length, real, precision: above.length === 0 ? 1 : real / above.length };
  };
  // The lowest threshold at which precision is at least the floor at every higher threshold too.
  const thresholds = [...new Set(scored.map((s) => s.confidence))].sort((a, b) => a - b);
  const stable = thresholds.find((t) => thresholds.every((u) => u < t || at(u).precision >= CONFIDENT_PRECISION_MIN)) ?? null;
  const totalReal = scored.filter((s) => s.real).length;
  const rows = [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, CONFIDENT_HOLE_MIN, 0.97].map((t) => {
    const r = at(t);
    return [t.toFixed(2), String(r.n), String(r.n - r.real), pct(r.precision), pct(totalReal === 0 ? 0 : r.real / totalReal)];
  });
  const chosen = at(CONFIDENT_HOLE_MIN);
  return [
    `\n### Confident holes (M20 step 2, REV-39)\n`,
    `Standard-path detections on the gated photos: ${scored.length}, of which ${totalReal} match a labelled hole. ` +
      `A hole is confident at confidence >= CONFIDENT_HOLE_MIN (${CONFIDENT_HOLE_MIN}); only confident holes can reject a target.\n`,
    table(['confidence >=', 'detections', 'false', 'precision', 'share of real holes'], rows),
    `- Lowest threshold with precision >= ${CONFIDENT_PRECISION_MIN} at it and every higher threshold: ${stable === null ? 'none' : stable.toFixed(4)}.`,
    `- At CONFIDENT_HOLE_MIN: precision ${pct(chosen.precision)} on ${chosen.n} detections` +
      `${chosen.precision >= CONFIDENT_PRECISION_MIN ? '' : ` — BELOW ${CONFIDENT_PRECISION_MIN}: re-measure CONFIDENT_HOLE_MIN`}.`,
  ];
}

export async function evaluateLabelled(cv: OpenCv, repoRoot: string): Promise<LabelledEvaluation> {
  const lines: string[] = [];
  const set = loadLabelledHoles(repoRoot);
  lines.push('\n### Detection vs the owner\'s labelled holes (M16 R4, REV-37)\n');
  if (set === null) {
    lines.push(
      `NO LABELLED HOLES: \`${LABELLED_HOLES_RELATIVE_PATH}\` is absent (it is gitignored, so this is\n` +
        'expected in CI). Detection quality on real photos is UNVERIFIED by this run, and nothing is gated.',
    );
    return { lines, failed: false };
  }

  const runs: PhotoRun[] = [];
  const squareOnRuns: PhotoRun[] = [];
  for (const photo of set.photos) {
    runs.push(await runPhoto(cv, repoRoot, photo, true));
    squareOnRuns.push(await runPhoto(cv, repoRoot, photo, false));
  }

  const rows = runs.map((run) => {
    const { photo, report, match } = run;
    const rotation = report?.numeralRotation;
    return [
      photo.id,
      photo.template,
      String(photo.holes.length),
      report === null ? 'no anchor' : String(report.candidates.length),
      match === null ? '—' : String(match.truePositives),
      match === null ? '—' : String(match.falsePositives),
      match === null ? String(photo.holes.length) : String(match.falseNegatives),
      match === null ? '0.00' : match.recall.toFixed(2),
      match === null ? '—' : match.precision.toFixed(2),
      report === null ? '—' : report.sheet.method,
      rotation ? `${rotation.deg.toFixed(1)}°${rotation.reliable ? '' : ' (weak)'}` : '—',
      `${Math.round(run.ms)}`,
      photo.caveat === null ? 'gated' : 'CAVEAT',
    ];
  });
  lines.push(`Match: greedy in working px within 0.8 x hole diameter. Gate: recall >= ${GATE_RECALL_MIN} and precision >= ${GATE_PRECISION_MIN} on the gated (uncaveated) photos.\n`);
  lines.push(
    table(['photo', 'template', 'labelled', 'detected', 'TP', 'FP', 'FN', 'recall', 'precision', 'sheet', 'numeral rot', 'A4+A5 ms', 'set'], rows),
  );

  const matchOf = (run: PhotoRun): LabelledMatch =>
    run.match ?? { truePositives: 0, falsePositives: 0, falseNegatives: run.photo.holes.length, unmatchedDetections: [], recall: 0, precision: 0 };
  const gated = runs.filter((run) => run.photo.caveat === null);
  const caveated = runs.filter((run) => run.photo.caveat !== null);
  const summary: string[][] = [];
  const all = pooled(gated.map(matchOf));
  for (const key of ['all', 'precision', 'sighting'] as const) {
    const subset = key === 'all' ? gated : gated.filter((run) => run.photo.template === key);
    const result = pooled(subset.map(matchOf));
    summary.push([
      `gated · ${key}`,
      String(subset.length),
      `${result.truePositives}/${result.falsePositives}/${result.falseNegatives}`,
      pct(result.recall),
      pct(result.precision),
      `${pct(REVIEW_BASELINE[key].recall)} / ${pct(REVIEW_BASELINE[key].precision)}`,
    ]);
  }
  const squareOnGated = pooled(squareOnRuns.filter((run) => run.photo.caveat === null).map(matchOf));
  summary.push([
    'gated · all, pre-M18 A4 (no tilt)',
    String(gated.length),
    `${squareOnGated.truePositives}/${squareOnGated.falsePositives}/${squareOnGated.falseNegatives}`,
    pct(squareOnGated.recall),
    pct(squareOnGated.precision),
    '—',
  ]);
  const cav = pooled(caveated.map(matchOf));
  summary.push(['caveated (not gated)', String(caveated.length), `${cav.truePositives}/${cav.falsePositives}/${cav.falseNegatives}`, pct(cav.recall), pct(cav.precision), '—']);
  lines.push('\nPer template, pooled over photos, against the 2026-09-17 review baseline:\n');
  lines.push(table(['set', 'photos', 'TP/FP/FN', 'recall', 'precision', 'baseline recall / precision'], summary));
  for (const run of caveated) lines.push(`- caveat ${run.photo.id}: ${run.photo.caveat}`);
  lines.push(`- photos in the review without a target (not run): ${set.withoutTarget.join(', ') || 'none'}`);

  // R3: how often segmentation fell back.
  const withReport = runs.filter((run) => run.report !== null);
  const fallbacks = withReport.filter((run) => run.report?.sheet.method === 'fallback').map((run) => run.photo.id);
  lines.push(
    `- R3 sheet segmentation fell back to the 105 mm circle on ${fallbacks.length} of ${withReport.length} photos with a target` +
      `${fallbacks.length > 0 ? ` (${fallbacks.join(', ')})` : ''}.`,
  );
  const times = runs.map((run) => run.ms).sort((a, b) => a - b);
  lines.push(`- A4+A5 time in Node per photo: median ${Math.round(times[times.length >> 1] ?? 0)} ms, max ${Math.round(times[times.length - 1] ?? 0)} ms.`);
  const tiltRuns = runs.filter((run) => run.tilted !== null);
  const tiltTimes = tiltRuns.map((run) => run.perspectiveMs).sort((a, b) => a - b);
  const notTilted = tiltRuns.filter((run) => run.tilted === false).map((run) => run.photo.id);
  lines.push(
    `- REV-44 tilt measurement (part of A4): median ${Math.round(tiltTimes[tiltTimes.length >> 1] ?? 0)} ms, max ${Math.round(tiltTimes[tiltTimes.length - 1] ?? 0)} ms in Node; ` +
      `fell back to perspective null on ${notTilted.length} of ${tiltRuns.length}${notTilted.length > 0 ? ` (${notTilted.join(', ')})` : ''}.`,
  );

  // R2: labelled holes that sit on a numeral, and what the numeral mask cost.
  let onNumeral = 0;
  let onPaperNumeral = 0;
  let maskCost = 0;
  let maskDropped = 0;
  for (const run of gated) {
    const rotation = run.report?.numeralRotation;
    if (run.report === null || !rotation?.reliable) continue;
    const inBox = run.photo.holes.filter((h) => inNumeralBox(h.xMm, h.yMm, rotation.deg));
    onNumeral += inBox.length;
    onPaperNumeral += inBox.filter((h) => Math.hypot(h.xMm, h.yMm) > PRECISION_TEMPLATE.blackDiameterMm / 2).length;
    for (const rejected of run.report.rejected.filter((r) => r.reason === 'numeral')) {
      maskDropped += 1;
      if (run.photo.holes.some((h) => Math.hypot(h.xMm - rejected.xMm, h.yMm - rejected.yMm) <= 0.8 * HOLE_DIAMETER_MM)) maskCost += 1;
    }
  }
  lines.push(`- R2 numeral mask: ${onNumeral} labelled holes sit inside a numeral box (${onPaperNumeral} of them on paper); the mask dropped ${maskDropped} candidates, ${maskCost} of them within 0.8 hole diameters of a labelled hole (its cost).`);

  // R4: every "false positive" on a gated photo, for the owner to confirm or correct.
  lines.push('\nUnmatched detections on gated photos (labels can be incomplete — confirm each in `pnpm review:detection`):\n');
  for (const run of gated) {
    if (run.report === null || run.match === null || run.match.unmatchedDetections.length === 0) continue;
    const items = run.match.unmatchedDetections.map((i) => {
      const c = run.report!.candidates[i]!;
      const p = run.detectionsPx[i]!;
      return `(${p.x.toFixed(0)}, ${p.y.toFixed(0)}) px = (${c.xMm.toFixed(1)}, ${c.yMm.toFixed(1)}) mm ${c.surface}`;
    });
    lines.push(`- ${run.photo.id}: ${items.join('; ')}`);
  }

  lines.push(...confidentHoleReport(gated));
  lines.push(...suggestionYieldReport(gated));
  lines.push(...standardWidthReport(gated));

  const failed = !passesGate(all);
  lines.push(
    `\nGATE (gated set): recall ${pct(all.recall)} (floor ${pct(GATE_RECALL_MIN)}), precision ${pct(all.precision)} (floor ${pct(GATE_PRECISION_MIN)}) — ${failed ? 'FAIL' : 'pass'}`,
  );
  return { lines, failed };
}
