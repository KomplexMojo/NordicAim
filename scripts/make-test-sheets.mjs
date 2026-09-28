#!/usr/bin/env node
// Issue #65: a printable NordicAim training sheet for testing, one US Letter page per target kind (sight in, confirm, precision
// prone, precision standing). Each page has the app's own template geometry, four corner registration marks (the top-left one has
// a white centre, so orientation is never ambiguous), a bit-strip sheet code, a 100 mm scale bar, and no text near the rings.
//
//   node scripts/make-test-sheets.mjs [out.pdf]     # default docs/print/nordicaim-test-sheets-letter.pdf
//
// Print at 100% / Actual size. Chromium writes the PDF, so every length below is exact millimetres on paper.

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = process.argv[2] ?? `${ROOT}docs/print/nordicaim-test-sheets-letter.pdf`;

// US Letter, mm. The target's centre is the page centre.
const PAGE = { w: 215.9, h: 279.4 };
const CX = PAGE.w / 2;
const CY = PAGE.h / 2;

// Registration marks: 15 mm squares, centres 170 × 210 mm apart around the target centre.
export const MARK = { size: 15, hole: 5, dx: 85, dy: 105 };
// Sheet code: start bit, 2 kind bits, 3 version bits, even parity, stop bit; 5 mm cells on a 6 mm pitch.
export const CODE = { cell: 5, pitch: 6, version: 1 };
export const KINDS = [
  { id: 'sight-in', label: 'Sight in', code: 0, template: 'sighting' },
  { id: 'confirm', label: 'Confirm', code: 1, template: 'sighting' },
  { id: 'precision-prone', label: 'Precision prone', code: 2, template: 'precision' },
  { id: 'precision-standing', label: 'Precision standing', code: 3, template: 'precision' },
];

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
  // Rings 4 to 10 lie on the black aiming mark, so they are white; 1 to 3 are black on the paper.
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

function marks() {
  let s = '';
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const x = CX + sx * MARK.dx - MARK.size / 2;
    const y = CY + sy * MARK.dy - MARK.size / 2;
    s += `<rect x="${f(x)}" y="${f(y)}" width="${MARK.size}" height="${MARK.size}" fill="#000"/>`;
    // Top left: a white centre, so the sheet's orientation (and left from right) is fixed.
    if (sx === -1 && sy === -1) {
      const h = MARK.hole;
      s += `<rect x="${f(x + (MARK.size - h) / 2)}" y="${f(y + (MARK.size - h) / 2)}" width="${h}" height="${h}" fill="#fff"/>`;
    }
  }
  return s;
}

/** The code's bits, left to right: 1, kind (2 bits), version (3 bits), even parity over kind and version, 1. */
export function codeBits(kindCode, version) {
  const data = [(kindCode >> 1) & 1, kindCode & 1, (version >> 2) & 1, (version >> 1) & 1, version & 1];
  const parity = data.reduce((a, b) => a + b, 0) % 2;
  return [1, ...data, parity, 1];
}

function codeStrip(kindCode) {
  const bits = codeBits(kindCode, CODE.version);
  const width = (bits.length - 1) * CODE.pitch + CODE.cell;
  const x0 = CX - width / 2;
  const y = CY + MARK.dy - CODE.cell / 2;
  // A thin frame shows where the strip is, even when most bits are 0.
  let s = `<rect x="${f(x0 - 1.5)}" y="${f(y - 1.5)}" width="${f(width + 3)}" height="${CODE.cell + 3}" fill="none" stroke="#000" stroke-width="0.2"/>`;
  bits.forEach((b, i) => {
    if (b === 1) s += `<rect x="${f(x0 + i * CODE.pitch)}" y="${f(y)}" width="${CODE.cell}" height="${CODE.cell}" fill="#000"/>`;
  });
  return s;
}

function scaleBar() {
  const x0 = CX - 50;
  const y = 22;
  let s = `<line x1="${f(x0)}" y1="${y}" x2="${f(x0 + 100)}" y2="${y}" stroke="#000" stroke-width="0.3"/>`;
  for (let i = 0; i <= 10; i += 1) {
    const h = i % 5 === 0 ? 3 : 1.5;
    s += `<line x1="${f(x0 + i * 10)}" y1="${y - h}" x2="${f(x0 + i * 10)}" y2="${y}" stroke="#000" stroke-width="0.3"/>`;
  }
  return s;
}

function text(x, y, size, body, anchor = 'middle') {
  return `<text x="${f(x)}" y="${f(y)}" font-size="${size}" text-anchor="${anchor}" font-family="Helvetica, Arial, sans-serif" fill="#000">${body}</text>`;
}

function page(kind) {
  const target = kind.template === 'precision' ? precisionTarget() : sightingTarget();
  const body = [
    text(CX, 10, 3.6, `NordicAim test sheet · ${kind.label} · code ${kind.code} · v${CODE.version} · training only`),
    text(CX, 15.5, 2.8, 'Print at 100% / Actual size. The bar below must measure exactly 100 mm.'),
    scaleBar(),
    marks(),
    target,
    codeStrip(kind.code),
    text(CX, PAGE.h - 8, 2.6, 'github.com/KomplexMojo/NordicAim · issue #65 · shoot on the coloured backing, photograph all four corner squares'),
  ].join('');
  return `<section><svg xmlns="http://www.w3.org/2000/svg" width="${PAGE.w}mm" height="${PAGE.h}mm" viewBox="0 0 ${PAGE.w} ${PAGE.h}">${body}</svg></section>`;
}

/** The four pages as one printable HTML document. */
export function sheetsHtml() {
  return `<!doctype html><html><head><style>
      @page { size: ${PAGE.w}mm ${PAGE.h}mm; margin: 0; }
      html, body { margin: 0; padding: 0; }
      section { width: ${PAGE.w}mm; height: ${PAGE.h}mm; page-break-after: always; overflow: hidden; }
      section:last-child { page-break-after: auto; }
      svg { display: block; }
    </style></head><body>${KINDS.map(page).join('')}</body></html>`;
}

async function main() {
  mkdirSync(dirname(OUT), { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
  try {
    const p = await browser.newPage();
    await p.setContent(sheetsHtml());
    await p.pdf({ path: OUT, preferCSSPageSize: true, printBackground: true });
    console.log(`wrote ${OUT}`);
  } finally {
    await browser.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
