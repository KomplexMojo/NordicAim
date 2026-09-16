#!/usr/bin/env tsx
// M10 step 10 and M11 step 8. Node-only evaluation of the Stage A computer vision: synthetic sheets
// with known calibrations, the committed reference JPEGs against
// `fixtures/reference/seed-calibrations.json`, the sharpness of sharp vs blurred copies (which is how
// BLUR_THRESHOLD is chosen), and shot detection against synthetic and reference truth.
//
// Exit code: non-zero when a synthetic case regresses (anchor or shots) OR when a reference JPEG lands
// outside the seed tolerance M10 step 10 states (centre <= 5% of R, radius <= 6%). Those are gated:
// step 10 lists the reference comparison alongside the synthetic cases, so a violation has to fail the
// acceptance command rather than print a note next to a zero exit code. Shot detection on the REAL
// photos is reported but never gated — M11 step 8 sets no bar for real photos.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { BLUR_THRESHOLD } from '../src/lib/cv/constants.ts';
import { detectAnchor } from '../src/lib/cv/anchor.ts';
import { detectShots } from '../src/lib/cv/holes.ts';
import { sharpness } from '../src/lib/cv/sharpness.ts';
import { hintTemplate } from '../src/lib/cv/template-hint.ts';
import type { TemplateId } from '../src/lib/domain/enums.ts';
import type { Calibration } from '../src/lib/domain/photo.ts';
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

const cv = await loadOpenCvForTests();
let syntheticFailures = 0;
let referenceFailures = 0;

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

const referenceRows: string[][] = [];

for (const ref of REFERENCE) {
  const seed = seeds[ref.key];
  if (seed === undefined || typeof seed === 'string') continue;

  const img = await jpegFileToRgba(`${REPO_ROOT}${ref.path}`);

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

  for (const variant of [
    { label: 'no prior', detection: detectAnchor(cv, img, null, 'both') },
    { label: 'capture prior', detection: detectAnchor(cv, img, capturePrior, seed.anchorDiameterMm) },
  ]) {
    const detection = variant.detection;
    if (detection === null) {
      referenceFailures += 1;
      referenceRows.push([ref.key, variant.label, '—', '—', '—', '—', 'FAIL (no detection)']);
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
  }

  const sharpScore = sharpness(cv, img);
  const blurredScore = sharpness(cv, await blurRgba(img, BLUR_SIGMA));
  sharpScores.push(sharpScore);
  blurredScores.push(blurredScore);
  sharpnessRows.push([ref.key, sharpScore.toFixed(1), blurredScore.toFixed(1), (blurredScore / sharpScore).toFixed(3)]);
}

// --- Shot detection (M11 step 8) -----------------------------------------------------------------

const SHOT_RECALL_MIN = 0.95;
const SHOT_PRECISION_MIN = 0.95;
const SHOT_MEAN_ERROR_MAX_MM = 0.8;

const shotRows: string[][] = [];
let shotFailures = 0;

function shotCells(name: string, truthCount: number, result: MatchResult, verdict: string): string[] {
  return [
    name,
    String(truthCount),
    String(result.detected),
    result.recall.toFixed(2),
    result.precision.toFixed(2),
    result.meanErrorMm === null ? '—' : result.meanErrorMm.toFixed(2),
    `${result.unitCountError >= 0 ? '+' : ''}${result.unitCountError}`,
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
    name: 'sighting · 4 holes, 2 overlapping',
    spec: syntheticSpec('sighting 450px'),
    holes: SIGHTING_TEST_HOLES,
    gate: 'units' as const,
  },
]) {
  const img = await syntheticTargetRgba({ ...entry.spec, holesMm: entry.holes });
  const shots = detectShots(
    cv,
    img,
    syntheticCalibration(entry.spec),
    entry.spec.template,
    SYNTHETIC_HOLE_DIAMETER_MM,
  );
  const result = matchShots(shots, entry.holes);

  const ok =
    entry.gate === 'accuracy'
      ? result.recall >= SHOT_RECALL_MIN &&
        result.precision >= SHOT_PRECISION_MIN &&
        (result.meanErrorMm ?? Number.POSITIVE_INFINITY) <= SHOT_MEAN_ERROR_MAX_MM
      : Math.abs(result.unitCountError) <= 1;
  if (!ok) shotFailures += 1;
  shotRows.push(shotCells(entry.name, entry.holes.length, result, ok ? 'pass' : 'FAIL'));
}

