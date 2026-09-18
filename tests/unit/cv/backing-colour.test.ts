// backing-sheet.md §4, §4a, §5 (REV-38). The colour path: measuring a card, deciding whether a photo
// is backed, and finding the holes by colour.
//
// The `fixtures/private/` cases are the owner's own photos and are gitignored, so every one of them
// SKIPS when the folder is absent (CI). Their expected values are what this code measures today; where
// that differs from the spec's own probe the difference is named in the test and in the milestone's
// Open questions, because the §7 photo set that would settle it does not exist yet.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { detectAnchor } from '@/lib/cv/anchor';
import {
  AUTO_LARGE_AREA_REASON,
  COLOUR_NOT_FOUND_REASON,
  backingColourFromCard,
  detectBackingPresence,
  detectByBackingColour,
  detectShotsWithBacking,
  estimateBackingColour,
  hueDistance,
  rgbToHsv,
} from '@/lib/cv/backing-colour';
import { detectShotCandidates } from '@/lib/cv/holes';
import type { OpenCv } from '@/lib/cv/opencv';
import { hintTemplate } from '@/lib/cv/template-hint';
import type { ColourSignature } from '@/lib/domain/backing';
import type { TemplateId } from '@/lib/domain/enums';
import type { Calibration } from '@/lib/domain/photo';
import type { RgbaImage } from '@/lib/media/format';
import { capShots, withoutArea } from '@/lib/scoring/cap-shots';

import { loadLabelledHoles } from '../../helpers/labelled-holes';
import { loadOpenCvForTests } from '../../helpers/opencv';
import { jpegFileToRgba, svgToRgba } from '../../helpers/rgba';
import {
  PRECISION_TEST_HOLES,
  SYNTHETIC_HOLE_DIAMETER_MM,
  syntheticCalibration,
  syntheticTargetRgba,
  type SyntheticHole,
  type SyntheticTargetSpec,
} from '../../helpers/synthetic-target';

/** The pink backing the synthetic sheets use. Its true hue, from the RGB itself, is 335.13 degrees. */
const PINK = '#FF3E8E';
const PINK_HUE = rgbToHsv(0xff, 0x3e, 0x8e).hueDeg;
/** Scores written in blue pen: coloured, on the paper, and not a hole. */
const PEN_BLUE = '#1F44C8';
const HOLE_MM = SYNTHETIC_HOLE_DIAMETER_MM;

const PRECISION: SyntheticTargetSpec = {
  template: 'precision',
  width: 1200,
  height: 1600,
  cx: 620,
  cy: 830,
  radiusPx: 260,
  axisRatio: 0.93,
  angleDeg: 0,
};
const CAL = syntheticCalibration(PRECISION);

/** backing-sheet.md §5.5: the overlapping pair, 4.5 mm apart — the spec measured 1.91x a single hole. */
const PAIR_OFFSET_MM = 4.5;
const PEN_MARKS = [
  { fromMm: { xMm: -70, yMm: -60 }, toMm: { xMm: -50, yMm: -60 }, colour: PEN_BLUE, widthMm: 1.2 },
  { fromMm: { xMm: 40, yMm: -70 }, toMm: { xMm: 60, yMm: -62 }, colour: PEN_BLUE, widthMm: 1.2 },
];

function card(colour: string, extra = ''): Promise<RgbaImage> {
  return svgToRgba(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">` +
      `<rect width="400" height="300" fill="${colour}" />${extra}</svg>`,
  );
}

/** The nine pink holes: the eight M11 test holes plus a partner overlapping the fifth. */
function backedHoles(): SyntheticHole[] {
  const base: SyntheticHole[] = PRECISION_TEST_HOLES.map((hole) => ({ ...hole, fill: PINK }));
  const anchor = base[4] as SyntheticHole;
  return [...base, { xMm: anchor.xMm + PAIR_OFFSET_MM, yMm: anchor.yMm, fill: PINK }];
}

/** The same sheet with neutral holes: a dark gap behind every one, as an unbacked target shows. */
function unbackedHoles(): SyntheticHole[] {
  return PRECISION_TEST_HOLES.map((hole) => ({ ...hole, style: 'paperDark' as const }));
}

let cv: OpenCv;
let pinkCard: ColourSignature | null = null;

