// M19 step 8 (REV-38, backing-sheet.md §4, §4a, §5, §7). The coloured-backing section of
// `pnpm cv:eval`: the colour path against the standard detector on every photo in
// `fixtures/private/backing/`, the colour signature each one used, and `Auto`'s verdict.
//
// Everything here is skipped — loudly — when the private folders are absent (CI). The §7 gate only
// runs once at least 10 labelled backing photos exist; until then the section prints UNVERIFIED.

import { existsSync, readFileSync, readdirSync } from 'node:fs';

import { detectAnchor } from '../src/lib/cv/anchor.ts';
import {
  backingColourFromCard,
  detectBackingPresence,
  detectByBackingColour,
  estimateBackingColour,
  type BackingPresence,
} from '../src/lib/cv/backing-colour.ts';
import { detectShotCandidates } from '../src/lib/cv/holes.ts';
import type { OpenCv } from '../src/lib/cv/opencv.ts';
import { hintTemplate } from '../src/lib/cv/template-hint.ts';
import type { ColourSignature } from '../src/lib/domain/backing.ts';
import type { TemplateId } from '../src/lib/domain/enums.ts';
import type { Calibration } from '../src/lib/domain/photo.ts';
import { mmToPx } from '../src/lib/geometry/transform.ts';
import {
  loadLabelledHoles,
  matchLabelled,
  matchTolerancePx,
  pooled,
  type LabelledMatch,
} from '../tests/helpers/labelled-holes.ts';
import { jpegFileToRgba } from '../tests/helpers/rgba.ts';

/** backing-sheet.md §7, provisional: the floors the colour path must clear before it is trusted. */
export const BACKING_GATE_RECALL_MIN = 0.95;
export const BACKING_GATE_PRECISION_MIN = 0.95;
/** §7: at least this many labelled backing photos before anything is gated. */
export const BACKING_GATE_MIN_PHOTOS = 10;

const BACKING_DIR = 'fixtures/private/backing/';
const REFERENCE_DIR = 'fixtures/private/additional references/';
/**
 * Which card photo goes with which target, as `{ "<target file>": "<card file>" }`. Written by the
 * owner beside the photos; without it a target is measured with the neutral-chroma rule (§4).
 */
const CARDS_MANIFEST = 'cards.json';
const WORKING_LONGEST = 1200;
const HOLE_DIAMETER_MM = 5.6;

export interface BackingEvaluation {
  lines: string[];
  /** True only when the §7 gate ran and failed. */
  failed: boolean;
}

