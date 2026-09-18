// Synthetic sighting/precision sheets for the CV unit tests and `scripts/cv-eval.ts` (M10).
// The sheet is drawn straight from a `Calibration`, so the calibration the test expects back is known
// exactly: every printed circle is an ellipse of diameter d mm with rx = (d/2) * scale,
// ry = rx * axisRatio, rotated by `angleDeg` clockwise (geometry-scoring §2).

import type { TemplateId } from '@/lib/domain/enums';
import type { Calibration } from '@/lib/domain/photo';
import { mmToPx } from '@/lib/geometry/transform';
import type { RgbaImage } from '@/lib/media/format';
import { ANCHOR_DIAMETER_MM } from '@/lib/cv/anchor';
import { numeralCentresMm } from '@/lib/cv/print-mask';
import { PRECISION_TEMPLATE, SIGHTING_TEMPLATE } from '@/lib/defaults/templates';

import { svgToRgba } from './rgba';

export const PAPER = '#F4F2EE';
export const INK = '#181818';
export const LINE_MM = 0.35;

/**
 * M11: a fired hole is torn paper and backing — much brighter than the printed ink it sits on and
 * much darker than the paper around it, which is exactly the pair of tests M11 step 3 applies. Gray
 * ~166, against ink ~24 and paper ~242.
 */
const HOLE = '#C8A165';
/** M16 R3: the backing board around a sheet — grayer and much darker than the paper. */
const BOARD = '#8E8C88';
/** M16 R3: ground with no paper on it at all, for the segmentation-failure case. */
const NO_PAPER = '#3C3A37';
/** M16 R1: hole appearances. `tan` is M11's torn paper; the rest are the kinds the owner's photos show. */
const HOLE_STYLES = {
  tan: { fill: HOLE, rim: null },
  dark: { fill: '#000000', rim: null },
  bright: { fill: '#D8D4CC', rim: null },
  /** A hole whose core is as dark as the ink, visible only by its torn, lighter edge (2 mm wide). */
  rim: { fill: INK, rim: '#9A968E' },
  /** A dark hole on paper: the board seen through it. */
  paperDark: { fill: '#3A3834', rim: null },
} as const;
export type SyntheticHoleStyle = keyof typeof HOLE_STYLES;
/** geometry-scoring §1.1: the .22 LR hole the profile assumes. */
export const SYNTHETIC_HOLE_DIAMETER_MM = 5.6;

export interface SyntheticHole {
  xMm: number;
  yMm: number;
  /** Defaults to {@link SYNTHETIC_HOLE_DIAMETER_MM}. */
  diameterMm?: number;
  /** M16 R1: how the hole looks. Defaults to `tan`. */
  style?: SyntheticHoleStyle;
}

export interface SyntheticTargetSpec {
  template: TemplateId;
  width: number;
  height: number;
  cx: number;
  cy: number;
  radiusPx: number;
  axisRatio: number;
  angleDeg: number;
  /** M11: bullet holes to punch through the sheet, in target mm (+x right, +y up). */
  holesMm?: SyntheticHole[];
  /**
   * M16 (REV-32): a shadow gradient across the whole sheet, as the opacity of a black wash at the
   * right-hand edge (0 at the left). One pair of global thresholds cannot cope with it; a tile's own
   * median and MAD can.
   */
  shadowOpacity?: number;
  /**
   * M16 R3: the paper sheet, as a rectangle in target mm (+y up) with the backing board around it.
   * Omitted, the paper fills the whole image as before. `holesMm` outside it land on the board.
   */
  sheetMm?: { left: number; right: number; bottom: number; top: number };
  /** M16 R3: no paper at all — the target is printed straight onto board-coloured ground. */
  noPaper?: boolean;
  /** M16 R2: draw the 32 precision numerals (as glyph blocks) with their axes at this angle. */
  numeralsDeg?: number;
}

/** A hole at `radialMm` from the centre, `angleDeg` counter-clockwise from +x in target space. */
export function polarHole(radialMm: number, angleDeg: number): SyntheticHole {
  const theta = (angleDeg * Math.PI) / 180;
  return { xMm: radialMm * Math.cos(theta), yMm: radialMm * Math.sin(theta) };
}

/**
 * M11 Tests, case 1: eight separate holes on a precision sheet. Six sit in the clear gaps between
 * printed ring lines; the two marked below are deliberately clipped by one (their centre is 2.3 mm
 * from a ring radius, so step 4's +/-0.9 mm erase takes a cap off the blob).
 */
export const PRECISION_TEST_HOLES: SyntheticHole[] = [
  polarHole(9.2, 200),
  polarHole(17.2, 140),
  polarHole(18.9, 40), // clipped by ring 8 (21.2 mm)
  polarHole(25.2, 260),
  polarHole(33.2, 20),
  polarHole(41.2, 310),
  polarHole(50.9, 95), // clipped by ring 3 (53.2 mm)
  polarHole(65.2, 170), // on the white paper outside the black aiming mark
];

