// M23 step 1 (issue #5). The template hint's confusion matrix against the TRUE sheet type. Node-only;
// called by `scripts/cv-eval.ts`. The private photos are gitignored, so that part is skipped — loudly —
// when they are absent (CI); the two committed reference JPEGs always run.
//
// The truth is NOT the labels' `template` field: those were recorded from this very hint and were
// contaminated by the bug being measured. Each photo's type below was read off the sheet itself
// (geometry-scoring §1.2-§1.3: the precision sheet's nine numbered rings on the black versus the
// sighting sheet's dashed 110/40 mm guides, solid 45 mm circle and small inner circle), from a crop of
// every photo, on 2026-09-19.

import { existsSync } from 'node:fs';

import { detectAnchor } from '../src/lib/cv/anchor.ts';
import { TEMPLATE_PERIODICITY_THRESHOLD } from '../src/lib/cv/constants.ts';
import type { OpenCv } from '../src/lib/cv/opencv.ts';
import { hintTemplate, ringPeriodicity } from '../src/lib/cv/template-hint.ts';
import type { TemplateId } from '../src/lib/domain/enums.ts';
import { loadLabelledHoles } from '../tests/helpers/labelled-holes.ts';
import { jpegFileToRgba } from '../tests/helpers/rgba.ts';

const WORKING_LONGEST = 1200;
const PRIVATE_DIR = 'fixtures/private/additional references/';

/** Every photo in the private folder that shows a target, by file name. The other five show none. */
export const SHEET_TRUTH: Record<string, TemplateId> = {
  'IMG_4444.jpeg': 'sighting',
  'IMG_4447.jpeg': 'precision',
  'IMG_4514.jpeg': 'precision',
  'IMG_4515.jpeg': 'precision',
  'IMG_4540.jpeg': 'precision',
  'IMG_4673.jpeg': 'precision',
  'IMG_4722.jpeg': 'precision',
  'IMG_4723.jpeg': 'precision',
  'IMG_4742.jpeg': 'sighting',
  'IMG_4743.jpeg': 'sighting',
  'IMG_4744.jpeg': 'sighting',
  'IMG_4745.jpeg': 'precision',
  'IMG_4746.jpeg': 'precision',
  'IMG_4770.jpeg': 'sighting',
  'IMG_4771.jpeg': 'sighting',
  'IMG_4820.jpeg': 'sighting',
  'IMG_4827.jpeg': 'precision',
  'IMG_4831.jpeg': 'sighting',
  'IMG_4985.jpeg': 'sighting',
  'IMG_4986.jpeg': 'precision',
  'IMG_5057 2.jpeg': 'sighting',
  'IMG_5058.jpeg': 'precision',
  'IMG_5070.jpeg': 'precision',
  'IMG_5071.jpeg': 'precision',
  'IMG_5084.jpeg': 'sighting',
  'IMG_5085.jpeg': 'precision',
  'IMG_5129.jpeg': 'sighting',
  'IMG_5131.jpeg': 'sighting',
  'IMG_5132 2.jpeg': 'precision',
  'IMG_5134.jpeg': 'precision',
  'IMG_5146.jpeg': 'sighting',
  'IMG_5147.jpeg': 'sighting',
  'IMG_5148.jpeg': 'precision',
  'IMG_5149.jpeg': 'precision',
  'IMG_5151.jpeg': 'sighting',
  'IMG_5152.jpeg': 'precision',
  'IMG_5153.jpeg': 'precision',
  'IMG_5182.jpeg': 'sighting',
  'IMG_5183.jpeg': 'sighting',
  'IMG_5184.jpeg': 'precision',
  'IMG_5185.jpeg': 'precision',
};

/** The committed reference JPEGs, which need no private files. */
const REFERENCE_TRUTH: Record<string, TemplateId> = {
  'docs/reference/IMG_5057-sighting.jpg': 'sighting',
  'docs/reference/IMG_5132-precision.jpg': 'precision',
};

export interface TemplateEvaluation {
  lines: string[];
  /** True when any sheet with a measured disc was hinted as the other template. */
  failed: boolean;
}

interface Row {
  name: string;
  truth: TemplateId;
  label: TemplateId | null;
  hint: { template: TemplateId; confidence: number } | null;
  periodicity: number | null;
}