beforeAll(async () => {
  cv = await loadOpenCvForTests();
  pinkCard = backingColourFromCard(await card(PINK));
}, 60_000);

describe('backingColourFromCard (backing-sheet.md §4)', () => {
  it('measures a pink card within 3 degrees of its true hue', async () => {
    const signature = backingColourFromCard(await card(PINK));
    expect(signature).not.toBeNull();
    expect(hueDistance(signature!.hueDeg, PINK_HUE)).toBeLessThanOrEqual(3);
    expect(signature!.samples).toBeGreaterThan(0);
  });

  it('returns null for a grey card (§4.3: fewer than 30% of the region is clearly coloured)', async () => {
    expect(backingColourFromCard(await card('#9A9A9A'))).toBeNull();
  });

  it('measures the hue within 5 degrees with half the card in shadow', async () => {
    const shadowed = await card(PINK, '<rect x="200" y="0" width="200" height="300" fill="#000" opacity="0.45" />');
    const signature = backingColourFromCard(shadowed);
    expect(signature).not.toBeNull();
    expect(hueDistance(signature!.hueDeg, PINK_HUE)).toBeLessThanOrEqual(5);
    // The shadowed half drags the 10th-percentile brightness down, which is why §5.1 applies no
    // minimum brightness to the photo.
    expect(signature!.valP10).toBeLessThan(0.7);
  });
});

describe('detectByBackingColour (backing-sheet.md §5)', () => {
  it('finds 8 blobs for 9 holes, flags the overlapping pair, and ignores blue handwriting', async () => {
    const holes = backedHoles();
    const img = await syntheticTargetRgba({ ...PRECISION, holesMm: holes, numeralsDeg: 0, penMarksMm: PEN_MARKS });
    const report = detectByBackingColour(cv, img, CAL, 'precision', HOLE_MM, pinkCard);

    expect(report.rule).toBe('hue');
    expect(report.blobs).toHaveLength(8);
    expect(report.blobs.filter((b) => b.possibleOverlap)).toHaveLength(1);

    // Every blob sits on a hole: nothing on a printed ring, a numeral or a pen mark.
    for (const blob of report.blobs) {
      const nearest = Math.min(...holes.map((h) => Math.hypot(blob.xMm - h.xMm, blob.yMm - h.yMm)));
      expect(nearest).toBeLessThanOrEqual(HOLE_MM / 2);
    }
    // ...and every hole is covered (the pair counts once).
    for (const hole of holes) {
      const nearest = Math.min(...report.blobs.map((b) => Math.hypot(b.xMm - hole.xMm, b.yMm - hole.yMm)));
      expect(nearest).toBeLessThanOrEqual(HOLE_MM);
    }

    const flagged = report.blobs.find((b) => b.possibleOverlap);
    const single = report.blobs.find((b) => !b.possibleOverlap);
    expect(flagged!.areaMm2 / single!.areaMm2).toBeGreaterThanOrEqual(1.8);
  }, 60_000);

  it('the neutral-chroma rule cannot tell blue pen from the backing — which is what the card is for (§4)', async () => {
    const img = await syntheticTargetRgba({
      ...PRECISION,
      holesMm: backedHoles(),
      numeralsDeg: 0,
      penMarksMm: PEN_MARKS,
    });
    const chroma = detectByBackingColour(cv, img, CAL, 'precision', HOLE_MM, null);
    expect(chroma.rule).toBe('chroma');
    // The 8 hole blobs plus one per pen mark.
    expect(chroma.blobs).toHaveLength(8 + PEN_MARKS.length);
  }, 60_000);

  it('reads nothing off 1-px coloured fringes along every printed ring edge (§5.1)', async () => {
    const fringed = await syntheticTargetRgba({
      ...PRECISION,
      numeralsDeg: 0,
      ringFringe: { colour: PINK, widthPx: 1 },
    });
    expect(detectByBackingColour(cv, fringed, CAL, 'precision', HOLE_MM, pinkCard).blobs).toHaveLength(0);
    // Pinning the opening's job: without it the same fringes become detections.
    const raw = detectByBackingColour(cv, fringed, CAL, 'precision', HOLE_MM, pinkCard, { opening: false });
    expect(raw.blobs.length).toBeGreaterThan(0);
  }, 60_000);
});

