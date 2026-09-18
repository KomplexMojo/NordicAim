// M18 steps 1 and 3 (REV-31). Reports where the app's rings sit against where the sheet's rings are
// PRINTED, for every photo available. Node-only; called by `scripts/cv-eval.ts`.
//
// Two halves:
//  * Synthetic sheets rendered with a KNOWN homography (`tests/helpers/tilted-target.ts`) — gated,
//    because the truth is exact: the projective model must recover the printed centre within
//    ALIGNMENT_CENTRE_TOLERANCE_MM on a tilted sheet, and the two models must agree on a square-on one.
//  * The reference JPEGs and the owner's photos — reported, never gated. The measurement is against
//    the circles found IN the photo, which is evidence, not the owner's confirmation; M18 step 3's
//    owner-confirmed rings do not exist yet ("do not invent a tolerance from eyeballed seeds").
//
// The owner's photos are gitignored, so that half is skipped — loudly — when they are absent (CI).

import { existsSync } from 'node:fs';

import { centreOffsetMm, circleErrorMm, estimatePerspective, type PerspectiveEstimate } from '../src/lib/cv/alignment-perspective.ts';
import type { OpenCv } from '../src/lib/cv/opencv.ts';
import { ANCHOR_DIAMETER_MM, detectAnchor } from '../src/lib/cv/anchor.ts';
import { hintTemplate } from '../src/lib/cv/template-hint.ts';
import { PRECISION_TEMPLATE, SIGHTING_TEMPLATE } from '../src/lib/defaults/templates.ts';
import type { TemplateId } from '../src/lib/domain/enums.ts';
import { homographyFromCalibration, mmToPxH, type Homography } from '../src/lib/geometry/homography.ts';
import { loadLabelledHoles } from '../tests/helpers/labelled-holes.ts';
import { jpegFileToRgba } from '../tests/helpers/rgba.ts';
import { tiltHomography, tiltedTargetRgba, type TiltedTargetSpec } from '../tests/helpers/tilted-target.ts';

/** M18 Tests: "the new model recovers the printed centre within 0.5 mm". */
export const ALIGNMENT_CENTRE_TOLERANCE_MM = 0.5;
/** M18 Tests: "an untilted synthetic sheet: both models agree within 0.2 mm". */
export const ALIGNMENT_AGREEMENT_MM = 0.2;

const WORKING_LONGEST = 1200;

export interface AlignmentEvaluation {
  lines: string[];
  failed: boolean;
}

