#!/usr/bin/env tsx
// M15 step 2. Node-only icon generator: draws a concentric-ring target motif (the palette's `accent`
// on `page`) and rasterises it with `sharp` to the PWA manifest's icon set under `public/icons/`.
// Run with `pnpm make:icons`. Not part of the build; icons are committed like any other static asset.

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = `${REPO_ROOT}public/icons`;

// rendering-composite.md §1.
const PAGE = '#F7FAFD';
const ACCENT = '#4B94C3';
const DISC = '#1F2630';

/** A concentric-ring target on a `page`-coloured square, `size`×`size`, centred at `size/2`. `inset`
 * shrinks the motif (used for the maskable icon's safe zone: Android may crop to a centred circle). */
function ringSvg(size: number, inset: number): string {
  const c = size / 2;
  const maxR = c - inset;
  const rings = [1, 0.72, 0.46, 0.22].map((f) => maxR * f);
  const circles = rings
    .map((r, i) => {
      const fill = i === rings.length - 1 ? DISC : 'none';
      return `<circle cx="${c}" cy="${c}" r="${r}" fill="${fill}" stroke="${ACCENT}" stroke-width="${maxR * 0.06}" />`;
    })
    .join('\n    ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="${PAGE}" />
    ${circles}
  </svg>`;
}

interface IconSpec {
  file: string;
  size: number;
  inset: number;
}

const ICONS: IconSpec[] = [
  { file: 'icon-192.png', size: 192, inset: 8 },
  { file: 'icon-512.png', size: 512, inset: 20 },
  // maskable: keep the motif inside Android's centred-circle safe zone (~80% of the canvas).
  { file: 'icon-maskable-512.png', size: 512, inset: 51 },
];

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  // apple-touch-icon: no transparency, no maskable inset — iOS draws its own rounded-square mask.
  const appleTouch: IconSpec = { file: 'apple-touch-icon.png', size: 180, inset: 8 };

  for (const spec of [...ICONS, appleTouch]) {
    const svg = ringSvg(spec.size, spec.inset);
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    writeFileSync(`${OUT_DIR}/${spec.file}`, png);
    console.log(`wrote public/icons/${spec.file} (${spec.size}×${spec.size})`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
