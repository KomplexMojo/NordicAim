// rendering-composite.md §2. Browser adapter: rasterises a renderer's SVG string to a PNG Blob via
// <canvas>. Blob(svg) → object URL → Image → decode() → canvas → drawImage → toBlob('image/png');
// revoke the object URL. If reading the canvas back throws SecurityError (a tainted canvas — Safari
// has been seen to taint an object-URL SVG source), retry once with a data: URL source instead.

export interface RenderTools {
  svgToPng: typeof svgToPng;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

function drawToCanvas(img: HTMLImageElement, widthPx: number, heightPx: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.drawImage(img, 0, 0, widthPx, heightPx);
  ctx.getImageData(0, 0, 1, 1); // throws SecurityError on a tainted canvas
  return canvas;
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob failed'))), 'image/png');
  });
}

export async function svgToPng(svg: string, widthPx: number, heightPx: number): Promise<Blob> {
  const blobUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = await loadImage(blobUrl);
    return await canvasToPngBlob(drawToCanvas(img, widthPx, heightPx));
  } catch (err) {
    if (!(err instanceof DOMException && err.name === 'SecurityError')) throw err;
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const img = await loadImage(dataUrl);
    return await canvasToPngBlob(drawToCanvas(img, widthPx, heightPx));
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

export const browserRenderTools: RenderTools = { svgToPng };