function table(header: string[], rows: string[][]): string {
  return [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function signatureLabel(signature: ColourSignature | null, source: string): string {
  if (signature === null) return `${source} · none`;
  return `${source} · ${signature.hueDeg.toFixed(1)}° ±${signature.hueSpreadDeg.toFixed(1)}° satP10 ${signature.satP10.toFixed(2)}`;
}

/** §4a plus M19 Open question 1's two rules: the verdict and every measurement it read. */
function autoLabel(p: BackingPresence): string {
  const radius = p.acceptedRadiusP10Mm === null ? '—' : `${p.acceptedRadiusP10Mm.toFixed(0)} mm`;
  return (
    `${p.present ? 'present' : `absent: ${p.reason ?? '?'}`} (${p.spots} spots, largest ${p.largestRatio.toFixed(2)}x, ` +
    `max chroma ${p.maxChroma.toFixed(0)}, radius p10 ${radius})`
  );
}

function readCards(dir: string): Record<string, string> {
  const path = `${dir}${CARDS_MANIFEST}`;
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, string>;
}

interface Aligned {
  calibration: Calibration;
  template: TemplateId;
  img: Awaited<ReturnType<typeof jpegFileToRgba>>;
}

async function align(cv: OpenCv, path: string): Promise<Aligned | null> {
  const img = await jpegFileToRgba(path, WORKING_LONGEST);
  const detection = detectAnchor(cv, img, null, 'both');
  if (detection === null) return null;
  return { img, calibration: detection.calibration, template: hintTemplate(cv, img, detection.calibration).template };
}

export async function evaluateBacking(cv: OpenCv, repoRoot: string): Promise<BackingEvaluation> {
  const lines: string[] = ['\n### Coloured backing (M19, REV-38, backing-sheet.md §4/§4a/§5/§7)\n'];
  const dir = `${repoRoot}${BACKING_DIR}`;
  if (!existsSync(dir)) {
    lines.push(
      `NO BACKING PHOTOS: \`${BACKING_DIR}\` is absent (it is gitignored, so this is expected in CI).\n` +
        'The colour path is UNVERIFIED by this run and nothing is gated.',
    );
    return { lines, failed: false };
  }

  const cards = readCards(dir);
  const names = readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f)).sort();
  const cardFiles = new Set(Object.values(cards));
  const signatures = new Map<string, ColourSignature | null>();
  for (const file of cardFiles) {
    signatures.set(file, backingColourFromCard(await jpegFileToRgba(`${dir}${file}`, 512)));
  }

  const labels = loadLabelledHoles(repoRoot);
  const labelById = new Map((labels?.photos ?? []).map((photo) => [photo.id, photo]));

  const rows: string[][] = [];
  const gated: Array<{ name: string; colour: LabelledMatch; standard: LabelledMatch }> = [];
  let noAnchor = 0;

  for (const name of names) {
    if (cardFiles.has(name)) continue; // a card is not a target
    const aligned = await align(cv, `${dir}${name}`);
    if (aligned === null) {
      // A flat card has no anchor disc: say so rather than counting it as a failure.
      noAnchor += 1;
      rows.push([name, 'no anchor (a card photo? add it to cards.json)', '—', '—', '—', '—', '—', '—']);
      continue;
    }
    const { img, calibration, template } = aligned;
    const cardFile = cards[name] ?? null;
    const signature = cardFile === null ? null : (signatures.get(cardFile) ?? null);
    const source = cardFile === null ? 'no card (chroma)' : `card ${cardFile}`;

    const colour = detectByBackingColour(cv, img, calibration, template, HOLE_DIAMETER_MM, signature);
    const standard = detectShotCandidates(cv, img, calibration, template, HOLE_DIAMETER_MM);
    const presence = detectBackingPresence(cv, img, calibration, template, HOLE_DIAMETER_MM, signature);
    const estimated = signature === null ? estimateBackingColour(cv, img, calibration, template) : null;

    const id = name.replace(/\.jpe?g$/i, '').replace(/\s+/g, '_');
    const label = labelById.get(id) ?? null;
    let matchCells = ['—', '—', '—', '—'];
    if (label !== null) {
      const tolerance = matchTolerancePx(calibration, HOLE_DIAMETER_MM);
      const holes = label.holes.map((h) => ({ x: h.xPx, y: h.yPx }));
      const colourMatch = matchLabelled(colour.blobs.map((b) => mmToPx(b, calibration)), holes, tolerance);
      const standardMatch = matchLabelled(standard.candidates.map((c) => mmToPx(c, calibration)), holes, tolerance);
      gated.push({ name, colour: colourMatch, standard: standardMatch });
      matchCells = [
        String(label.holes.length),
        `${pct(colourMatch.recall)} / ${pct(colourMatch.precision)}`,
        `${pct(standardMatch.recall)} / ${pct(standardMatch.precision)}`,
        colourMatch.recall >= standardMatch.recall && colourMatch.precision >= standardMatch.precision ? 'colour wins' : 'STANDARD WINS',
      ];
    }

    rows.push([
      name,
      template,
      String(colour.blobs.length),
      String(colour.blobs.filter((b) => b.possibleOverlap).length),
      String(standard.candidates.length),
      autoLabel(presence),
      signature !== null ? signatureLabel(signature, source) : signatureLabel(estimated, source),
      matchCells.join(' · '),
    ]);
  }

  lines.push(
    `Per photo: the colour path (§5) against the standard detector (M16), the signature used, and \`Auto\`'s verdict (§4a).\n` +
      `Pair a card with a target by writing \`${BACKING_DIR}${CARDS_MANIFEST}\` as \`{"IMG_5191.jpeg": "IMG_5190.jpeg"}\`.\n`,
  );
  lines.push(
    table(
      ['photo', 'template', 'colour', 'overlap flags', 'standard', 'Auto', 'colour signature', 'labelled · colour R/P · standard R/P · verdict'],
      rows,
    ),
  );
  if (noAnchor > 0) lines.push(`- ${noAnchor} photo(s) in the folder have no target disc; they are treated as cards, not targets.`);

  // §4a on the unbacked reference set: every photo `Auto` would treat as backed is a false positive
  // risk, and the owner is the only one who can say which of those photos actually had a backing.
  const referenceDir = `${repoRoot}${REFERENCE_DIR}`;
  if (existsSync(referenceDir)) {
    const flagged: string[] = [];
    const verdicts: string[] = [];
    let checked = 0;
    for (const name of readdirSync(referenceDir).filter((f) => /\.jpe?g$/i.test(f)).sort()) {
      const aligned = await align(cv, `${referenceDir}${name}`);
      if (aligned === null) continue;
      checked += 1;
      const presence = detectBackingPresence(cv, aligned.img, aligned.calibration, aligned.template, HOLE_DIAMETER_MM);
      if (presence.spots > 0) verdicts.push(`- ${name}: ${autoLabel(presence)}`);
      if (presence.present) flagged.push(`${name} ${autoLabel(presence)}`);
    }
    lines.push(
      `\n\`Auto\` over the ${checked} aligned photos of \`${REFERENCE_DIR}\`: ${flagged.length} read as backed.` +
        (verdicts.length > 0 ? `\nEvery photo with a coloured spot:\n${verdicts.join('\n')}` : '') +
        (flagged.length > 0
          ? `\nFALSE POSITIVES — the owner confirmed on 2026-09-18 that none of these photos had a backing (M19 Open question 1):\n${flagged.map((f) => `- ${f}`).join('\n')}`
          : ''),
    );
  }

  // §7: nothing is gated until the owner's photo set exists.
  if (gated.length < BACKING_GATE_MIN_PHOTOS) {
    lines.push(
      `\nGATE: UNVERIFIED — ${gated.length} labelled backing photo(s) of the ${BACKING_GATE_MIN_PHOTOS} that §7 requires ` +
        `(${names.length - cardFiles.size} target photo(s) present, ${cardFiles.size} card(s)). ` +
        `Label them with \`pnpm review:detection\` and export; the floors are recall >= ${BACKING_GATE_RECALL_MIN} and ` +
        `precision >= ${BACKING_GATE_PRECISION_MIN}, and the colour path must beat the standard detector on every photo it runs on.`,
    );
    return { lines, failed: false };
  }

  const colourPooled = pooled(gated.map((g) => g.colour));
  const standardPooled = pooled(gated.map((g) => g.standard));
  const lost = gated.filter((g) => g.colour.recall < g.standard.recall || g.colour.precision < g.standard.precision);
  const failed =
    colourPooled.recall < BACKING_GATE_RECALL_MIN || colourPooled.precision < BACKING_GATE_PRECISION_MIN || lost.length > 0;
  lines.push(
    `\nGATE (§7, ${gated.length} labelled photos): colour recall ${pct(colourPooled.recall)} (floor ${pct(BACKING_GATE_RECALL_MIN)}), ` +
      `precision ${pct(colourPooled.precision)} (floor ${pct(BACKING_GATE_PRECISION_MIN)}); standard ${pct(standardPooled.recall)} / ` +
      `${pct(standardPooled.precision)}; ${lost.length} photo(s) where the colour path does not beat it — ${failed ? 'FAIL' : 'pass'}`,
  );
  for (const g of lost) lines.push(`- ${g.name}: colour ${pct(g.colour.recall)}/${pct(g.colour.precision)} vs standard ${pct(g.standard.recall)}/${pct(g.standard.precision)}`);
  return { lines, failed };
}
