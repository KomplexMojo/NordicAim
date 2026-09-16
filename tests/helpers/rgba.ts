// Node-only image helpers for the CV unit tests and `scripts/cv-eval.ts` (M10). `sharp` and
// `@resvg/resvg-js` are dev-only (PLAN F3/F4); nothing here ships to the phone.

import { readFile } from 'node:fs/promises';

import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';

import type { RgbaImage } from '@/lib/media/format';

async function rawToRgba(input: ReturnType<typeof sharp>): Promise<RgbaImage> {
  const { data, info } = await input.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), width: info.width, height: info.height };
}

/** Decodes a JPEG file (applying any EXIF orientation) into an `RgbaImage`. */
export async function jpegFileToRgba(path: string, maxLongest?: number): Promise<RgbaImage> {
  const bytes = await readFile(path);
  let pipeline = sharp(bytes).rotate();
  if (maxLongest !== undefined) {
    pipeline = pipeline.resize({ width: maxLongest, height: maxLongest, fit: 'inside', withoutEnlargement: true });
  }
  return rawToRgba(pipeline);
}

/** Rasterises an SVG string at its intrinsic size (resvg, as in `scripts/render-samples.ts`). */
export async function svgToRgba(svg: string): Promise<RgbaImage> {
  const png = new Resvg(svg, { font: { loadSystemFonts: false }, fitTo: { mode: 'original' } }).render().asPng();
  return rawToRgba(sharp(png));
}

/** Gaussian blur with the given sigma — used to make a "blurry photo" from a sharp one. */
export async function blurRgba(img: RgbaImage, sigma: number): Promise<RgbaImage> {
  const pipeline = sharp(Buffer.from(img.data), { raw: { width: img.width, height: img.height, channels: 4 } }).blur(
    sigma,
  );
  return rawToRgba(pipeline);
}

/** Re-encodes an `RgbaImage` as JPEG bytes (the worker's input shape). */
export async function rgbaToJpeg(img: RgbaImage, quality = 90): Promise<Uint8Array> {
  const buf = await sharp(Buffer.from(img.data), { raw: { width: img.width, height: img.height, channels: 4 } })
    .jpeg({ quality })
    .toBuffer();
  return new Uint8Array(buf);
}
