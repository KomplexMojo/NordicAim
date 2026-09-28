#!/usr/bin/env node
// Issue #65 / #67 (REV-135): the printable NordicAim training sheets, one US Letter PDF per template, two pages each (sighting:
// sight in, confirm; precision: prone, standing). Each page has the app's own template geometry, four AprilTag 36h11 corner
// markers whose ids encode the sheet version, target kind and corner, a 100 mm scale bar, write-in lines, and no print between
// the outer ring and the markers. The kind's mark and name sit at the top centre, under the clipboard clamp (REV-138), so a sheet
// hung on its own is easy to tell apart; the mark is the app's own (`renderPatternViewMark`), so it never drifts from the results.
//
//   pnpm make:test-sheets [outDir]     # tsx scripts/make-test-sheets.mjs; default public/sheets/
//
// Print at 100% / Actual size. Chromium writes the PDFs, so every length below is exact millimetres on paper.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderPatternViewMark, VIEW_MARK_VIEWBOX } from '../src/lib/render/diagram-marks.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// US Letter, mm. The target's centre is the page centre.
export const PAGE = { w: 215.9, h: 279.4 };
const CX = PAGE.w / 2;
const CY = PAGE.h / 2;

// AprilTag 36h11 markers: 8 × 8 cells (6 × 6 data inside a 1-cell black border), 20 mm wide, centres 170 × 210 mm apart.
export const MARK = { size: 20, cells: 8, dx: 85, dy: 105, quiet: 4 };
export const SHEET_VERSION = 1;
export const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
export const KINDS = [
  { id: 'sight-in', label: 'Sight in', code: 0, template: 'sighting' },
  { id: 'confirm', label: 'Confirm', code: 1, template: 'sighting' },
  { id: 'precision-prone', label: 'Precision prone', code: 2, template: 'precision' },
  { id: 'precision-standing', label: 'Precision standing', code: 3, template: 'precision' },
];
export const SHEETS = [
  { template: 'sighting', file: 'nordicaim-sighting-letter.pdf', title: 'Sighting sheet' },
  { template: 'precision', file: 'nordicaim-precision-letter.pdf', title: 'Precision sheet' },
];
/** The clipboard clamp's zone at the top centre: only the kind's mark and name are printed in it (REV-138). */
export const CLAMP = { halfWidth: 70, depth: 22 };
/** The kind's mark: 17 mm across, its top 5 mm below the paper's edge (inside most printers' margins), with its name in 8 mm bold. */
export const KIND_MARK = { size: 17, top: 5, gap: 3, label: 8 };

/** The marker id for a corner (0..3, CORNERS order) of a kind: version << 4 | kind << 2 | corner. */
export function markerId(kindCode, corner, version = SHEET_VERSION) {
  return (version << 4) | (kindCode << 2) | corner;
}

/** The marker's cells, row by row, 1 = black, from OpenCV's own AprilTag 36h11 dictionary. */
export function markerCells(cv, id) {
  const dict = cv.getPredefinedDictionary(cv.DICT_APRILTAG_36h11);
  const img = new cv.Mat();
  try {
    cv.generateImageMarker(dict, id, MARK.cells, img, 1);
    const rows = [];
    for (let r = 0; r < MARK.cells; r += 1) {
      const row = [];
      for (let c = 0; c < MARK.cells; c += 1) row.push(img.ucharAt(r, c) < 128 ? 1 : 0);
      rows.push(row);
    }
    return rows;
  } finally {
    img.delete();
  }
}

// src/lib/defaults/templates.ts, copied here so the script needs no build step. Keep in step with it.
const PRECISION = {
  rings: { 10: 10.4, 9: 26.4, 8: 42.4, 7: 58.4, 6: 74.4, 5: 90.4, 4: 106.4, 3: 122.4, 2: 138.4, 1: 154.4 },
  innerTen: 5.0,
  black: 112.4,
};
const SIGHTING = { disc: 115, proneSolid: 45, proneGuide: 40, standingGuide: 110, inner: 15 };

