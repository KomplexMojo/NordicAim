import type { ImageFormat, RgbaImage } from '@/lib/media/format';
import type { ImageTools } from '@/lib/services/ingest';

/** A flat neutral-gray 2x2 RgbaImage — meanLuma/brightMean are not warm (R/B ratio 1). */
function defaultRgba(): RgbaImage {
  const data = new Uint8ClampedArray(2 * 2 * 4);
  for (let i = 0; i < 4; i += 1) {
    const o = i * 4;
    data[o] = 128;
    data[o + 1] = 128;
    data[o + 2] = 128;
    data[o + 3] = 255;
  }
  return { data, width: 2, height: 2 };
}

/** A deterministic ImageTools for services/ingest tests — no canvas/Image APIs. `toRgba` is configurable so
 * tests can control `warm`/`meanLuma` inputs to the lighting suggestion. */
export function stubImageTools(overrides: Partial<ImageTools> = {}): ImageTools {
  return {
    async makeWorkingImages(blob: Blob, format: ImageFormat) {
      void blob;
      void format;
      return {
        working: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }),
        thumb: new Blob([new Uint8Array([4, 5])], { type: 'image/jpeg' }),
        originalSize: { widthPx: 1200, heightPx: 1600 },
        workingSize: { widthPx: 1200, heightPx: 1600, scaleFromOriginal: 1 },
      };
    },
    async toRgba(blob: Blob, maxLongest: number) {
      void blob;
      void maxLongest;
      return defaultRgba();
    },
    ...overrides,
  };
}
