#!/usr/bin/env tsx
// M15 step 2. Node-only icon generator: draws the Nordic Aim target mark and rasterises it with `sharp` to the PWA manifest's icon set under `public/icons/`.
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

/**
 * The Nordic Aim mark: a biathlon target seen from the firing line. Bold on purpose, so it still reads at 16 px: a dark tile,
 * a white paper disc, a black aiming disc with an accent ring and a single white scoring ring inside it, and a tight group of three holes just off centre.
 * `inset` shrinks the motif (the maskable icon's safe zone, where Android may crop to a centred circle). Drawn on a 100-unit grid.
 */
export function targetSvg(size: number, inset: number, rounded = false): string {
  const k = (size - 2 * inset) / 100;
  const at = (v: number) => (inset + v * k).toFixed(2);
  const len = (v: number) => (v * k).toFixed(2);
  const HOLE = '#E8604C';
  const holes = [
    [57, 39, 7],
    [65, 51, 7],
    [51, 52, 7],
  ]
    .map(([x, y, r]) => `<circle cx="${at(x!)}" cy="${at(y!)}" r="${len(r!)}" fill="${HOLE}" stroke="#FFFFFF" stroke-width="${len(2.2)}" />`)
    .join('\n    ');
  const radius = rounded ? size * 0.22 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${radius}" fill="${DISC}" />
    <circle cx="${at(50)}" cy="${at(50)}" r="${len(48)}" fill="${PAGE}" />
    <circle cx="${at(50)}" cy="${at(50)}" r="${len(33)}" fill="#0B1220" />
    <circle cx="${at(50)}" cy="${at(50)}" r="${len(33)}" fill="none" stroke="${ACCENT}" stroke-width="${len(4.5)}" />
    <circle cx="${at(50)}" cy="${at(50)}" r="${len(17)}" fill="none" stroke="${PAGE}" stroke-width="${len(2.6)}" />
    ${holes}
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
