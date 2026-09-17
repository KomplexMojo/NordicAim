#!/usr/bin/env tsx
// M10 step 10, M11 step 8 and M16 steps 1, 6 and 7. Node-only evaluation of the Stage A computer
// vision: synthetic sheets with known calibrations, the committed reference JPEGs, the sharpness of
// sharp vs blurred copies (which is how BLUR_THRESHOLD is chosen), alignment accuracy against the
// owner's ground truth (REV-31), and shot detection by both segmentation methods (REV-32).
//
// Exit code: non-zero when
//   * a synthetic case regresses (anchor or shots), or
//   * a reference JPEG lands outside the M10 step 10 seed tolerance (centre <= 5% of R, radius <= 6%), or
//   * a photo with owner ground truth exceeds that same alignment tolerance (M16 step 7), or
//   * a reference photo yields MORE detections than its declared rounds (M16 step 6).

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { detectAnchor } from '../src/lib/cv/anchor.ts';
import { BLUR_THRESHOLD, DEFAULT_DETECTION_METHOD, REGION_K, REGION_MM, REGION_REFINE_MAX } from '../src/lib/cv/constants.ts';
import { detectShotCandidates, type DetectionMethod } from '../src/lib/cv/holes.ts';
import { sharpness } from '../src/lib/cv/sharpness.ts';
import { hintTemplate } from '../src/lib/cv/template-hint.ts';
import { declaredRounds } from '../src/lib/domain/categorization.ts';
import type { TemplateId } from '../src/lib/domain/enums.ts';
import type { Calibration, Categorization } from '../src/lib/domain/photo.ts';
import { capShots } from '../src/lib/scoring/cap-shots.ts';
import { loadOpenCvForTests } from '../tests/helpers/opencv.ts';
import { blurRgba, jpegFileToRgba } from '../tests/helpers/rgba.ts';
import { MATCH_TOLERANCE_MM, matchShots, type MatchResult } from '../tests/helpers/shot-match.ts';
import {
  PRECISION_TEST_HOLES,
  SIGHTING_TEST_HOLES,
  SYNTHETIC_HOLE_DIAMETER_MM,
  syntheticCalibration,
  syntheticTargetRgba,
  type SyntheticTargetSpec,
} from '../tests/helpers/synthetic-target.ts';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const BLUR_SIGMA = 3;
const SYNTHETIC_CENTRE_TOLERANCE = 0.015; // fraction of R
const SYNTHETIC_RADIUS_TOLERANCE = 0.02;
const REFERENCE_CENTRE_TOLERANCE = 0.05;
const REFERENCE_RADIUS_TOLERANCE = 0.06;
const METHODS: DetectionMethod[] = ['global', 'region'];

const cv = await loadOpenCvForTests();
let syntheticFailures = 0;
let referenceFailures = 0;
let alignmentFailures = 0;
let capFailures = 0;