/**
 * M11 Tests, case 2: four holes on a sighting sheet, two of them overlapping with their centres
 * 3 mm apart. The overlapping pair's union is ~1.65 holes of area, which is what makes it a cluster
 * of multiplicity 2 under step 5.
 */
export const SIGHTING_TEST_HOLES: SyntheticHole[] = [
  { xMm: 12, yMm: 33 },
  { xMm: 14.6, yMm: 34.5 }, // 3.0 mm from the one above
  { xMm: -30, yMm: -20 },
  { xMm: 5, yMm: -40 },
];

/**
 * M16 R3 Tests: a letter-size sheet around the precision target (216 x 279 mm, the target 110 mm above
 * the bottom edge), and holes in the backing board beside it that must never be detected.
 */
export const LETTER_SHEET_MM = { left: -108, right: 108, bottom: -110, top: 169 };
export const BACKING_BOARD_HOLES: SyntheticHole[] = [
  { xMm: -122, yMm: 20, style: 'paperDark' },
  { xMm: 124, yMm: -40, style: 'paperDark' },
  { xMm: 30, yMm: -124, style: 'paperDark' },
];
/** M16 R3 Tests: holes on the paper beyond M16's first bound (82.2 mm), which must now be found. */
export const FAR_PAPER_HOLES: SyntheticHole[] = [
  { xMm: 0, yMm: 100, style: 'paperDark' },
  { xMm: -92, yMm: -30, style: 'paperDark' },
];

/** The calibration the synthetic sheet was drawn with — the ground truth for a detection test. */
export function syntheticCalibration(spec: SyntheticTargetSpec): Calibration {
  return {
    cx: spec.cx,
    cy: spec.cy,
    radiusPx: spec.radiusPx,
    axisRatio: spec.axisRatio,
    angleDeg: spec.angleDeg,
    anchorDiameterMm: ANCHOR_DIAMETER_MM[spec.template],
    source: 'auto',
    confidence: null,
  };
}

export function syntheticTargetSvg(spec: SyntheticTargetSpec): string {
  const anchorMm = ANCHOR_DIAMETER_MM[spec.template];
  const pxPerMm = spec.radiusPx / (anchorMm / 2);
  const rotate = `rotate(${spec.angleDeg} ${spec.cx} ${spec.cy})`;
  const lineWidth = Math.max(1, LINE_MM * pxPerMm);

  function ellipse(diameterMm: number, attrs: string): string {
    const rx = (diameterMm / 2) * pxPerMm;
    const ry = rx * spec.axisRatio;
    return `<ellipse cx="${spec.cx}" cy="${spec.cy}" rx="${rx}" ry="${ry}" transform="${rotate}" ${attrs} />`;
  }

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}" viewBox="0 0 ${spec.width} ${spec.height}">`,
    sheetBackground(spec),
  ];

  if (spec.template === 'precision') {
    // Rings printed outside the black aiming mark are dark lines on paper; rings inside it are white.
    for (const [ring, diameterMm] of Object.entries(PRECISION_TEMPLATE.ringDiameterMm)) {
      if (diameterMm <= PRECISION_TEMPLATE.blackDiameterMm) continue;
      void ring;
      parts.push(ellipse(diameterMm, `fill="none" stroke="${INK}" stroke-width="${lineWidth}"`));
    }
    parts.push(ellipse(PRECISION_TEMPLATE.blackDiameterMm, `fill="${INK}"`));
    for (const diameterMm of Object.values(PRECISION_TEMPLATE.ringDiameterMm)) {
      if (diameterMm > PRECISION_TEMPLATE.blackDiameterMm) continue;
      parts.push(ellipse(diameterMm, `fill="none" stroke="${PAPER}" stroke-width="${lineWidth}"`));
    }
    parts.push(ellipse(PRECISION_TEMPLATE.innerTenDiameterMm, `fill="none" stroke="${PAPER}" stroke-width="${lineWidth}"`));
    if (spec.numeralsDeg !== undefined) parts.push(numeralGlyphs(spec, spec.numeralsDeg));
  } else {
    // On the real sheet (docs/reference/IMG_5057-sighting.jpg) every zone marking is a thin WHITE line
    // on the black disc: the disc itself stays solid, which is why it measures fill 0.962 against the
    // REV-26 guard. Drawing the prone zone as a filled white circle instead punches ~15% out of the
    // disc and drops it to 0.845, below the 0.85 guard.
    const dash = `${(2 * pxPerMm).toFixed(2)} ${(2 * pxPerMm).toFixed(2)}`;
    parts.push(ellipse(SIGHTING_TEMPLATE.anchor.diameterMm, `fill="${INK}"`));
    parts.push(
      ellipse(
        SIGHTING_TEMPLATE.zones.standing.guideDiameterMm,
        `fill="none" stroke="${PAPER}" stroke-width="${lineWidth}" stroke-dasharray="${dash}"`,
      ),
    );
    parts.push(
      ellipse(SIGHTING_TEMPLATE.zones.prone.solidDiameterMm, `fill="none" stroke="${PAPER}" stroke-width="${lineWidth}"`),
    );
    parts.push(
      ellipse(
        SIGHTING_TEMPLATE.zones.prone.guideDiameterMm,
        `fill="none" stroke="${PAPER}" stroke-width="${lineWidth}" stroke-dasharray="${dash}"`,
      ),
    );
    const inner = SIGHTING_TEMPLATE.unscoredCircles[0]?.diameterMm ?? 15;
    parts.push(ellipse(inner, `fill="none" stroke="${PAPER}" stroke-width="${lineWidth}"`));
  }

  parts.push(holeEllipses(spec));
  parts.push(shadowWash(spec));
  parts.push('</svg>');
  return parts.join('');
}