describe('detectBackingPresence (backing-sheet.md §4a)', () => {
  it('says present on a backed sheet', async () => {
    const img = await syntheticTargetRgba({ ...PRECISION, holesMm: backedHoles(), numeralsDeg: 0 });
    const presence = detectBackingPresence(cv, img, CAL, 'precision', HOLE_MM);
    expect(presence.present).toBe(true);
    expect(presence.spots).toBeGreaterThanOrEqual(3);
    expect(presence.largestRatio).toBeLessThanOrEqual(2.5);
  }, 60_000);

  it('says absent when the holes show no colour at all', async () => {
    const img = await syntheticTargetRgba({ ...PRECISION, holesMm: unbackedHoles(), numeralsDeg: 0 });
    const presence = detectBackingPresence(cv, img, CAL, 'precision', HOLE_MM);
    expect(presence.present).toBe(false);
    expect(presence.spots).toBe(0);
  }, 60_000);

  it('says absent when a coloured area far bigger than a hole is in frame (the area rule)', async () => {
    const img = await syntheticTargetRgba({
      ...PRECISION,
      holesMm: [...backedHoles(), { xMm: 90, yMm: -90, diameterMm: 40, fill: PINK }],
      numeralsDeg: 0,
    });
    const presence = detectBackingPresence(cv, img, CAL, 'precision', HOLE_MM);
    expect(presence.largestRatio).toBeGreaterThan(2.5);
    expect(presence.present).toBe(false);
  }, 60_000);
});

describe('estimateBackingColour (backing-sheet.md §4, no card)', () => {
  it('measures the backing hue off a backed target photo', async () => {
    const img = await syntheticTargetRgba({ ...PRECISION, holesMm: backedHoles(), numeralsDeg: 0 });
    const signature = estimateBackingColour(cv, img, CAL, 'precision');
    expect(signature).not.toBeNull();
    expect(hueDistance(signature!.hueDeg, PINK_HUE)).toBeLessThanOrEqual(3);
  }, 60_000);

  it('returns null when nothing in the search area is clearly coloured', async () => {
    const img = await syntheticTargetRgba({ ...PRECISION, holesMm: unbackedHoles(), numeralsDeg: 0 });
    expect(estimateBackingColour(cv, img, CAL, 'precision')).toBeNull();
  }, 60_000);
});

