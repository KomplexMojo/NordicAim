#!/usr/bin/env tsx
// M15 step 2. Node-only icon generator: draws the NordicAim target mark and rasterises it with `sharp` to the PWA manifest's icon set under `public/icons/`.
// Run with `pnpm make:icons`. Not part of the build; icons are committed like any other static asset.

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { BRAND_TILE, brandMotif } from '../src/lib/render/brand-mark.ts';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = `${REPO_ROOT}public/icons`;

/** The NordicAim mark on a dark tile (the shared motif is `src/lib/render/brand-mark.ts`); `inset` is the maskable safe zone. */
export function targetSvg(size: number, inset: number, rounded = false): string {
  const radius = rounded ? size * 0.22 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${radius}" fill="${BRAND_TILE}" />
    ${brandMotif(inset, inset, size - 2 * inset)}
  </svg>`;
}

interface IconSpec {
  file: string;
  size: number;
  inset: number;
}

const ICONS: IconSpec[] = [
  { file: 'icon-192.png', size: 192, inset: 0 },
  { file: 'icon-512.png', size: 512, inset: 0 },
  // maskable: keep the motif inside Android's centred-circle safe zone (~80% of the canvas).
  { file: 'icon-maskable-512.png', size: 512, inset: 60 },
];

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  // apple-touch-icon: no transparency, no maskable inset — iOS draws its own rounded-square mask.
  const appleTouch: IconSpec = { file: 'apple-touch-icon.png', size: 180, inset: 0 };

  // The browser-tab favicon: the same mark as a small scalable file.
  writeFileSync(`${REPO_ROOT}public/favicon.svg`, targetSvg(64, 0, true));
  console.log('wrote public/favicon.svg');

  for (const spec of [...ICONS, appleTouch]) {
    const svg = targetSvg(spec.size, spec.inset);
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    writeFileSync(`${OUT_DIR}/${spec.file}`, png);
    console.log(`wrote public/icons/${spec.file} (${spec.size}×${spec.size})`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
