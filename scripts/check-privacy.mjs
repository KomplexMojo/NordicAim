#!/usr/bin/env node
// Fails the build if fixtures/private/ is tracked, or if any tracked/staged image carries GPS EXIF.
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import exifReader from 'exif-reader';
import sharp from 'sharp';

const IMAGE_EXT = /\.(jpe?g|png|heic|heif|tiff?)$/i;

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

function fail(message) {
  console.error(`privacy check failed: ${message}`);
  process.exitCode = 1;
}

const privateFiles = git(['ls-files', 'fixtures/private']).trim();
if (privateFiles) {
  fail(`fixtures/private/ is tracked by git:\n${privateFiles}`);
  process.exit(1);
}

const tracked = git(['ls-files']).split('\n').filter(Boolean);
const staged = git(['diff', '--cached', '--name-only', '--diff-filter=ACM'])
  .split('\n')
  .filter(Boolean);

const candidates = [...new Set([...tracked, ...staged])].filter(
  (f) => IMAGE_EXT.test(f) && !f.startsWith('node_modules/'),
);

let checked = 0;

for (const file of candidates) {
  let buf;
  try {
    buf = await readFile(file);
  } catch {
    // file deleted/staged-removed; nothing to check
    continue;
  }

  let metadata;
  try {
    metadata = await sharp(buf).metadata();
  } catch (err) {
    fail(`could not read image metadata for ${file}: ${err.message}`);
    continue;
  }

  checked += 1;

  if (!metadata.exif) continue;

  let exif;
  try {
    exif = exifReader(metadata.exif);
  } catch {
    // unparsable EXIF blob; nothing more we can check
    continue;
  }

  const gps = exif.GPSInfo ?? exif.gps;
  if (gps?.GPSLatitude) {
    fail(`${file} carries GPS EXIF (GPSLatitude present)`);
  }
}

if (process.exitCode !== 1) {
  console.log(`privacy check passed (${checked} images)`);
}
