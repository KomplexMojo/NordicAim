#!/usr/bin/env tsx
// M05 step 5. Node-only sample generator: runs `analyzeTarget` on each `fixtures/reference/sample-shots-*.json`
// golden fixture, renders both diagram variants, rasterises them with @resvg/resvg-js, and writes the
// PNGs to `docs/reference/generated/` for a human to compare against the owner's example diagrams.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Resvg } from '@resvg/resvg-js';

import { BIATHLON_50M } from '../src/lib/defaults/biathlon.ts';
import type { Shot } from '../src/lib/domain/analysis.ts';
import type { Categorization } from '../src/lib/domain/photo.ts';
import type { Position } from '../src/lib/domain/enums.ts';
import { analyzeTarget } from '../src/lib/scoring/analyze.ts';
import { renderDiagramSvg } from '../src/lib/render/diagram.ts';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

interface ShotsFixture {
  template: 'sighting' | 'precision';
  categorization: Categorization;
  shots: Shot[];
}

interface ExifSidecar {
  exif: { captureLocal: string | null };
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(`${REPO_ROOT}${relativePath}`, 'utf-8')) as T;
}

const POSITION_LABELS: Record<Position, string> = {
  prone: 'Prone',
  standing: 'Standing',
  both: 'Prone + standing',
};

const SAMPLES: Array<{ template: 'sighting' | 'precision'; fixture: string; sidecar: string }> = [
  { template: 'sighting', fixture: 'fixtures/reference/sample-shots-sighting.json', sidecar: 'fixtures/reference/IMG_5057.exif.json' },
  { template: 'precision', fixture: 'fixtures/reference/sample-shots-precision.json', sidecar: 'fixtures/reference/IMG_5132.exif.json' },
];

const OUT_DIR = `${REPO_ROOT}docs/reference/generated`;
mkdirSync(OUT_DIR, { recursive: true });

for (const sample of SAMPLES) {
  const fixture = readJson<ShotsFixture>(sample.fixture);
  const sidecar = readJson<ExifSidecar>(sample.sidecar);

  const result = analyzeTarget({ template: fixture.template, categorization: fixture.categorization, shots: fixture.shots });
  const position = fixture.categorization.position as Position;

  const input = {
    template: fixture.template,
    result,
    shots: fixture.shots,
    positionLabel: POSITION_LABELS[position],
    captureLocal: sidecar.exif.captureLocal,
    lighting: 'daylight' as const,
    holeDiameterMm: BIATHLON_50M.holeDiameterMm,
  };

  for (const variant of ['full', 'cell'] as const) {
    const svg = renderDiagramSvg(input, variant);
    const png = new Resvg(svg, { font: { loadSystemFonts: true }, fitTo: { mode: 'original' } }).render().asPng();
    const outPath = `${OUT_DIR}/sample-${sample.template}-${variant}.png`;
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, png);
    console.log(`wrote ${outPath}`);
  }
}