function table(header: string[], rows: string[][]): string {
  return [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

function mm(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : value.toFixed(3);
}

/** The circle at the centre of the scoring area, and the anchor edge (M18 Pitfalls: report both). */
function reportedCircles(template: TemplateId): { centreMm: number; edgeMm: number } {
  return template === 'sighting'
    ? { centreMm: SIGHTING_TEMPLATE.unscoredCircles[0]?.diameterMm ?? 15, edgeMm: SIGHTING_TEMPLATE.anchor.diameterMm }
    : { centreMm: PRECISION_TEMPLATE.ringDiameterMm[10], edgeMm: PRECISION_TEMPLATE.blackDiameterMm };
}

function errorCells(estimate: PerspectiveEstimate, diameterMm: number): string[] {
  const ellipse = circleErrorMm(estimate, diameterMm, estimate.ellipse);
  const projective = circleErrorMm(estimate, diameterMm, estimate.projective);
  return [
    `${mm(ellipse?.meanMm)} / ${mm(ellipse?.maxMm)}`,
    `${mm(projective?.meanMm)} / ${mm(projective?.maxMm)}`,
  ];
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

// --- Synthetic, with a known homography ----------------------------------------------------------

const SYNTHETIC: Array<{ name: string; spec: TiltedTargetSpec; tilted: boolean }> = [
  {
    name: 'precision · tilt 25°',
    spec: { template: 'precision', width: 1200, height: 1600, cx: 600, cy: 820, pxPerMm: 4.6, tiltDeg: 25, distanceMm: 600 },
    tilted: true,
  },
  {
    name: 'precision · tilt 25°, roll 35°',
    spec: { template: 'precision', width: 1200, height: 1600, cx: 600, cy: 820, pxPerMm: 4.6, tiltDeg: 25, distanceMm: 600, rollDeg: 35 },
    tilted: true,
  },
  {
    name: 'precision · square on',
    spec: { template: 'precision', width: 1200, height: 1600, cx: 600, cy: 820, pxPerMm: 4.6, tiltDeg: 0, distanceMm: 600 },
    tilted: false,
  },
  {
    name: 'sighting · tilt 25°',
    spec: { template: 'sighting', width: 1200, height: 1600, cx: 600, cy: 800, pxPerMm: 4.4, tiltDeg: 25, distanceMm: 600 },
    tilted: true,
  },
  {
    name: 'sighting · square on',
    spec: { template: 'sighting', width: 1200, height: 1600, cx: 600, cy: 800, pxPerMm: 4.4, tiltDeg: 0, distanceMm: 600 },
    tilted: false,
  },
];

function centreErrorMm(model: Homography, truthCentre: { x: number; y: number }, pxPerMm: number): number {
  const c = mmToPxH({ xMm: 0, yMm: 0 }, model);
  return Math.hypot(c.x - truthCentre.x, c.y - truthCentre.y) / pxPerMm;
}

async function evaluateSynthetic(cv: OpenCv): Promise<{ rows: string[][]; failures: number }> {
  const rows: string[][] = [];
  let failures = 0;

  for (const entry of SYNTHETIC) {
    const img = await tiltedTargetRgba(entry.spec);
    const truthCentre = mmToPxH({ xMm: 0, yMm: 0 }, tiltHomography(entry.spec));
    const anchorMm = entry.spec.template === 'sighting' ? SIGHTING_TEMPLATE.anchor.diameterMm : PRECISION_TEMPLATE.anchor.diameterMm;
    const detection = detectAnchor(cv, img, null, anchorMm);
    if (detection === null) {
      failures += 1;
      rows.push([entry.name, '—', '—', '—', '—', '—', 'FAIL (no anchor)']);
      continue;
    }
    const base = homographyFromCalibration(detection.calibration);
    const estimate = estimatePerspective(img, base, entry.spec.template);
    if (estimate === null) {
      failures += 1;
      rows.push([entry.name, '—', '—', '—', '—', '—', 'FAIL (too few circles)']);
      continue;
    }

    const ellipseErr = centreErrorMm(estimate.ellipse, truthCentre, entry.spec.pxPerMm);
    const projectiveErr = centreErrorMm(estimate.projective, truthCentre, entry.spec.pxPerMm);
    const agreement = centreOffsetMm(estimate.ellipse, estimate.projective);
    const ok = entry.tilted
      ? projectiveErr <= ALIGNMENT_CENTRE_TOLERANCE_MM
      : agreement <= ALIGNMENT_AGREEMENT_MM && projectiveErr <= ALIGNMENT_CENTRE_TOLERANCE_MM;
    if (!ok) failures += 1;

    rows.push([
      entry.name,
      mm(ellipseErr),
      mm(projectiveErr),
      mm(agreement),
      mm(estimate.centre.spreadMm),
      `${mm(estimate.centre.offLineMm)} · r²corr ${estimate.centre.r2Correlation.toFixed(2)}`,
      ok ? 'pass' : 'FAIL',
    ]);
  }
  return { rows, failures };
}

// --- Real photos ---------------------------------------------------------------------------------

interface RealPhoto {
  label: string;
  path: string;
  /** The template the owner recorded for this photo, when it is known. */
  template: TemplateId | null;
}

async function evaluatePhoto(
  cv: OpenCv,
  path: string,
  known: TemplateId | null,
): Promise<{ estimate: PerspectiveEstimate; template: TemplateId; base: Homography } | null> {
  const img = await jpegFileToRgba(path, WORKING_LONGEST);
  const anchorMm = known === null ? 'both' : ANCHOR_DIAMETER_MM[known];
  const detection = detectAnchor(cv, img, null, anchorMm);
  if (detection === null) return null;
  // The owner's review recorded each photo's template, and the two committed JPEGs are known. Using
  // it keeps a template-hint mistake (IMG_5057 reads as `precision`) out of an alignment measurement,
  // which is not what M18 is measuring.
  const template = known ?? hintTemplate(cv, img, detection.calibration).template;
  const base = homographyFromCalibration(detection.calibration);
  const estimate = estimatePerspective(img, base, template);
  return estimate === null ? null : { estimate, template, base };
}

export async function evaluateAlignment(cv: OpenCv, repoRoot: string): Promise<AlignmentEvaluation> {
  const lines: string[] = [];
  const synthetic = await evaluateSynthetic(cv);

  lines.push(
    `\n### Alignment under perspective — synthetic sheets, known homography (M18 Tests; tilted: projective centre ` +
      `err <= ${ALIGNMENT_CENTRE_TOLERANCE_MM} mm, square on: models agree within ${ALIGNMENT_AGREEMENT_MM} mm)\n`,
  );
  lines.push(
    table(
      ['case', 'ellipse centre err (mm)', 'projective centre err (mm)', 'models differ (mm)', 'per-circle centre spread (mm)', 'off the line (mm)', 'result'],
      synthetic.rows,
    ),
  );

  const photos: RealPhoto[] = [
    { label: 'IMG_5057-sighting.jpg', path: `${repoRoot}docs/reference/IMG_5057-sighting.jpg`, template: 'sighting' as TemplateId },
    { label: 'IMG_5132-precision.jpg', path: `${repoRoot}docs/reference/IMG_5132-precision.jpg`, template: 'precision' as TemplateId },
  ].filter((photo) => existsSync(photo.path));

  const labelled = loadLabelledHoles(repoRoot);
  for (const photo of labelled?.photos ?? []) {
    const path = `${repoRoot}fixtures/private/additional references/${photo.name}`;
    if (existsSync(path)) photos.push({ label: photo.name, path, template: photo.template });
  }

  lines.push('\n### Alignment under perspective — real photos (M18 steps 1 and 3; REPORTED, never gated)\n');
  if (labelled === null) {
    lines.push(
      "NO OWNER PHOTOS: `fixtures/private/additional references/` has no labelled set (it is gitignored,\n" +
        'so this is expected in CI). Only the committed reference JPEGs below are measured.\n',
    );
  }
  lines.push(
    'The comparison is against the printed circles measured IN each photo, not against rings the owner\n' +
      'confirmed: M18 step 3\'s ground truth does not exist yet (`fixtures/reference/ground-truth/` is empty\n' +
      'and the review page has no "rings line up" question). Nothing here is gated.\n',
  );

  const rows: string[][] = [];
  const spreads: number[] = [];
  const offLines: number[] = [];
  const centreEllipse: number[] = [];
  const centreProjective: number[] = [];
  const edgeEllipse: number[] = [];
  const edgeProjective: number[] = [];
  const rmsEllipse: number[] = [];
  const rmsProjective: number[] = [];
  let worse = 0;
  let noImprovement = 0;

  for (const photo of photos) {
    const run = await evaluatePhoto(cv, photo.path, photo.template);
    if (run === null) {
      rows.push([photo.label, '—', '—', '—', '—', '—', '—', '—', 'no target / too few circles']);
      continue;
    }
    const { estimate, template } = run;
    const { centreMm, edgeMm } = reportedCircles(template);
    const centre = errorCells(estimate, centreMm);
    const edge = errorCells(estimate, edgeMm);

    const centreE = circleErrorMm(estimate, centreMm, estimate.ellipse);
    const centreP = circleErrorMm(estimate, centreMm, estimate.projective);
    const edgeE = circleErrorMm(estimate, edgeMm, estimate.ellipse);
    const edgeP = circleErrorMm(estimate, edgeMm, estimate.projective);
    if (centreE !== null) centreEllipse.push(centreE.meanMm);
    if (centreP !== null) centreProjective.push(centreP.meanMm);
    if (edgeE !== null) edgeEllipse.push(edgeE.meanMm);
    if (edgeP !== null) edgeProjective.push(edgeP.meanMm);
    // M18 Pitfalls: a better centre must not cost the outer rings.
    if (edgeE !== null && edgeP !== null && edgeP.meanMm > edgeE.meanMm) worse += 1;
    spreads.push(estimate.centre.spreadMm);
    offLines.push(estimate.centre.offLineMm);
    rmsEllipse.push(estimate.ellipseRmsMm);
    rmsProjective.push(estimate.projectiveRmsMm);
    if (estimate.projectiveRmsMm > 0.75 * estimate.ellipseRmsMm) noImprovement += 1;

    rows.push([
      photo.label,
      template,
      `${estimate.usedCircles} / ${estimate.points}`,
      mm(estimate.centre.spreadMm),
      `${mm(estimate.centre.offLineMm)} · ${estimate.centre.r2Correlation.toFixed(2)}`,
      ...centre,
      ...edge,
      `${mm(estimate.ellipseRmsMm)} → ${mm(estimate.projectiveRmsMm)}`,
    ]);
  }

  lines.push(
    table(
      [
        'photo',
        'template',
        'circles / points',
        'centre spread (mm)',
        'off the line (mm) · r²corr',
        'centre ring err, ellipse (mean/max mm)',
        'centre ring err, projective',
        'anchor edge err, ellipse',
        'anchor edge err, projective',
        'fit rms (mm)',
      ],
      rows,
    ),
  );

  if (spreads.length > 0) {
    lines.push(
      `\nmedian per-circle centre spread ${mm(median(spreads))} mm, median distance off the line ${mm(median(offLines))} mm ` +
        `over ${spreads.length} photo(s).\n` +
        `median centre-ring error: ellipse ${mm(median(centreEllipse))} mm → projective ${mm(median(centreProjective))} mm.\n` +
        `median anchor-edge error: ellipse ${mm(median(edgeEllipse))} mm → projective ${mm(median(edgeProjective))} mm ` +
        `(${worse} photo(s) where the edge got worse).\n` +
        `median fit rms: ellipse ${mm(median(rmsEllipse))} mm → projective ${mm(median(rmsProjective))} mm; ` +
        `${noImprovement} photo(s) where the projective fit did not improve the rms by a quarter. That is either a\n` +
        'photo taken nearly square on (the ellipse model is already right and there is nothing to correct) or one\n' +
        'where the RING MEASUREMENT failed — too few believable points, or a recorded template that does not match\n' +
        'the sheet. The circles/points and fit-rms columns tell the two apart.',
    );
  }

  return { lines, failed: synthetic.failures > 0 };
}