/** `fixtures/reference/sample-shots-*.json`, and the same shape from M13's ground-truth export. */
interface ShotFile {
  calibration?: Calibration;
  shots: Array<{ xMm: number; yMm: number; multiplicity: number }>;
}

for (const ref of REFERENCE) {
  const seed = seeds[ref.key];
  if (seed === undefined || typeof seed === 'string') continue;

  const img = await jpegFileToRgba(`${REPO_ROOT}${ref.path}`);
  const seedCalibration: Calibration = { ...seed, source: 'manual', confidence: null };

  for (const source of [
    { label: 'fixture shots', path: `${REPO_ROOT}${ref.truth}` },
    { label: 'owner ground truth', path: `${REPO_ROOT}fixtures/reference/ground-truth/${ref.key}.json` },
  ]) {
    if (!existsSync(source.path)) continue;
    const truth = JSON.parse(readFileSync(source.path, 'utf-8')) as ShotFile;
    const shots = detectShots(
      cv,
      img,
      truth.calibration ?? seedCalibration,
      ref.template,
      SYNTHETIC_HOLE_DIAMETER_MM,
    );
    shotRows.push(
      shotCells(`${ref.key} (${source.label})`, truth.shots.length, matchShots(shots, truth.shots), 'reported · no bar'),
    );
  }
}

// --- Report -------------------------------------------------------------------------------------

console.log('\n### Anchor detection — synthetic sheets (prior offset +20/-15 px)\n');
console.log(table(['case', 'centre err (of R)', 'radius err', 'axisRatio', 'angle err', 'template hint', 'result'], syntheticRows));

console.log(`\n### Anchor detection — reference JPEGs (seed tolerance: centre ${pct(REFERENCE_CENTRE_TOLERANCE)} of R, radius ${pct(REFERENCE_RADIUS_TOLERANCE)})\n`);
console.log(table(['photo', 'prior', 'centre err (of R)', 'radius err', 'axisRatio', 'template hint', 'vs seed'], referenceRows));

console.log(`\n### Sharpness (blurred = Gaussian sigma ${BLUR_SIGMA})\n`);
console.log(table(['image', 'sharp', 'blurred', 'ratio'], sharpnessRows));

console.log(
  `\n### Shot detection (greedy match <= ${MATCH_TOLERANCE_MM} mm; synthetic bar: recall >= ${SHOT_RECALL_MIN}, ` +
    `precision >= ${SHOT_PRECISION_MIN}, mean error <= ${SHOT_MEAN_ERROR_MAX_MM} mm, unit count +/-1)\n`,
);
console.log(
  table(['case', 'truth', 'detected', 'recall', 'precision', 'mean err (mm)', 'unit count err', 'result'], shotRows),
);

const minSharp = Math.min(...sharpScores);
const maxBlurred = Math.max(...blurredScores);
const suggested = Math.round(Math.sqrt(minSharp * maxBlurred));
console.log(`\nlowest sharp = ${minSharp.toFixed(1)}, highest blurred = ${maxBlurred.toFixed(1)}`);
console.log(`suggested BLUR_THRESHOLD = ${suggested} (geometric mean of the two); current = ${BLUR_THRESHOLD}`);
if (maxBlurred >= BLUR_THRESHOLD) console.log('NOTE: a blurred image would NOT be flagged at the current threshold.');
if (minSharp < BLUR_THRESHOLD) console.log('NOTE: a sharp image WOULD be flagged at the current threshold.');

if (syntheticFailures > 0 || referenceFailures > 0 || shotFailures > 0) {
  if (syntheticFailures > 0) console.error(`\n${syntheticFailures} synthetic anchor case(s) failed`);
  if (referenceFailures > 0) {
    console.error(
      `${referenceFailures} reference photo(s) outside the M10 step 10 seed tolerance ` +
        `(centre ${pct(REFERENCE_CENTRE_TOLERANCE)} of R, radius ${pct(REFERENCE_RADIUS_TOLERANCE)})`,
    );
  }
  if (shotFailures > 0) console.error(`${shotFailures} synthetic shot-detection case(s) failed`);
  process.exit(1);
}
console.log('\nall synthetic cases and reference photos pass');
