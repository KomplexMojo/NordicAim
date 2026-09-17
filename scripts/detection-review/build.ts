#!/usr/bin/env tsx
// M16 R5 (REV-37): `pnpm review:detection`. Runs the shipping detection path (A4 anchor, template
// hint, A5 shots) on every photo in `fixtures/private/additional references/` and writes ONE
// self-contained page, `fixtures/private/review/detection-review.html`, for the owner to rate.
//
// Privacy: the photos are embedded as resized JPEGs re-encoded by sharp, which writes no metadata (no
// GPS). Nothing — no image and no photo-derived file — is ever written outside `fixtures/private/`.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { loadOpenCvForTests } from '../../tests/helpers/opencv.ts';
import { LABELLED_HOLES_RELATIVE_PATH } from '../../tests/helpers/labelled-holes.ts';
import { jpegFileToRgba } from '../../tests/helpers/rgba.ts';
import { reviewPhoto, WORKING_LONGEST } from './photo.ts';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PRIVATE_ROOT = resolve(REPO_ROOT, 'fixtures/private');
const SOURCE_DIR = resolve(PRIVATE_ROOT, 'additional references');
const OUT_FILE = resolve(PRIVATE_ROOT, 'review/detection-review.html');
const TEMPLATE = resolve(dirname(fileURLToPath(import.meta.url)), 'template.html');
const JPEG_QUALITY = 72;

/** The page only ever lands inside `fixtures/private/` — asserted, not assumed. */
function assertPrivate(path: string): void {
  if (!resolve(path).startsWith(`${PRIVATE_ROOT}/`)) throw new Error(`refusing to write outside fixtures/private/: ${path}`);
}

if (!existsSync(SOURCE_DIR)) {
  console.log(
    `NO PHOTOS: ${SOURCE_DIR} is absent (it is gitignored). Nothing to review, and nothing was written.`,
  );
  process.exit(0);
}

const cv = await loadOpenCvForTests();
const names = readdirSync(SOURCE_DIR).filter((f) => /\.jpe?g$/i.test(f)).sort();
const photos: unknown[] = [];

for (const name of names) {
  const path = resolve(SOURCE_DIR, name);
  const img = await jpegFileToRgba(path, WORKING_LONGEST);
  const record = reviewPhoto(cv, img, name);
  // Same orientation and size as the working image, so overlay px line up exactly.
  const jpeg = await sharp(readFileSync(path))
    .rotate()
    .resize({ width: WORKING_LONGEST, height: WORKING_LONGEST, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
  photos.push({ ...record, img: `data:image/jpeg;base64,${jpeg.toString('base64')}` });
  console.log(
    `${name}: ${record.anchor === null ? 'no anchor' : `${record.template} · ${record.candidates.length} detected · sheet ${record.sheet?.method}`}`,
  );
}

// The 2026-09-17 labels, if present, let the page carry the owner's earlier marks over (R5).
const labelsPath = resolve(REPO_ROOT, LABELLED_HOLES_RELATIVE_PATH);
const previous = existsSync(labelsPath) ? (JSON.parse(readFileSync(labelsPath, 'utf-8')) as unknown) : null;

const payload = JSON.stringify({ generatedAt: new Date().toISOString(), photos, previous });
const html = readFileSync(TEMPLATE, 'utf-8').replace('/*__DATA__*/null', payload.replace(/</g, '\\u003c'));
assertPrivate(OUT_FILE);
mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, html);
console.log(`\nwrote ${OUT_FILE} (${(html.length / 1e6).toFixed(1)} MB, ${photos.length} photos)`);