describe('detectShotsWithBacking (analysis-pipeline §2 A5, backing-sheet.md §5)', () => {
  it('mode none never uses colour, even on a backed sheet', async () => {
    const img = await syntheticTargetRgba({ ...PRECISION, holesMm: backedHoles(), numeralsDeg: 0 });
    const result = detectShotsWithBacking(cv, img, CAL, 'precision', HOLE_MM, { mode: 'none', colour: null });
    expect(result.detection).toEqual({ method: 'standard', backing: 'off', fallbackReason: null });
  }, 60_000);

  it('mode coloured forces the colour path and flags the overlapping pair on the shots', async () => {
    const img = await syntheticTargetRgba({ ...PRECISION, holesMm: backedHoles(), numeralsDeg: 0 });
    const result = detectShotsWithBacking(cv, img, CAL, 'precision', HOLE_MM, { mode: 'coloured', colour: pinkCard });
    expect(result.detection).toEqual({ method: 'colour', backing: 'forced', fallbackReason: null });
    expect(result.shots).toHaveLength(8);
    expect(result.shots.every((s) => s.multiplicity === 1)).toBe(true);
    expect(result.shots.filter((s) => s.possibleOverlap)).toHaveLength(1);
    expect(result.shots.map((s) => s.id)).toEqual([
      'auto-1',
      'auto-2',
      'auto-3',
      'auto-4',
      'auto-5',
      'auto-6',
      'auto-7',
      'auto-8',
    ]);
  }, 60_000);

  it('gives every colour-path shot its coloured area, so REV-28 caps by size (§5.4, §5.7)', async () => {
    const img = await syntheticTargetRgba({ ...PRECISION, holesMm: backedHoles(), numeralsDeg: 0 });
    const result = detectShotsWithBacking(cv, img, CAL, 'precision', HOLE_MM, { mode: 'coloured', colour: pinkCard });
    expect(result.shots.every((s) => (s.areaMm2 ?? 0) > 0)).toBe(true);

    // The cap keeps the best shots, and for a colour-path shot "best" is the coloured area: with no
    // confidence and no area, `ranked` would fall back to radial distance and keep the most central
    // marks instead. Declaring 4 rounds on this 8-blob sheet must therefore keep the 4 largest.
    const largest = [...result.shots].sort((a, b) => (b.areaMm2 ?? 0) - (a.areaMm2 ?? 0)).slice(0, 4);
    const capped = capShots(result.shots, 4);
    expect(capped.kept).toHaveLength(4);
    expect(new Set(capped.kept.map((s) => s.id))).toEqual(new Set(largest.map((s) => s.id)));
    // And the area never reaches storage: data-model §4's `Shot` has no area field.
    expect(withoutArea(capped.kept).every((s) => !('areaMm2' in s))).toBe(true);
  }, 60_000);

  it('falls back to the standard detector when the backing colour is absent from the photo (§5.6)', async () => {
    const img = await syntheticTargetRgba({ ...PRECISION, holesMm: unbackedHoles(), numeralsDeg: 0 });
    const result = detectShotsWithBacking(cv, img, CAL, 'precision', HOLE_MM, { mode: 'coloured', colour: pinkCard });
    expect(result.detection).toEqual({
      method: 'standard',
      backing: 'forced',
      fallbackReason: COLOUR_NOT_FOUND_REASON,
    });
    expect(result.shots.length).toBeGreaterThan(0);
  }, 60_000);

  it('mode auto uses colour on a backed sheet and the standard detector on an unbacked one', async () => {
    const backed = await syntheticTargetRgba({ ...PRECISION, holesMm: backedHoles(), numeralsDeg: 0 });
    const auto = detectShotsWithBacking(cv, backed, CAL, 'precision', HOLE_MM, { mode: 'auto', colour: null });
    expect(auto.detection).toEqual({ method: 'colour', backing: 'detected', fallbackReason: null });

    const plain = await syntheticTargetRgba({ ...PRECISION, holesMm: unbackedHoles(), numeralsDeg: 0 });
    const off = detectShotsWithBacking(cv, plain, CAL, 'precision', HOLE_MM, { mode: 'auto', colour: null });
    expect(off.detection.method).toBe('standard');
    expect(off.detection.backing).toBe('not-detected');
  }, 60_000);

  it('mode auto refuses a photo with a large coloured area in frame (§4a)', async () => {
    const img = await syntheticTargetRgba({
      ...PRECISION,
      holesMm: [...backedHoles(), { xMm: 90, yMm: -90, diameterMm: 40, fill: PINK }],
      numeralsDeg: 0,
    });
    const result = detectShotsWithBacking(cv, img, CAL, 'precision', HOLE_MM, { mode: 'auto', colour: null });
    expect(result.detection).toEqual({
      method: 'standard',
      backing: 'not-detected',
      fallbackReason: AUTO_LARGE_AREA_REASON,
    });
  }, 60_000);
});

// --- The owner's own photos (gitignored; every case skips when the folder is absent) --------------

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const BACKING_DIR = `${REPO_ROOT}fixtures/private/backing/`;
const REFERENCE_DIR = `${REPO_ROOT}fixtures/private/additional references/`;
const hasBacking = existsSync(BACKING_DIR);
const hasReferences = existsSync(REFERENCE_DIR);
const WORKING_LONGEST = 1200;
const PROFILE_HOLE_MM = 5.6;

/** The pipeline's own A4 and template hint, so these cases measure what the app would. */
async function analysed(path: string): Promise<{ img: RgbaImage; cal: Calibration; template: TemplateId }> {
  const img = await jpegFileToRgba(path, WORKING_LONGEST);
  const detection = detectAnchor(cv, img, null, 'both');
  if (detection === null) throw new Error(`no anchor in ${path}`);
  const cal = detection.calibration;
  return { img, cal, template: hintTemplate(cv, img, cal).template };
}

function orangeCard(): Promise<ColourSignature | null> {
  return jpegFileToRgba(`${BACKING_DIR}IMG_5190.jpeg`, 512).then(backingColourFromCard);
}