const f = (n) => Number(n.toFixed(3));
const circle = (r, attrs) => `<circle cx="${f(CX)}" cy="${f(CY)}" r="${f(r)}" ${attrs}/>`;
const LINE = 0.25;

function precisionTarget() {
  let s = circle(PRECISION.black / 2, 'fill="#000"');
  // Rings 4 to 10 lie on the black aiming mark, so they are white; 1 to 3 are black on the paper. No ring numbers.
  for (const d of Object.values(PRECISION.rings)) {
    s += circle(d / 2, `fill="none" stroke="${d < PRECISION.black ? '#fff' : '#000'}" stroke-width="${LINE}"`);
  }
  s += circle(PRECISION.innerTen / 2, `fill="none" stroke="#fff" stroke-width="${LINE}"`);
  return s;
}

function sightingTarget() {
  let s = circle(SIGHTING.disc / 2, 'fill="#000"');
  s += circle(SIGHTING.standingGuide / 2, `fill="none" stroke="#fff" stroke-width="${LINE}" stroke-dasharray="3 2"`);
  // The whole disc is black, centre included (owner, 2026-09-28): the prone zone and the inner circle are white lines on it,
  // not a white centre.
  s += circle(SIGHTING.proneSolid / 2, `fill="none" stroke="#fff" stroke-width="${LINE}"`);
  s += circle(SIGHTING.proneGuide / 2, `fill="none" stroke="#fff" stroke-width="${LINE}" stroke-dasharray="2 1.5"`);
  s += circle(SIGHTING.inner / 2, `fill="none" stroke="#fff" stroke-width="${LINE}"`);
  return s;
}

/** A marker's top-left corner on the page, mm. */
export function markerOrigin(corner) {
  const sx = corner % 2 === 0 ? -1 : 1;
  const sy = corner < 2 ? -1 : 1;
  return { x: CX + sx * MARK.dx - MARK.size / 2, y: CY + sy * MARK.dy - MARK.size / 2 };
}

function marker(cells, corner) {
  const { x, y } = markerOrigin(corner);
  const cell = MARK.size / MARK.cells;
  // One path for the whole marker, so no hairline seams appear between neighbouring black cells.
  let d = '';
  cells.forEach((row, r) =>
    row.forEach((b, c) => {
      if (b === 1) d += `M${f(x + c * cell)} ${f(y + r * cell)}h${f(cell)}v${f(cell)}h${f(-cell)}z`;
    }),
  );
  return `<path d="${d}" fill="#000" shape-rendering="crispEdges"/>`;
}

function text(x, y, size, body, anchor = 'middle', weight = 'normal') {
  return `<text x="${f(x)}" y="${f(y)}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" font-family="Helvetica, Arial, sans-serif" fill="#000">${body}</text>`;
}

/** The kind's mark (the app's own drawing, REV-79/86) and its name, centred together at the top of the page. */
export function kindMark(kind) {
  const [vx, vy, vw] = VIEW_MARK_VIEWBOX.split(' ').map(Number);
  const k = KIND_MARK.size / vw;
  // Helvetica bold's average advance is about 0.58 em: enough to centre mark and name as one block.
  const labelWidth = kind.label.length * KIND_MARK.label * 0.58;
  const width = KIND_MARK.size + KIND_MARK.gap + labelWidth;
  const x0 = CX - width / 2;
  const mark = `<g data-kind="${kind.id}" transform="translate(${f(x0 - vx * k)} ${f(KIND_MARK.top - vy * k)}) scale(${f(k)})">${renderPatternViewMark(kind.id)}</g>`;
  const baseline = KIND_MARK.top + KIND_MARK.size / 2 + KIND_MARK.label * 0.35;
  return mark + text(x0 + KIND_MARK.size + KIND_MARK.gap, baseline, KIND_MARK.label, kind.label, 'start', 'bold');
}