/** M16 R3: the paper — the whole image, a sheet on the backing board, or no paper at all. */
function sheetBackground(spec: SyntheticTargetSpec): string {
  const full = (fill: string): string => `<rect x="0" y="0" width="${spec.width}" height="${spec.height}" fill="${fill}" />`;
  if (spec.noPaper === true) return full(NO_PAPER);
  if (spec.sheetMm === undefined) return full(PAPER);
  const cal = syntheticCalibration(spec);
  const { left, right, bottom, top } = spec.sheetMm;
  const corners = [
    { xMm: left, yMm: top },
    { xMm: right, yMm: top },
    { xMm: right, yMm: bottom },
    { xMm: left, yMm: bottom },
  ].map((p) => mmToPx(p, cal));
  return full(BOARD) + `<polygon points="${corners.map((c) => `${c.x},${c.y}`).join(' ')}" fill="${PAPER}" />`;
}

/**
 * M16 R2: the precision sheet's numerals 1-8 on four axes, as glyph blocks the size measured on the
 * real sheet (about 4 mm tall and 3 mm wide, strokes ~0.6 mm): white on the black mark, black on paper.
 * No fonts — resvg runs without system fonts — so each glyph is a ring with a bar through it.
 */
function numeralGlyphs(spec: SyntheticTargetSpec, axesDeg: number): string {
  const cal = syntheticCalibration(spec);
  const pxPerMm = spec.radiusPx / (cal.anchorDiameterMm / 2);
  const out: string[] = [];
  for (const radial of numeralCentresMm()) {
    for (let axis = 0; axis < 4; axis += 1) {
      const theta = ((axesDeg + 90 * axis) * Math.PI) / 180;
      const centre = mmToPx({ xMm: radial * Math.cos(theta), yMm: radial * Math.sin(theta) }, cal);
      const colour = radial < PRECISION_TEMPLATE.blackDiameterMm / 2 ? PAPER : INK;
      // Measured on IMG_4540: 4 mm tall, except the "3", which fits a 5 mm band at 3.5 mm.
      const w = 3 * pxPerMm;
      const h = (radial > 56.2 && radial < 61.2 ? 3.5 : 4) * pxPerMm;
      const stroke = 0.6 * pxPerMm;
      // The glyph's long side runs radially, as the printed numerals do on every axis.
      const rotate = `rotate(${-(axesDeg + 90 * axis) + 90 + spec.angleDeg} ${centre.x} ${centre.y})`;
      out.push(
        `<g transform="${rotate}"><rect x="${centre.x - w / 2 + stroke / 2}" y="${centre.y - h / 2 + stroke / 2}" ` +
          `width="${w - stroke}" height="${h - stroke}" rx="${w / 3}" fill="none" stroke="${colour}" stroke-width="${stroke}" />` +
          `<line x1="${centre.x - w / 2}" y1="${centre.y}" x2="${centre.x + w / 2}" y2="${centre.y}" stroke="${colour}" stroke-width="${stroke}" /></g>`,
      );
    }
  }
  return out.join('');
}

/** M16 (REV-32): the lighting gradient, painted over everything the way a real shadow falls. */
function shadowWash(spec: SyntheticTargetSpec): string {
  const opacity = spec.shadowOpacity ?? 0;
  if (opacity <= 0) return '';
  return (
    `<defs><linearGradient id="shadow" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0" stop-color="#000" stop-opacity="0" />` +
    `<stop offset="1" stop-color="#000" stop-opacity="${opacity}" /></linearGradient></defs>` +
    `<rect x="0" y="0" width="${spec.width}" height="${spec.height}" fill="url(#shadow)" />`
  );
}

/**
 * Holes are placed through the app's own `mmToPx` (geometry-scoring §2.1), so a test asserting a
 * detected position in mm is comparing against the same transform the detector inverts.
 */
