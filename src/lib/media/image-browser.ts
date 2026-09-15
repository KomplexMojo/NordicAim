/** metadata-lighting §0.2. Browser adapter implementing ImageTools (data-model §7). */

import { fitLongest, type ImageFormat, type RgbaImage } from './format';

const MAX_CANVAS_PIXELS = 16_000_000;

export class UnsupportedOnThisBrowserError extends Error {
  constructor(format: string) {
    super('HEIC photos can only be opened in Safari on iPhone or Mac');
    this.name = 'UnsupportedOnThisBrowserError';
    this.format = format;
  }
  format: string;
}

export async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasFrom(img: HTMLImageElement, w: number, h: number): HTMLCanvasElement {
  if (w * h > MAX_CANVAS_PIXELS) throw new Error(`Canvas too large: ${w}x${h}`);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob failed'))),
      type,
      quality,
    );
  });
}

async function decodeForFormat(blob: Blob, format: ImageFormat): Promise<HTMLImageElement> {
  if (format === 'heic') {
    try {
      return await loadImage(blob);
    } catch {
      throw new UnsupportedOnThisBrowserError('heic');
    }
  }
  return loadImage(blob);
}

export async function makeWorkingImages(
  blob: Blob,
  format: ImageFormat,
): Promise<{
  working: Blob;
  thumb: Blob;
  originalSize: { widthPx: number; heightPx: number };
  workingSize: { widthPx: number; heightPx: number; scaleFromOriginal: number };
}> {
  const img = await decodeForFormat(blob, format);
  const originalSize = { widthPx: img.naturalWidth, heightPx: img.naturalHeight };

  const workingFit = fitLongest(originalSize.widthPx, originalSize.heightPx, 3000);
  const workingCanvas = canvasFrom(img, workingFit.w, workingFit.h);
  const working = await toBlob(workingCanvas, 'image/jpeg', 0.9);

  const thumbFit = fitLongest(originalSize.widthPx, originalSize.heightPx, 480);
  const thumbCanvas = canvasFrom(img, thumbFit.w, thumbFit.h);
  const thumb = await toBlob(thumbCanvas, 'image/jpeg', 0.8);

  return {
    working,
    thumb,
    originalSize,
    workingSize: { widthPx: workingFit.w, heightPx: workingFit.h, scaleFromOriginal: workingFit.scale },
  };
}

export async function toRgba(blob: Blob, maxLongest: number): Promise<RgbaImage> {
  const img = await loadImage(blob);
  const fit = fitLongest(img.naturalWidth, img.naturalHeight, maxLongest);
  const canvas = canvasFrom(img, fit.w, fit.h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  const imageData = ctx.getImageData(0, 0, fit.w, fit.h);
  return { data: imageData.data, width: fit.w, height: fit.h };
}

export const browserImageTools = { makeWorkingImages, toRgba };