function table(header: string[], rows: string[][]): string {
  return [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

/** The pipeline's import path: A4 with no prior and both anchor sizes, then A3's hint on that disc. */
async function measure(cv: OpenCv, path: string): Promise<Pick<Row, 'hint' | 'periodicity'>> {
  const img = await jpegFileToRgba(path, WORKING_LONGEST);
  const detection = detectAnchor(cv, img, null, 'both');
  if (detection === null) return { hint: null, periodicity: null };
  return { hint: hintTemplate(cv, img, detection.calibration), periodicity: ringPeriodicity(cv, img, detection.calibration) };
}

export async function evaluateTemplateHint(cv: OpenCv, repoRoot: string): Promise<TemplateEvaluation> {
  const lines: string[] = ['\n### Template hint vs the true sheet type (M23, issue #5)\n'];
  const rows: Row[] = [];

  for (const [path, truth] of Object.entries(REFERENCE_TRUTH)) {
    rows.push({ name: path.split('/').pop() ?? path, truth, label: null, ...(await measure(cv, `${repoRoot}${path}`)) });
  }

  const privateAvailable = existsSync(`${repoRoot}${PRIVATE_DIR}`);
  if (privateAvailable) {
    const labels = new Map((loadLabelledHoles(repoRoot)?.photos ?? []).map((photo) => [photo.name, photo.template]));
    for (const [name, truth] of Object.entries(SHEET_TRUTH)) {
      const path = `${repoRoot}${PRIVATE_DIR}${name}`;
      if (!existsSync(path)) {
        lines.push(`- MISSING private photo ${name}: not measured.`);
        continue;
      }
      rows.push({ name, truth, label: labels.get(name) ?? null, ...(await measure(cv, path)) });
    }
  } else {
    lines.push(
      `NO PRIVATE PHOTOS: \`${PRIVATE_DIR}\` is absent (it is gitignored, so this is expected in CI). Only the two\n` +
        'committed reference JPEGs are measured below; the private set is UNVERIFIED by this run.\n',
    );
  }

  const templates: TemplateId[] = ['sighting', 'precision'];
  const count = (truth: TemplateId, hinted: TemplateId | 'no disc') =>
    rows.filter((row) => row.truth === truth && (row.hint?.template ?? 'no disc') === hinted).length;
  lines.push(`Hint on A4's own disc (import path: no prior, both anchor sizes). Threshold: ringPeriodicity >= ${TEMPLATE_PERIODICITY_THRESHOLD} → precision.\n`);
  lines.push(
    table(
      ['true \\ hinted', 'sighting', 'precision', 'no disc'],
      templates.map((truth) => [truth, String(count(truth, 'sighting')), String(count(truth, 'precision')), String(count(truth, 'no disc'))]),
    ),
  );

  for (const truth of templates) {
    const values = rows
      .filter((row) => row.truth === truth && row.periodicity !== null)
      .map((row) => row.periodicity as number)
      .sort((a, b) => a - b);
    if (values.length === 0) continue;
    lines.push(`- ${truth}: ringPeriodicity ${values[0]!.toFixed(3)}-${values[values.length - 1]!.toFixed(3)} over ${values.length} sheet(s).`);
  }

  const wrong = rows.filter((row) => row.hint !== null && row.hint.template !== row.truth);
  lines.push('\nPer photo:\n');
  lines.push(
    table(
      ['photo', 'true', 'label', 'hint (confidence)', 'ringPeriodicity', 'result'],
      rows.map((row) => [
        row.name,
        row.truth,
        row.label === null ? '—' : row.label === row.truth ? row.label : `${row.label} (MISLABELLED)`,
        row.hint === null ? 'no disc' : `${row.hint.template} (${row.hint.confidence.toFixed(2)})`,
        row.periodicity === null ? '—' : row.periodicity.toFixed(3),
        row.hint === null ? 'not run' : row.hint.template === row.truth ? 'ok' : 'WRONG',
      ]),
    ),
  );

  const mislabelled = rows.filter((row) => row.label !== null && row.label !== row.truth).map((row) => row.name);
  lines.push(
    `\n- Labels whose \`template\` differs from the sheet: ${mislabelled.length === 0 ? 'none' : mislabelled.join(', ')}` +
      `${mislabelled.length === 0 ? '' : ' — correct them in the private labels (M23 step 3)'}.`,
  );
  const sightingAsPrecision = wrong.filter((row) => row.truth === 'sighting').length;
  lines.push(
    `\nGATE (template hint): ${sightingAsPrecision} sighting sheet(s) called precision, ` +
      `${wrong.length - sightingAsPrecision} precision sheet(s) called sighting — ${wrong.length === 0 ? 'pass' : 'FAIL'}`,
  );
  return { lines, failed: wrong.length > 0 };
}