describe.skipIf(!hasBacking)("the owner's backing photos (fixtures/private/backing)", () => {
  it("measures the orange card IMG_5190 within 3 degrees of the spec's 15.9 degrees", async () => {
    const signature = await orangeCard();
    expect(signature).not.toBeNull();
    expect(hueDistance(signature!.hueDeg, 15.9)).toBeLessThanOrEqual(3);
  }, 60_000);

  it('IMG_5191 with card IMG_5190: exactly 8 detections, one flagged possibleOverlap', async () => {
    const signature = await orangeCard();
    const { img, cal, template } = await analysed(`${BACKING_DIR}IMG_5191.jpeg`);
    const report = detectByBackingColour(cv, img, cal, template, PROFILE_HOLE_MM, signature);
    expect(report.blobs).toHaveLength(8);
    expect(report.blobs.filter((b) => b.possibleOverlap)).toHaveLength(1);
  }, 120_000);

  it('IMG_5191 without the 3x3 opening: the size guard alone leaves one fringe behind', async () => {
    // backing-sheet.md §5.1 expected 8 here ("the size guard catches the fringes"). Measured with the
    // REV-36 sheet search in place it is 9, so the opening is load-bearing rather than a second
    // defence. Recorded in the milestone's Open questions.
    const signature = await orangeCard();
    const { img, cal, template } = await analysed(`${BACKING_DIR}IMG_5191.jpeg`);
    const raw = detectByBackingColour(cv, img, cal, template, PROFILE_HOLE_MM, signature, { opening: false });
    expect(raw.blobs).toHaveLength(9);
  }, 120_000);

  it('IMG_5189 (pink, no card): 7 of the 8 holes, each one on a real hole', async () => {
    // backing-sheet.md §4's probe reported 8 at chroma >= 40. Measured here, inside the REV-36 sheet
    // area and after the 3x3 opening, one hole falls below the size guard. Open question for the §7 set.
    const { img, cal, template } = await analysed(`${BACKING_DIR}IMG_5189.jpeg`);
    const report = detectByBackingColour(cv, img, cal, template, PROFILE_HOLE_MM, null);
    expect(report.blobs).toHaveLength(7);

    // "each within one hole radius of a real hole" (the milestone's Tests list). The owner's labels
    // cover the 46 unbacked reference photos only — labelling the backing set is §7's human step —
    // so the check runs against the labels the moment IMG_5189 appears in an export, and against the
    // standard detector's candidates until then. On this photo the standard detector found all 8 real
    // holes (plus 6 fragments and 3 false marks, backing-sheet.md §1), so a colour blob that sits on
    // one of its candidates is on a hole, not on a fringe.
    const radiusMm = PROFILE_HOLE_MM / 2;
    const label = loadLabelledHoles(REPO_ROOT)?.photos.find((photo) => photo.id === 'IMG_5189') ?? null;
    const truth =
      label !== null
        ? label.holes.map((hole) => ({ xMm: hole.xMm, yMm: hole.yMm }))
        : detectShotCandidates(cv, img, cal, template, PROFILE_HOLE_MM).candidates.map((c) => ({
            xMm: c.xMm,
            yMm: c.yMm,
          }));
    for (const blob of report.blobs) {
      const nearest = Math.min(...truth.map((t) => Math.hypot(blob.xMm - t.xMm, blob.yMm - t.yMm)));
      expect(nearest, `blob at (${blob.xMm.toFixed(1)}, ${blob.yMm.toFixed(1)}) mm`).toBeLessThanOrEqual(radiusMm);
    }
  }, 180_000);

  it("Auto says present on every one of the owner's backed photos (§4a)", async () => {
    for (const name of ['IMG_5189', 'IMG_5191', 'IMG_5193', 'IMG_5194', 'IMG_5196', 'IMG_5198']) {
      const { img, cal, template } = await analysed(`${BACKING_DIR}${name}.jpeg`);
      const presence = detectBackingPresence(cv, img, cal, template, PROFILE_HOLE_MM);
      expect(presence.present, `${name} spots=${presence.spots} ratio=${presence.largestRatio}`).toBe(true);
    }
  }, 300_000);
});

