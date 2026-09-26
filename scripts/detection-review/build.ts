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

import { backingColourFromCard } from '../../src/lib/cv/backing-colour.ts';
import type { ColourSignature } from '../../src/lib/domain/backing.ts';
import { loadOpenCvForTests } from '../../tests/helpers/opencv.ts';
import { LABELLED_HOLES_RELATIVE_PATH } from '../../tests/helpers/labelled-holes.ts';
import { jpegFileToRgba } from '../../tests/helpers/rgba.ts';
import { reviewPhoto, WORKING_LONGEST, type ReviewBacking } from './photo.ts';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PRIVATE_ROOT = resolve(REPO_ROOT, 'fixtures/private');
const SOURCE_DIR = resolve(PRIVATE_ROOT, 'additional references');
/** M19 step 9 (REV-38): the owner's backed targets are reviewed alongside the rest. */
const BACKING_DIR = resolve(PRIVATE_ROOT, 'backing');
/** `{ "<target file>": "<card file>" }` beside the backing photos (backing-sheet.md §2). */
const CARDS_MANIFEST = resolve(BACKING_DIR, 'cards.json');
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

/** Every photo to review: the reference set, then the backed targets with their card's colour. */
const cards: Record<string, string> = existsSync(CARDS_MANIFEST)
  ? (JSON.parse(readFileSync(CARDS_MANIFEST, 'utf-8')) as Record<string, string>)
  : {};
const cardColours = new Map<string, ColourSignature | null>();
for (const file of new Set(Object.values(cards))) {
  cardColours.set(file, backingColourFromCard(await jpegFileToRgba(resolve(BACKING_DIR, file), 512)));
}

interface Source {
  dir: string;
  name: string;
  backing: ReviewBacking;
}

const sources: Source[] = readdirSync(SOURCE_DIR)
  .filter((f) => /\.jpe?g$/i.test(f))
  .sort()
  .map((name) => ({ dir: SOURCE_DIR, name, backing: { mode: 'auto' as const, colour: null } }));
if (existsSync(BACKING_DIR)) {
  const cardFiles = new Set(Object.values(cards));
  for (const name of readdirSync(BACKING_DIR).filter((f) => /\.jpe?g$/i.test(f)).sort()) {
    if (cardFiles.has(name)) continue; // a card is not a target
    const cardFile = cards[name];
    sources.push({
      dir: BACKING_DIR,
      name,
      // backing-sheet.md §2: these photos were shot with a backing, so the colour path is forced.
      backing: { mode: 'coloured', colour: cardFile === undefined ? null : (cardColours.get(cardFile) ?? null) },
    });
  }

  // A dated batch exported from the app's own backup (issue #15's paired protocol) carries its own
  // `pairs-manifest.json`: plain/lime pairs, reviewed exactly as the app analyzed them (Settings'
  // `backingMode` and measured colour at capture time), not forced — so the page shows whether `Auto`
  // actually caught the backing, which is the point of reviewing them.
  for (const entry of readdirSync(BACKING_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = resolve(BACKING_DIR, entry.name);
    const manifestPath = resolve(dir, 'pairs-manifest.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
      backingModeAtCaptureTime: 'auto' | 'none' | 'coloured';
      backingSignatureAtCaptureTime: ColourSignature | null;
      pairs: Array<{ plainFile: string; limeFile: string }>;
    };
    const backing: ReviewBacking = { mode: manifest.backingModeAtCaptureTime, colour: manifest.backingSignatureAtCaptureTime };
    for (const pair of manifest.pairs) {
      sources.push({ dir, name: pair.plainFile, backing });
      sources.push({ dir, name: pair.limeFile, backing });
    }
  }
}

const photos: unknown[] = [];

for (const source of sources) {
  const { name } = source;
  const path = resolve(source.dir, name);
  const img = await jpegFileToRgba(path, WORKING_LONGEST);
  const record = reviewPhoto(cv, img, name, source.backing);
  // Same orientation and size as the working image, so overlay px line up exactly.
  const jpeg = await sharp(readFileSync(path))
    .rotate()
    .resize({ width: WORKING_LONGEST, height: WORKING_LONGEST, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
  photos.push({ ...record, img: `data:image/jpeg;base64,${jpeg.toString('base64')}` });
  console.log(
    `${name}: ${record.anchor === null ? 'no anchor' : `${record.template} · ${record.candidates.length} detected · ${record.detection?.method ?? 'standard'} · sheet ${record.sheet?.method}`}`,
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
