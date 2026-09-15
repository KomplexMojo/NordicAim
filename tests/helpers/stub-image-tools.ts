import type { ImageFormat } from '@/lib/media/format';
import type { ImageTools } from '@/lib/services/ingest';

/** A deterministic ImageTools for services/ingest tests — no canvas/Image APIs. */
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
    ...overrides,
  };
}