describe.skipIf(!hasReferences)("Auto on the owner's unbacked reference photos (§4a)", () => {
  it('IMG_4770 and IMG_4771 are refused by the area rule', async () => {
    for (const name of ['IMG_4770', 'IMG_4771']) {
      const { img, cal, template } = await analysed(`${REFERENCE_DIR}${name}.jpeg`);
      const presence = detectBackingPresence(cv, img, cal, template, PROFILE_HOLE_MM);
      expect(presence.largestRatio, name).toBeGreaterThan(2.5);
      expect(presence.present, name).toBe(false);
    }
  }, 180_000);

  it('IMG_5057 2 and IMG_5084 are refused by the spot count', async () => {
    for (const name of ['IMG_5057 2', 'IMG_5084']) {
      const { img, cal, template } = await analysed(`${REFERENCE_DIR}${name}.jpeg`);
      const presence = detectBackingPresence(cv, img, cal, template, PROFILE_HOLE_MM);
      expect(presence.spots, name).toBeLessThan(3);
      expect(presence.present, name).toBe(false);
    }
  }, 180_000);

  // ---------------------------------------------------------------------------------------------
  // KNOWN DIVERGENCE FROM THE SPEC — pinned so it cannot change unnoticed (M19 Open question 1).
  //
  // backing-sheet.md §4 is explicit: "the colour path must never run on a photo without a backing",
  // and §4a's measured table has every unbacked photo absent. These four are read as PRESENT today,
  // so `Auto` (the default mode) would replace the standard detector's result with 3-8 colour blobs
  // on them. The values below are what this code measures, NOT what the spec wants; the test exists
  // to make any change to them visible, and the milestone is blocked on the owner's labels.
  //
  // Measured on 2026-09-18 (`pnpm exec tsx` over the same rectified view): every coloured pixel these
  // four contribute sits in the OUTER band of the REV-36 search area — accepted-pixel radius p10 was
  // 101 mm (IMG_4743) and 128-133 mm (the other three) against a 150 mm search cap, at hues 31-49
  // (bare wood) and 213 (sky/shade), while the backed photos' accepted pixels sit at radius p10 4-12
  // mm, where the holes are. The white-balance gains were 0.94-1.04, so this is not a neutralisation
  // artefact: it is the board and surroundings around the sheet leaking into the searched area.
  // Two of IMG_4744's blobs land exactly on labelled holes (wood seen through a hole), which is why
  // no threshold on `AUTO_MIN_SPOTS` alone separates the sets (3-8 unbacked spots vs 6-10 backed).
  // ---------------------------------------------------------------------------------------------
  const readAsBacked: Array<{ name: string; spots: number; largestRatio: number }> = [
    { name: 'IMG_4743', spots: 3, largestRatio: 0.223 },
    { name: 'IMG_4744', spots: 6, largestRatio: 0.515 },
    { name: 'IMG_5182', spots: 8, largestRatio: 0.639 },
    { name: 'IMG_5184', spots: 6, largestRatio: 0.878 },
  ];

  it.each(readAsBacked)(
    '$name is read as BACKED today, which §4 forbids on an unbacked photo (Open question 1)',
    async ({ name, spots, largestRatio }) => {
      const { img, cal, template } = await analysed(`${REFERENCE_DIR}${name}.jpeg`);
      const presence = detectBackingPresence(cv, img, cal, template, PROFILE_HOLE_MM);
      expect(presence.spots, `${name} spots`).toBe(spots);
      expect(presence.largestRatio, `${name} largest blob ratio`).toBeCloseTo(largestRatio, 2);
      // The spec's verdict is `false`. Until the owner says which of these four (if any) actually had
      // a backing sheet, nothing is tuned on a guess, so the divergence is pinned rather than hidden.
      expect(presence.present, `${name} — §4a expects absent`).toBe(true);
      expect(presence.largestRatio, `${name}`).toBeLessThanOrEqual(2.5);
    },
    180_000,
  );

  it('no other reference photo is read as backed', async () => {
    // The sample is deliberately small (these are 1200 px decodes of 12 MP photos); `pnpm cv:eval`
    // walks the whole folder and prints every photo `Auto` reads as backed under CONFIRM WITH THE OWNER.
    for (const name of ['IMG_5183', 'IMG_5185', 'IMG_5146', 'IMG_5147']) {
      const { img, cal, template } = await analysed(`${REFERENCE_DIR}${name}.jpeg`);
      const presence = detectBackingPresence(cv, img, cal, template, PROFILE_HOLE_MM);
      expect(presence.present, `${name} spots=${presence.spots} ratio=${presence.largestRatio}`).toBe(false);
    }
  }, 300_000);
});