function holeEllipses(spec: SyntheticTargetSpec): string {
  const holes = spec.holesMm ?? [];
  if (holes.length === 0) return '';

  const cal = syntheticCalibration(spec);
  const pxPerMm = spec.radiusPx / (cal.anchorDiameterMm / 2);
  return holes
    .map((hole) => {
      const centre = mmToPx({ xMm: hole.xMm, yMm: hole.yMm }, cal);
      const rx = ((hole.diameterMm ?? SYNTHETIC_HOLE_DIAMETER_MM) / 2) * pxPerMm;
      const ry = rx * spec.axisRatio;
      const style = HOLE_STYLES[hole.style ?? 'tan'];
      const rim = style.rim === null ? '' : ` stroke="${style.rim}" stroke-width="${2 * pxPerMm}"`;
      return (
        `<ellipse cx="${centre.x}" cy="${centre.y}" rx="${rx}" ry="${ry}" ` +
        `transform="rotate(${spec.angleDeg} ${centre.x} ${centre.y})" fill="${style.fill}"${rim} />`
      );
    })
    .join('');
}

export function syntheticTargetRgba(spec: SyntheticTargetSpec): Promise<RgbaImage> {
  return svgToRgba(syntheticTargetSvg(spec));
}

/**
 * REV-26 fixture: a precision sheet whose printed ring numbers all but touch the aiming mark, the way
 * they do on `IMG_5132-precision.jpg`. Two ink bars run from ring 1 inwards and stop `BRIDGE_GAP_PX`
 * short of the mark, so on the pre-CLOSE binary the mark is still its own component (as on the real
 * photo) while any CLOSE welds mark, rings and bars into one blob ~25% too large.
 */
const BRIDGE_GAP_PX = 6;
const BRIDGE_BAR_PX = 24;
const BRIDGE_RING_LINE_MM = 2.0;

export function bridgedPrecisionSvg(spec: SyntheticTargetSpec): string {
  const anchorMm = PRECISION_TEMPLATE.blackDiameterMm;
  const pxPerMm = spec.radiusPx / (anchorMm / 2);
  const ellipse = (diameterMm: number, attrs: string): string =>
    `<ellipse cx="${spec.cx}" cy="${spec.cy}" rx="${(diameterMm / 2) * pxPerMm}" ` +
    `ry="${(diameterMm / 2) * pxPerMm * spec.axisRatio}" ${attrs} />`;

  const outerRings = Object.values(PRECISION_TEMPLATE.ringDiameterMm)
    .filter((d) => d > anchorMm)
    .sort((a, b) => a - b);
  const ringLine = BRIDGE_RING_LINE_MM * pxPerMm;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}" viewBox="0 0 ${spec.width} ${spec.height}">`,
    `<rect x="0" y="0" width="${spec.width}" height="${spec.height}" fill="${PAPER}" />`,
  ];
  for (const diameterMm of outerRings.slice(0, 2)) {
    parts.push(ellipse(diameterMm, `fill="none" stroke="${INK}" stroke-width="${ringLine}"`));
  }
  parts.push(ellipse(anchorMm, `fill="${INK}"`));
  for (const diameterMm of Object.values(PRECISION_TEMPLATE.ringDiameterMm)) {
    if (diameterMm > anchorMm) continue;
    parts.push(ellipse(diameterMm, `fill="none" stroke="${PAPER}" stroke-width="${LINE_MM * pxPerMm}"`));
  }

  const outermost = outerRings[1] ?? outerRings[0] ?? anchorMm;
  const reach = (outermost / 2) * pxPerMm * spec.axisRatio + ringLine;
  const discEdge = spec.radiusPx * spec.axisRatio;
  const barLength = reach - discEdge - BRIDGE_GAP_PX;
  const barX = spec.cx - BRIDGE_BAR_PX / 2;
  parts.push(`<rect x="${barX}" y="${spec.cy - reach}" width="${BRIDGE_BAR_PX}" height="${barLength}" fill="${INK}" />`);
  parts.push(
    `<rect x="${barX}" y="${spec.cy + discEdge + BRIDGE_GAP_PX}" width="${BRIDGE_BAR_PX}" height="${barLength}" fill="${INK}" />`,
  );
  parts.push('</svg>');
  return parts.join('');
}

export function bridgedPrecisionRgba(spec: SyntheticTargetSpec): Promise<RgbaImage> {
  return svgToRgba(bridgedPrecisionSvg(spec));
}

/** Blank paper: no disc at all, so `detectAnchor` must return null. */
export function blankPaperRgba(width: number, height: number): Promise<RgbaImage> {
  return svgToRgba(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<rect x="0" y="0" width="${width}" height="${height}" fill="${PAPER}" /></svg>`,
  );
}
