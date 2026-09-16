import type { RenderTools } from '@/lib/render/rasterize-browser';

/** A deterministic RenderTools for Stage B / runner tests — no canvas or Image APIs. `svgToPng` records
 * every call so tests can assert the rasterised size, and can be made to throw. */
export function stubRenderTools(opts: { throwOnRender?: Error } = {}): RenderTools & {
  calls: Array<{ svg: string; widthPx: number; heightPx: number }>;
} {
  const calls: Array<{ svg: string; widthPx: number; heightPx: number }> = [];
  return {
    calls,
    async svgToPng(svg: string, widthPx: number, heightPx: number) {
      calls.push({ svg, widthPx, heightPx });
      if (opts.throwOnRender) throw opts.throwOnRender;
      return new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });
    },
  };
}