function pct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function table(header: string[], rows: string[][]): string {
  const lines = [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`];
  for (const row of rows) lines.push(`| ${row.join(' | ')} |`);
  return lines.join('\n');
}

// --- Synthetic sheets ---------------------------------------------------------------------------

const SYNTHETIC: Array<{ name: string; spec: SyntheticTargetSpec; priorRadiusPx: number; priorOffset: [number, number] }> = [
  {
    name: 'precision 260px',
    spec: { template: 'precision', width: 1200, height: 1600, cx: 620, cy: 830, radiusPx: 260, axisRatio: 0.93, angleDeg: 0 },
    priorRadiusPx: 280,
    priorOffset: [20, -15],
  },
  {
    name: 'precision rot 30',
    spec: { template: 'precision', width: 1200, height: 1600, cx: 620, cy: 830, radiusPx: 260, axisRatio: 0.93, angleDeg: 30 },
    priorRadiusPx: 280,
    priorOffset: [20, -15],
  },
  {
    name: 'sighting 450px',
    spec: { template: 'sighting', width: 1200, height: 1600, cx: 600, cy: 800, radiusPx: 450, axisRatio: 0.93, angleDeg: 0 },
    priorRadiusPx: 480,
    priorOffset: [20, -15],
  },
];

const syntheticRows: string[][] = [];
const sharpnessRows: string[][] = [];
const sharpScores: number[] = [];
const blurredScores: number[] = [];

for (const entry of SYNTHETIC) {
  const img = await syntheticTargetRgba(entry.spec);
  const prior: Calibration = {
    cx: entry.spec.cx + entry.priorOffset[0],
    cy: entry.spec.cy + entry.priorOffset[1],
    radiusPx: entry.priorRadiusPx,
    axisRatio: 1,
    angleDeg: 0,
    anchorDiameterMm: entry.spec.template === 'sighting' ? 115 : 112.4,
    source: 'overlay',
    confidence: null,
  };

  const detection = detectAnchor(cv, img, prior, entry.spec.template === 'sighting' ? 115 : 112.4);
  if (detection === null) {
    syntheticFailures += 1;
    syntheticRows.push([entry.name, '—', '—', '—', '—', '—', 'FAIL (no detection)']);
    continue;
  }

  const cal = detection.calibration;
  const centreErr = Math.hypot(cal.cx - entry.spec.cx, cal.cy - entry.spec.cy) / entry.spec.radiusPx;
  const radiusErr = Math.abs(cal.radiusPx - entry.spec.radiusPx) / entry.spec.radiusPx;
  const angleErr = Math.abs(cal.angleDeg - entry.spec.angleDeg);
  const ok = centreErr <= SYNTHETIC_CENTRE_TOLERANCE && radiusErr <= SYNTHETIC_RADIUS_TOLERANCE;
  if (!ok) syntheticFailures += 1;

  const hint = hintTemplate(cv, img, cal);
  syntheticRows.push([
    entry.name,
    pct(centreErr),
    pct(radiusErr),
    cal.axisRatio.toFixed(3),
    `${angleErr.toFixed(2)}°`,
    `${hint.template} (${hint.confidence.toFixed(2)})`,
    ok ? 'pass' : 'FAIL',
  ]);

  const sharpScore = sharpness(cv, img);
  const blurredScore = sharpness(cv, await blurRgba(img, BLUR_SIGMA));
  sharpScores.push(sharpScore);
  blurredScores.push(blurredScore);
  sharpnessRows.push([`synthetic ${entry.name}`, sharpScore.toFixed(1), blurredScore.toFixed(1), (blurredScore / sharpScore).toFixed(3)]);
}

// --- Reference photos ---------------------------------------------------------------------------

interface SeedCalibration {
  cx: number;
  cy: number;
  radiusPx: number;
  axisRatio: number;
  angleDeg: number;
  anchorDiameterMm: number;
}

interface SeedFile {
  [key: string]: SeedCalibration | string;
}

/** `fixtures/reference/sample-shots-*.json`, and the same shape from M13's ground-truth export. */
interface ShotFile {
  calibration?: Calibration;
  categorization?: Categorization;
  shots: Array<{ xMm: number; yMm: number; multiplicity: number }>;
}

const seeds = JSON.parse(readFileSync(`${REPO_ROOT}fixtures/reference/seed-calibrations.json`, 'utf-8')) as SeedFile;

const REFERENCE: Array<{ key: string; path: string; template: TemplateId; truth: string }> = [
  {
    key: 'IMG_5057-sighting.jpg',
    path: 'docs/reference/IMG_5057-sighting.jpg',
    template: 'sighting',
    truth: 'fixtures/reference/sample-shots-sighting.json',
  },
  {
    key: 'IMG_5132-precision.jpg',
    path: 'docs/reference/IMG_5132-precision.jpg',
    template: 'precision',
    truth: 'fixtures/reference/sample-shots-precision.json',
  },
];

function groundTruthPath(key: string): string {
  return `${REPO_ROOT}fixtures/reference/ground-truth/${key}.json`;
}

function readShotFile(path: string): ShotFile {
  return JSON.parse(readFileSync(path, 'utf-8')) as ShotFile;
}

const referenceRows: string[][] = [];
const alignmentRows: string[][] = [];
const images = new Map<string, Awaited<ReturnType<typeof jpegFileToRgba>>>();

for (const ref of REFERENCE) {
  const seed = seeds[ref.key];
  if (seed === undefined || typeof seed === 'string') continue;

  const img = await jpegFileToRgba(`${REPO_ROOT}${ref.path}`);
  images.set(ref.key, img);

  // Both paths REV-26 covers: an import (no prior, both anchor sizes, CLOSE kernel at its floor) and a
  // capture whose overlay was framed ~40% large, which is the kernel that merges the printed rings into
  // the aiming mark.
  const capturePrior: Calibration = {
    cx: seed.cx + 20,
    cy: seed.cy - 15,
    radiusPx: Math.round(seed.radiusPx * 1.4),
    axisRatio: 1,
    angleDeg: 0,
    anchorDiameterMm: seed.anchorDiameterMm,
    source: 'overlay',
    confidence: null,
  };

  // M16 step 7 (REV-31): the owner's hand-checked calibration supersedes the seed estimate.
  const truthFile = existsSync(groundTruthPath(ref.key)) ? readShotFile(groundTruthPath(ref.key)) : null;
  const truthCalibration = truthFile?.calibration ?? null;

  for (const variant of [
    { label: 'no prior', detection: detectAnchor(cv, img, null, 'both') },
    { label: 'capture prior', detection: detectAnchor(cv, img, capturePrior, seed.anchorDiameterMm) },
  ]) {
    const detection = variant.detection;
    if (detection === null) {
      referenceFailures += 1;
      referenceRows.push([ref.key, variant.label, '—', '—', '—', '—', 'FAIL (no detection)']);
      if (truthCalibration !== null) {
        alignmentFailures += 1;
        alignmentRows.push([ref.key, variant.label, '—', '—', '—', 'FAIL (no detection)']);
      }
      continue;
    }
    const cal = detection.calibration;
    const centreErr = Math.hypot(cal.cx - seed.cx, cal.cy - seed.cy) / seed.radiusPx;
    const radiusErr = Math.abs(cal.radiusPx - seed.radiusPx) / seed.radiusPx;
    const ok = centreErr <= REFERENCE_CENTRE_TOLERANCE && radiusErr <= REFERENCE_RADIUS_TOLERANCE;
    if (!ok) referenceFailures += 1;
    const hint = hintTemplate(cv, img, cal);
    referenceRows.push([
      ref.key,
      variant.label,
      pct(centreErr),
      pct(radiusErr),
      cal.axisRatio.toFixed(3),
      `${hint.template} (${hint.confidence.toFixed(2)})${detection.outsidePrior ? ' · outsidePrior' : ''}`,
      ok ? 'within seed tolerance' : 'FAIL (outside seed tolerance)',
    ]);

    if (truthCalibration !== null) {
      const centre = Math.hypot(cal.cx - truthCalibration.cx, cal.cy - truthCalibration.cy) / truthCalibration.radiusPx;
      const radius = Math.abs(cal.radiusPx - truthCalibration.radiusPx) / truthCalibration.radiusPx;
      const axis = Math.abs(cal.axisRatio - truthCalibration.axisRatio);
      const within = centre <= REFERENCE_CENTRE_TOLERANCE && radius <= REFERENCE_RADIUS_TOLERANCE;
      if (!within) alignmentFailures += 1;
      alignmentRows.push([
        ref.key,
        variant.label,
        pct(centre),
        pct(radius),
        axis.toFixed(3),
        within ? 'within tolerance' : 'FAIL (outside tolerance)',
      ]);
    }
  }

  const sharpScore = sharpness(cv, img);
  const blurredScore = sharpness(cv, await blurRgba(img, BLUR_SIGMA));
  sharpScores.push(sharpScore);
  blurredScores.push(blurredScore);
  sharpnessRows.push([ref.key, sharpScore.toFixed(1), blurredScore.toFixed(1), (blurredScore / sharpScore).toFixed(3)]);
}

// --- Shot detection (M11 step 8, M16 step 6) -----------------------------------------------------

const SHOT_RECALL_MIN = 0.95;
const SHOT_PRECISION_MIN = 0.95;
const SHOT_MEAN_ERROR_MAX_MM = 0.8;

const shotRows: string[][] = [];
let shotFailures = 0;

function shotCells(
  name: string,
  method: string,
  truthCount: number,
  result: MatchResult,
  units: number,
  dropped: number,
  verdict: string,
): string[] {
  return [
    name,
    method,
    String(truthCount),
    String(result.detected),
    String(units),
    result.recall.toFixed(2),
    result.precision.toFixed(2),
    result.meanErrorMm === null ? '—' : result.meanErrorMm.toFixed(2),
    String(dropped),
    verdict,
  ];
}

function syntheticSpec(name: string): SyntheticTargetSpec {
  const entry = SYNTHETIC.find((candidate) => candidate.name === name);
  if (entry === undefined) throw new Error(`no synthetic sheet named ${name}`);
  return entry.spec;
}

for (const entry of [
  {
    name: 'precision · 8 separate holes',
    spec: syntheticSpec('precision 260px'),
    holes: PRECISION_TEST_HOLES,
    gate: 'accuracy' as const,
  },
  {
    // M16 Tests, "tilt and curl": the same eight holes on a sheet rotated 30 degrees in frame.
    name: 'precision rot 30 · 8 separate holes',
    spec: syntheticSpec('precision rot 30'),
    holes: PRECISION_TEST_HOLES,
    gate: 'accuracy' as const,
  },
  {
    name: 'sighting · 4 holes, 2 overlapping',
    spec: syntheticSpec('sighting 450px'),
    holes: SIGHTING_TEST_HOLES,
    // REV-28: the overlapping pair is ONE shot, so three units for four holes is the correct answer.
    gate: 'units' as const,
  },
]) {
  const img = await syntheticTargetRgba({ ...entry.spec, holesMm: entry.holes });
  for (const method of METHODS) {
    const report = detectShotCandidates(
      cv,
      img,
      syntheticCalibration(entry.spec),
      entry.spec.template,
      SYNTHETIC_HOLE_DIAMETER_MM,
      { method },
    );
    const result = matchShots(report.candidates, entry.holes);
    const units = report.candidates.reduce((sum, candidate) => sum + candidate.multiplicity, 0);

    // Only the method that ships is gated; the other is reported for the comparison.
    const gated = method === DEFAULT_DETECTION_METHOD;
    const ok =
      entry.gate === 'accuracy'
        ? result.recall >= SHOT_RECALL_MIN &&
          result.precision >= SHOT_PRECISION_MIN &&
          (result.meanErrorMm ?? Number.POSITIVE_INFINITY) <= SHOT_MEAN_ERROR_MAX_MM
        : Math.abs(units - (entry.holes.length - 1)) <= 1;
    if (gated && !ok) shotFailures += 1;
    shotRows.push(
      shotCells(entry.name, method, entry.holes.length, result, units, 0, gated ? (ok ? 'pass' : 'FAIL') : 'reported'),
    );
  }
}

for (const ref of REFERENCE) {
  const seed = seeds[ref.key];
  const img = images.get(ref.key);
  if (seed === undefined || typeof seed === 'string' || img === undefined) continue;
  const seedCalibration: Calibration = { ...seed, source: 'manual', confidence: null };

  const fixture = readShotFile(`${REPO_ROOT}${ref.truth}`);
  const truthFile = existsSync(groundTruthPath(ref.key)) ? readShotFile(groundTruthPath(ref.key)) : null;
  const declared = declaredRounds((truthFile?.categorization ?? fixture.categorization)!);

  // What the pipeline itself would use: A4's measured disc, the owner's ground truth when there is
  // one, and only then the seed estimate.
  const measured = detectAnchor(cv, img, null, 'both')?.calibration ?? null;
  const calibration = truthFile?.calibration ?? measured ?? seedCalibration;
  const calLabel = truthFile?.calibration ? 'ground truth' : measured !== null ? 'cv' : 'seed';

  for (const source of [
    { label: 'fixture shots', file: fixture },
    ...(truthFile === null ? [] : [{ label: 'owner ground truth', file: truthFile }]),
  ]) {
    for (const method of METHODS) {
      const report = detectShotCandidates(cv, img, calibration, ref.template, SYNTHETIC_HOLE_DIAMETER_MM, { method });
      const shots = report.candidates.map((candidate, index) => ({
        id: `auto-${index + 1}`,
        xMm: candidate.xMm,
        yMm: candidate.yMm,
        multiplicity: candidate.multiplicity,
        positionOverrides: null,
        source: 'auto' as const,
        confidence: candidate.confidence,
        cluster: candidate.cluster,
        areaMm2: candidate.areaMm2,
      }));
      const units = shots.reduce((sum, shot) => sum + shot.multiplicity, 0);
      const dropped = capShots(shots, declared).dropped.length;

      // M16 step 6: more detections than rounds fired is a failure, whatever the truth file says.
      const over = shots.length > declared;
      if (over && method === DEFAULT_DETECTION_METHOD) capFailures += 1;
      shotRows.push(
        shotCells(
          `${ref.key} (${source.label}, ${calLabel} calibration)`,
          method,
          source.file.shots.length,
          matchShots(shots, source.file.shots),
          units,
          dropped,
          over
            ? `FAIL (> ${declared} declared)`
            : method === DEFAULT_DETECTION_METHOD
              ? `<= ${declared} declared`
              : 'reported',
        ),
      );
    }
  }
}

// --- The owner's wider reference set (gitignored; skipped when absent) ----------------------------

const PRIVATE_DIR = `${REPO_ROOT}fixtures/private/additional references`;
const privateRows: string[][] = [];

if (existsSync(PRIVATE_DIR)) {
  for (const name of readdirSync(PRIVATE_DIR).filter((file) => /\.jpe?g$/i.test(file)).sort()) {
    // The app works on a ~1200 px working image, so the eval measures the same thing.
    const img = await jpegFileToRgba(`${PRIVATE_DIR}/${name}`, 1200);
    const detection = detectAnchor(cv, img, null, 'both');
    if (detection === null) {
      privateRows.push([name, '—', 'no anchor', '—', '—', '—']);
      continue;
    }
    const template = hintTemplate(cv, img, detection.calibration).template;
    const report = detectShotCandidates(cv, img, detection.calibration, template, SYNTHETIC_HOLE_DIAMETER_MM);
    privateRows.push([
      name,
      template,
      String(report.candidates.length),
      String(report.rejected.filter((r) => r.reason === 'glyph').length),
      String(report.rejected.filter((r) => r.reason === 'outside-crop').length),
      `${report.tiles?.scanned ?? 0}/${report.tiles?.withCandidates ?? 0}`,
    ]);
  }
}

// --- Report -------------------------------------------------------------------------------------

console.log('\n### Anchor detection — synthetic sheets (prior offset +20/-15 px)\n');
console.log(table(['case', 'centre err (of R)', 'radius err', 'axisRatio', 'angle err', 'template hint', 'result'], syntheticRows));

console.log(`\n### Anchor detection — reference JPEGs (seed tolerance: centre ${pct(REFERENCE_CENTRE_TOLERANCE)} of R, radius ${pct(REFERENCE_RADIUS_TOLERANCE)})\n`);
console.log(table(['photo', 'prior', 'centre err (of R)', 'radius err', 'axisRatio', 'template hint', 'vs seed'], referenceRows));

console.log(`\n### Alignment accuracy vs owner ground truth (REV-31; tolerance: centre ${pct(REFERENCE_CENTRE_TOLERANCE)} of R, radius ${pct(REFERENCE_RADIUS_TOLERANCE)})\n`);
if (alignmentRows.length === 0) {
  console.log(
    'NO GROUND TRUTH: `fixtures/reference/ground-truth/` holds no `<key>.json` file, so alignment is\n' +
      'UNVERIFIED — the anchor table above is measured against `seed-calibrations.json`, which was\n' +
      'estimated by eye and is not ground truth. The owner exports the real thing from the Adjust\n' +
      "screen (M13 step 7, see that folder's README). Nothing here is gated until they do.",
  );
} else {
  console.log(table(['photo', 'prior', 'centre err (of R)', 'radius err', 'axisRatio err', 'result'], alignmentRows));
}

console.log(`\n### Sharpness (blurred = Gaussian sigma ${BLUR_SIGMA})\n`);
console.log(table(['image', 'sharp', 'blurred', 'ratio'], sharpnessRows));

console.log(
  `\n### Shot detection (greedy match <= ${MATCH_TOLERANCE_MM} mm; synthetic bar: recall >= ${SHOT_RECALL_MIN}, ` +
    `precision >= ${SHOT_PRECISION_MIN}, mean error <= ${SHOT_MEAN_ERROR_MAX_MM} mm, unit count +/-1).\n` +
    `Shipping method: **${DEFAULT_DETECTION_METHOD}** (REGION_MM ${REGION_MM}, REGION_K ${REGION_K}, ` +
    `REGION_REFINE_MAX ${REGION_REFINE_MAX}). A reference photo may never yield more detections than its declared rounds.\n`,
);
console.log(
  table(
    ['case', 'method', 'truth', 'detected', 'units', 'recall', 'precision', 'mean err (mm)', 'cap drops', 'result'],
    shotRows,
  ),
);

if (privateRows.length > 0) {
  console.log(
    "\n### The owner's wider reference set (`fixtures/private/additional references/`, gitignored)\n\n" +
      'Per photo, never aggregated: what the region scan kept, what the REV-27 glyph filter rejected, and\n' +
      'what fell outside the REV-33 crop. There is no ground truth for these, so nothing here is gated.\n',
  );
  console.log(table(['photo', 'template', 'detections', 'glyph drops', 'outside crop', 'tiles scanned/with candidates'], privateRows));
}

const minSharp = Math.min(...sharpScores);
const maxBlurred = Math.max(...blurredScores);
const suggested = Math.round(Math.sqrt(minSharp * maxBlurred));
console.log(`\nlowest sharp = ${minSharp.toFixed(1)}, highest blurred = ${maxBlurred.toFixed(1)}`);
console.log(`suggested BLUR_THRESHOLD = ${suggested} (geometric mean of the two); current = ${BLUR_THRESHOLD}`);
if (maxBlurred >= BLUR_THRESHOLD) console.log('NOTE: a blurred image would NOT be flagged at the current threshold.');
if (minSharp < BLUR_THRESHOLD) console.log('NOTE: a sharp image WOULD be flagged at the current threshold.');

if (syntheticFailures > 0 || referenceFailures > 0 || shotFailures > 0 || alignmentFailures > 0 || capFailures > 0) {
  if (syntheticFailures > 0) console.error(`\n${syntheticFailures} synthetic anchor case(s) failed`);
  if (referenceFailures > 0) {
    console.error(
      `${referenceFailures} reference photo(s) outside the M10 step 10 seed tolerance ` +
        `(centre ${pct(REFERENCE_CENTRE_TOLERANCE)} of R, radius ${pct(REFERENCE_RADIUS_TOLERANCE)})`,
    );
  }
  if (alignmentFailures > 0) console.error(`${alignmentFailures} photo(s) outside the alignment tolerance vs owner ground truth`);
  if (shotFailures > 0) console.error(`${shotFailures} synthetic shot-detection case(s) failed`);
  if (capFailures > 0) console.error(`${capFailures} reference photo(s) yielded more detections than the declared rounds`);
  process.exit(1);
}
console.log('\nall synthetic cases and reference photos pass');
