// M16 R4 (REV-37). Gates shot detection on the owner's labelled holes. Node-only; called by
// `scripts/cv-eval.ts`. The labels and photos are gitignored, so everything here is skipped — loudly —
// when they are absent (CI).

import { detectAnchor } from '../src/lib/cv/anchor.ts';
import { detectShotCandidates, type DetectionReport } from '../src/lib/cv/holes.ts';
import type { OpenCv } from '../src/lib/cv/opencv.ts';
import { inNumeralBox } from '../src/lib/cv/print-mask.ts';
import { hintTemplate } from '../src/lib/cv/template-hint.ts';
import { PRECISION_TEMPLATE } from '../src/lib/defaults/templates.ts';
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
  /** Detections in working px, parallel to `report.candidates`. */
  detectionsPx: Array<{ x: number; y: number }>;
}

/** The pipeline's own A4 and template hint, then A5 — exactly what the review page showed the owner. */
async function runPhoto(cv: OpenCv, repoRoot: string, photo: LabelledPhoto): Promise<PhotoRun> {
  const img = await jpegFileToRgba(`${repoRoot}fixtures/private/additional references/${photo.name}`, WORKING_LONGEST);
  const t0 = performance.now();
  const detection = detectAnchor(cv, img, null, 'both');
  if (detection === null) return { photo, report: null, match: null, ms: performance.now() - t0, detectionsPx: [] };
  const calibration = detection.calibration;
  const template = hintTemplate(cv, img, calibration).template;
  const report = detectShotCandidates(cv, img, calibration, template, HOLE_DIAMETER_MM);
  const ms = performance.now() - t0;
  const detectionsPx = report.candidates.map((c) => mmToPx(c, calibration));
  const match = matchLabelled(
    detectionsPx,
    photo.holes.map((h) => ({ x: h.xPx, y: h.yPx })),
    matchTolerancePx(calibration, HOLE_DIAMETER_MM),
  );
  return { photo, report, match, ms, detectionsPx };
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
  for (const photo of set.photos) runs.push(await runPhoto(cv, repoRoot, photo));

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

  const failed = !passesGate(all);
  lines.push(
    `\nGATE (gated set): recall ${pct(all.recall)} (floor ${pct(GATE_RECALL_MIN)}), precision ${pct(all.precision)} (floor ${pct(GATE_PRECISION_MIN)}) — ${failed ? 'FAIL' : 'pass'}`,
  );
  return { lines, failed };
}