/** The bottom band, between the bottom markers and below their inner edge: scale bar and write-in lines. */
export const BAND = { x0: CX - MARK.dx + MARK.size / 2 + MARK.quiet + 1, x1: CX + MARK.dx - MARK.size / 2 - MARK.quiet - 1 };

function scaleBar(y) {
  const x0 = CX - 50;
  let s = `<line x1="${f(x0)}" y1="${f(y)}" x2="${f(x0 + 100)}" y2="${f(y)}" stroke="#000" stroke-width="0.3"/>`;
  for (let i = 0; i <= 10; i += 1) {
    const h = i % 5 === 0 ? 3 : 1.5;
    s += `<line x1="${f(x0 + i * 10)}" y1="${f(y - h)}" x2="${f(x0 + i * 10)}" y2="${f(y)}" stroke="#000" stroke-width="0.3"/>`;
  }
  return s + text(CX, y + 3.2, 2.4, '100 mm');
}

function writeIns(y) {
  const fields = [
    { label: 'Name', w: 58 },
    { label: 'Date', w: 34 },
    { label: 'String', w: 24 },
  ];
  const gap = (BAND.x1 - BAND.x0 - fields.reduce((a, b) => a + b.w, 0)) / (fields.length - 1);
  let x = BAND.x0;
  let s = '';
  for (const fl of fields) {
    s += text(x, y - 1, 2.6, fl.label, 'start');
    s += `<line x1="${f(x + 10)}" y1="${f(y)}" x2="${f(x + fl.w)}" y2="${f(y)}" stroke="#000" stroke-width="0.2"/>`;
    x += fl.w + gap;
  }
  return s;
}

function page(cv, kind) {
  const target = kind.template === 'precision' ? precisionTarget() : sightingTarget();
  const markers = CORNERS.map((_, corner) => marker(markerCells(cv, markerId(kind.code, corner)), corner)).join('');
  const bottomMarkerTop = CY + MARK.dy - MARK.size / 2;
  const body = [
    kindMark(kind),
    target,
    markers,
    scaleBar(bottomMarkerTop + 5),
    writeIns(bottomMarkerTop + 17),
    text(CX, PAGE.h - 15, 3.4, `NordicAim · ${kind.label} · sheet v${SHEET_VERSION} · training sheet`),
    text(CX, PAGE.h - 10.5, 2.6, 'Print at 100% / Actual size on US Letter: the bar above must measure exactly 100 mm.'),
    text(CX, PAGE.h - 6.5, 2.4, 'github.com/KomplexMojo/NordicAim · shoot on the coloured backing · photograph all four corner markers'),
  ].join('');
  return `<section><svg xmlns="http://www.w3.org/2000/svg" width="${PAGE.w}mm" height="${PAGE.h}mm" viewBox="0 0 ${PAGE.w} ${PAGE.h}">${body}</svg></section>`;
}

/** One template's pages (its two kinds) as a printable HTML document. */
export function sheetHtml(cv, template) {
  const pages = KINDS.filter((k) => k.template === template).map((k) => page(cv, k));
  return `<!doctype html><html><head><style>
      @page { size: ${PAGE.w}mm ${PAGE.h}mm; margin: 0; }
      html, body { margin: 0; padding: 0; }
      section { width: ${PAGE.w}mm; height: ${PAGE.h}mm; page-break-after: always; overflow: hidden; }
      section:last-child { page-break-after: auto; }
      svg { display: block; }
    </style></head><body>${pages.join('')}</body></html>`;
}

async function main() {
  const outDir = process.argv[2] ?? join(ROOT, 'public/sheets');
  mkdirSync(outDir, { recursive: true });
  const cv = await (await import('@techstark/opencv-js')).default;
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
  try {
    const p = await browser.newPage();
    for (const sheet of SHEETS) {
      await p.setContent(sheetHtml(cv, sheet.template));
      const path = join(outDir, sheet.file);
      await p.pdf({ path, preferCSSPageSize: true, printBackground: true });
      console.log(`wrote ${path}`);
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
