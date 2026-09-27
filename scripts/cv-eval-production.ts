// The production benchmark (owner, 2026-09-27): the owner's confirmed targets from three real range
// sessions (`fixtures/private/range-2026-09-26/`, from nordic-aim-backup-2026-09-26), run through the
// app's own A4 and A5 — including the coloured-backing path — and matched against the confirmed shots.
// This is the "standard case" for capture; `fixtures/private/additional references/` is the worse case
// (early photos straight off the backing board, bad angles, no backing) and is reported, not gated.
//
// Skipped — loudly — when the private folder is absent (CI).

import { existsSync, readFileSync } from 'node:fs';

import { calibrationWithPerspective } from '../src/lib/cv/alignment-perspective.ts';
import { detectAnchor } from '../src/lib/cv/anchor.ts';
import { backingColourFromCard, detectShotsWithBacking } from '../src/lib/cv/backing-colour.ts';
import type { OpenCv } from '../src/lib/cv/opencv.ts';
import type { BackingMode, ColourSignature } from '../src/lib/domain/backing.ts';
import type { TemplateId } from '../src/lib/domain/enums.ts';
import { mmToPx, type CalibrationLike } from '../src/lib/geometry/transform.ts';
import { matchLabelled, matchTolerancePx, pooled, type LabelledMatch } from '../tests/helpers/labelled-holes.ts';
import { jpegFileToRgba } from '../tests/helpers/rgba.ts';

export const PRODUCTION_DIR = 'fixtures/private/range-2026-09-26/';
const MANIFEST = 'ground-truth-manifest.json';
/** The owner's lime backing, as measured from the card and stored in settings (nordic-aim-backup-2026-09-23). */
const SIGNATURE_MANIFEST = 'fixtures/private/backing/2026-09-23/pairs-manifest.json';
/**
 * Before the lime backing (2026-09-23) the owner shot on an orange one; its card photo is
 * `backing/IMG_5190.jpeg` (backing-sheet.md §1, second test). Sessions dated before this use the orange card.
 */
const LIME_SINCE = '2026-09-23';
const ORANGE_CARD = 'fixtures/private/backing/IMG_5190.jpeg';

interface ProductionTarget {
  photoId: string;
  imageFile: string;
  sessionDate: string;
  template: TemplateId;
  position: string;
  calibration: CalibrationLike;
  confirmedShots: Array<{ xMm: number; yMm: number; multiplicity: number; source: 'auto' | 'manual' }>;
  pipelineAtBackupTime: { method: 'colour' | 'standard'; backing: 'detected' | 'not-detected' | 'forced' | 'off' };
}

export interface ProductionRun {
  target: ProductionTarget;
  match: LabelledMatch;
  method: 'colour' | 'standard';
}

/** The backing mode the app ran each target under: `forced` means Settings said Coloured backing, else Auto. */
function modeFor(target: ProductionTarget): BackingMode {
  return target.pipelineAtBackupTime.backing === 'forced' ? 'coloured' : 'auto';
}

export async function runProduction(cv: OpenCv, repoRoot: string, holeDiameterMm: number): Promise<ProductionRun[] | null> {
  const manifestPath = `${repoRoot}${PRODUCTION_DIR}${MANIFEST}`;
  const signaturePath = `${repoRoot}${SIGNATURE_MANIFEST}`;
  const orangePath = `${repoRoot}${ORANGE_CARD}`;
  if (!existsSync(manifestPath) || !existsSync(signaturePath) || !existsSync(orangePath)) return null;
  const targets = (JSON.parse(readFileSync(manifestPath, 'utf8')) as { targets: ProductionTarget[] }).targets;
  const lime = (JSON.parse(readFileSync(signaturePath, 'utf8')) as { backingSignatureAtCaptureTime: ColourSignature })
    .backingSignatureAtCaptureTime;
  const orange = backingColourFromCard(await jpegFileToRgba(orangePath, 1200));
  const runs: ProductionRun[] = [];
  for (const target of targets) {
    const img = await jpegFileToRgba(`${repoRoot}${PRODUCTION_DIR}${target.imageFile}`);
    const truthPx = target.confirmedShots.map((s) => mmToPx(s, target.calibration));
    const detection = detectAnchor(cv, img, null, 'both');
    if (detection === null) {
      runs.push({ target, method: 'standard', match: matchLabelled([], truthPx, 1) });
      continue;
    }
    const calibration = calibrationWithPerspective(img, detection.calibration, target.template) ?? detection.calibration;
    const result = detectShotsWithBacking(cv, img, calibration, target.template, holeDiameterMm, {
      mode: modeFor(target),
      colour: target.sessionDate >= LIME_SINCE ? lime : orange,
    });
    const foundPx = result.shots.map((s) => mmToPx(s, calibration));
    runs.push({ target, method: result.detection.method, match: matchLabelled(foundPx, truthPx, matchTolerancePx(calibration, holeDiameterMm)) });
  }
  return runs;
}

export function productionTotals(runs: ProductionRun[]): { recall: number; precision: number } {
  return pooled(runs.map((r) => r.match));
}

/**
 * Owner, 2026-09-27: the production set is the benchmark `pnpm cv:eval` gates on. The floors are the colour
 * path's own measurement on it that day (recall 92.2%, precision 90.5% at the owner's calliper hole size),
 * rounded down, so they catch a regression; raise them as detection improves.
 */
export const PRODUCTION_HOLE_DIAMETER_MM = 3.3;
export const PRODUCTION_GATE_RECALL_MIN = 0.92;
export const PRODUCTION_GATE_PRECISION_MIN = 0.9;

export interface ProductionEvaluation {
  lines: string[];
  /** True only when the gate ran and failed. */
  failed: boolean;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export async function evaluateProduction(cv: OpenCv, repoRoot: string): Promise<ProductionEvaluation> {
  const lines = ['\n### Production benchmark — the owner\'s confirmed range targets (standard case, GATED)\n'];
  const runs = await runProduction(cv, repoRoot, PRODUCTION_HOLE_DIAMETER_MM);
  if (runs === null) {
    lines.push(`SKIPPED: \`${PRODUCTION_DIR}\` (or the backing signatures) not present — attach the private fixtures repo.`);
    return { lines, failed: false };
  }
  lines.push('| session | template | position | path | found | false | missed |', '|---|---|---|---|---|---|---|');
  for (const r of runs) {
    lines.push(
      `| ${r.target.sessionDate} | ${r.target.template} | ${r.target.position} | ${r.method} | ${r.match.truePositives} | ${r.match.falsePositives} | ${r.match.falseNegatives} |`,
    );
  }
  const total = productionTotals(runs);
  const failed = total.recall < PRODUCTION_GATE_RECALL_MIN || total.precision < PRODUCTION_GATE_PRECISION_MIN;
  lines.push(
    `\nGATE (production): recall ${pct(total.recall)} (floor ${pct(PRODUCTION_GATE_RECALL_MIN)}), precision ${pct(total.precision)} (floor ${pct(PRODUCTION_GATE_PRECISION_MIN)}) — ${failed ? 'FAIL' : 'pass'}`,
  );
  return { lines, failed };
}
