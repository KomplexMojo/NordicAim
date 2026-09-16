#!/usr/bin/env tsx
// M10 step 10. Node-only evaluation of the Stage A computer vision: synthetic sheets with known
// calibrations, the committed reference JPEGs against `fixtures/reference/seed-calibrations.json`, and
// the sharpness of sharp vs blurred copies (which is how BLUR_THRESHOLD is chosen).
//
// Exit code: non-zero when a synthetic case regresses OR when a reference JPEG lands outside the seed
// tolerance M10 step 10 states (centre <= 5% of R, radius <= 6%). Both are gated: step 10 lists the
// reference comparison alongside the synthetic cases, so a violation has to fail the acceptance command
// rather than print a note next to a zero exit code.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { BLUR_THRESHOLD } from '../src/lib/cv/constants.ts';
import { detectAnchor } from '../src/lib/cv/anchor.ts';
import { sharpness } from '../src/lib/cv/sharpness.ts';
import { hintTemplate } from '../src/lib/cv/template-hint.ts';
import type { Calibration } from '../src/lib/domain/photo.ts';
import { loadOpenCvForTests } from '../tests/helpers/opencv.ts';
import { blurRgba, jpegFileToRgba } from '../tests/helpers/rgba.ts';
import { syntheticTargetRgba, type SyntheticTargetSpec } from '../tests/helpers/synthetic-target.ts';

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

interface SeedFile {
  [key: string]: { cx: number; cy: number; radiusPx: number; anchorDiameterMm: number } | string;
}

const seeds = JSON.parse(readFileSync(`${REPO_ROOT}fixtures/reference/seed-calibrations.json`, 'utf-8')) as SeedFile;

const REFERENCE = [
  { key: 'IMG_5057-sighting.jpg', path: 'docs/reference/IMG_5057-sighting.jpg' },
  { key: 'IMG_5132-precision.jpg', path: 'docs/reference/IMG_5132-precision.jpg' },
];

const referenceRows: string[][] = [];

for (const ref of REFERENCE) {
  const seed = seeds[ref.key];
  if (seed === undefined || typeof seed === 'string') continue;

  const img = await jpegFileToRgba(`${REPO_ROOT}${ref.path}`);
  // Imports carry no overlay prior, so this is the hardest path: no prior, both anchor sizes.
  const detection = detectAnchor(cv, img, null, 'both');

  if (detection === null) {
    referenceFailures += 1;
    referenceRows.push([ref.key, '—', '—', '—', '—', 'FAIL (no detection)']);
  } else {
    const cal = detection.calibration;
    const centreErr = Math.hypot(cal.cx - seed.cx, cal.cy - seed.cy) / seed.radiusPx;
    const radiusErr = Math.abs(cal.radiusPx - seed.radiusPx) / seed.radiusPx;
    const ok = centreErr <= REFERENCE_CENTRE_TOLERANCE && radiusErr <= REFERENCE_RADIUS_TOLERANCE;
    if (!ok) referenceFailures += 1;
    const hint = hintTemplate(cv, img, cal);
    referenceRows.push([
      ref.key,
      pct(centreErr),
      pct(radiusErr),
      cal.axisRatio.toFixed(3),
      `${hint.template} (${hint.confidence.toFixed(2)})`,
      ok ? 'within seed tolerance' : 'FAIL (outside seed tolerance)',
    ]);
  }

  const sharpScore = sharpness(cv, img);
  const blurredScore = sharpness(cv, await blurRgba(img, BLUR_SIGMA));
  sharpScores.push(sharpScore);
  blurredScores.push(blurredScore);
  sharpnessRows.push([ref.key, sharpScore.toFixed(1), blurredScore.toFixed(1), (blurredScore / sharpScore).toFixed(3)]);
}

// --- Report -------------------------------------------------------------------------------------

console.log('\n### Anchor detection — synthetic sheets (prior offset +20/-15 px)\n');
console.log(table(['case', 'centre err (of R)', 'radius err', 'axisRatio', 'angle err', 'template hint', 'result'], syntheticRows));

console.log(`\n### Anchor detection — reference JPEGs, no prior (seed tolerance: centre ${pct(REFERENCE_CENTRE_TOLERANCE)} of R, radius ${pct(REFERENCE_RADIUS_TOLERANCE)})\n`);
console.log(table(['photo', 'centre err (of R)', 'radius err', 'axisRatio', 'template hint', 'vs seed'], referenceRows));

console.log(`\n### Sharpness (blurred = Gaussian sigma ${BLUR_SIGMA})\n`);
console.log(table(['image', 'sharp', 'blurred', 'ratio'], sharpnessRows));

const minSharp = Math.min(...sharpScores);
const maxBlurred = Math.max(...blurredScores);
const suggested = Math.round(Math.sqrt(minSharp * maxBlurred));
console.log(`\nlowest sharp = ${minSharp.toFixed(1)}, highest blurred = ${maxBlurred.toFixed(1)}`);
console.log(`suggested BLUR_THRESHOLD = ${suggested} (geometric mean of the two); current = ${BLUR_THRESHOLD}`);
if (maxBlurred >= BLUR_THRESHOLD) console.log('NOTE: a blurred image would NOT be flagged at the current threshold.');
if (minSharp < BLUR_THRESHOLD) console.log('NOTE: a sharp image WOULD be flagged at the current threshold.');

if (syntheticFailures > 0 || referenceFailures > 0) {
  if (syntheticFailures > 0) console.error(`\n${syntheticFailures} synthetic case(s) failed`);
  if (referenceFailures > 0) {
    console.error(
      `${referenceFailures} reference photo(s) outside the M10 step 10 seed tolerance ` +
        `(centre ${pct(REFERENCE_CENTRE_TOLERANCE)} of R, radius ${pct(REFERENCE_RADIUS_TOLERANCE)})`,
    );
  }
  process.exit(1);
}
console.log('\nall synthetic cases and reference photos pass');
