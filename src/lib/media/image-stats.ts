/** metadata-lighting §3. Pure; no DOM. */

import type { ImageStats } from '@/lib/domain/photo';
import type { RgbaImage } from './format';

export function computeImageStats(img: RgbaImage): ImageStats {
  const { data, width, height } = img;
  const n = width * height;
  const lumas = new Array<number>(n);
  let lumaSum = 0;

  for (let i = 0; i < n; i += 1) {
    const o = i * 4;
    const r = data[o] ?? 0;
    const g = data[o + 1] ?? 0;
    const b = data[o + 2] ?? 0;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumas[i] = luma;
    lumaSum += luma;
  }

  const meanLuma = n === 0 ? 0 : lumaSum / n;

  const order = Array.from({ length: n }, (_, i) => i);
  order.sort((a, b) => {
    const la = lumas[a] as number;
    const lb = lumas[b] as number;
    if (lb !== la) return lb - la;
    return a - b;
  });

  const brightCount = Math.ceil(0.2 * n);
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  for (let k = 0; k < brightCount; k += 1) {
    const idx = order[k] as number;
    const o = idx * 4;
    sumR += data[o] ?? 0;
    sumG += data[o + 1] ?? 0;
    sumB += data[o + 2] ?? 0;
  }

  const brightMeanR = brightCount === 0 ? 0 : sumR / brightCount;
  const brightMeanG = brightCount === 0 ? 0 : sumG / brightCount;
  const brightMeanB = brightCount === 0 ? 0 : sumB / brightCount;

  return { meanLuma, brightMeanR, brightMeanG, brightMeanB };
}
