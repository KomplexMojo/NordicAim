/** metadata-lighting §0.1. Pure; no DOM. */

export type ImageFormat = 'jpeg' | 'png' | 'heic';

export interface RgbaImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1']);

function matches(bytes: Uint8Array, magic: number[], offset = 0): boolean {
  if (bytes.length < offset + magic.length) return false;
  for (let i = 0; i < magic.length; i += 1) {
    if (bytes[offset + i] !== magic[i]) return false;
  }
  return true;
}

export function detectFormat(bytes: Uint8Array): ImageFormat | null {
  if (matches(bytes, JPEG_MAGIC)) return 'jpeg';
  if (matches(bytes, PNG_MAGIC)) return 'png';
  if (bytes.length >= 12) {
    const ftyp = String.fromCharCode(bytes[4] ?? 0, bytes[5] ?? 0, bytes[6] ?? 0, bytes[7] ?? 0);
    const brand = String.fromCharCode(bytes[8] ?? 0, bytes[9] ?? 0, bytes[10] ?? 0, bytes[11] ?? 0);
    if (ftyp === 'ftyp' && HEIC_BRANDS.has(brand)) return 'heic';
  }
  return null;
}

export function fitLongest(w: number, h: number, maxLongest: number): { w: number; h: number; scale: number } {
  const scale = Math.min(1, maxLongest / Math.max(w, h));
  return { w: Math.round(w * scale), h: Math.round(h * scale), scale };
}
