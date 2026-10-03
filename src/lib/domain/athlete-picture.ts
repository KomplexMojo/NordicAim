// REV-157 (issue #99): the athlete's picture — one small square JPEG kept as a data URL, so it travels unchanged in Settings,
// in a backup and inside a signed Board submission. Pure: the picture is checked here; it is made in
// `media/athlete-picture-browser.ts`.

import { z } from 'zod';

/** The picture's side in pixels. */
export const ATHLETE_PICTURE_SIZE = 96;
/** The most bytes the JPEG itself may take; a full board of 100 shooters then carries at most about 800 KB of pictures. */
export const MAX_ATHLETE_PICTURE_BYTES = 8 * 1024;

const PREFIX = 'data:image/jpeg;base64,';
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function decodeBase64(text: string): Uint8Array | null {
  if (!BASE64.test(text) || text.length % 4 !== 0) return null;
  try {
    return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/**
 * Why a JPEG is not acceptable, or null when it is: it must start like a JPEG and carry no APP1 (EXIF or XMP, where a
 * location would live) or APP13 (IPTC) segment. A picture re-encoded on a canvas has neither.
 */
export function jpegProblem(bytes: Uint8Array): string | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 'not a JPEG';
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return 'not a JPEG';
    const marker = bytes[i + 1]!;
    if (marker === 0xda || marker === 0xd9) return null; // the image data (or the end) follows: no more metadata segments
    if (marker === 0xe1 || marker === 0xed) return 'it carries photo metadata';
    const length = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    if (length < 2) return 'not a JPEG';
    i += 2 + length;
  }
  return 'not a JPEG';
}

/**
 * The JPEG with every metadata segment left out: APP1 (EXIF, XMP), APP3–APP15 (IPTC and the rest) and comments. JFIF (APP0)
 * and the colour profile (APP2) stay, and the image data is copied unchanged. Safari's own JPEG encoder writes a small EXIF
 * block into what a canvas makes, so the picture goes through this before it is checked. A file whose segments can't be
 * walked comes back unchanged (and then fails the check).
 */
export function withoutJpegMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return bytes;
    const marker = bytes[i + 1]!;
    if (marker === 0xda) {
      kept.push(bytes.subarray(i)); // the image data, to the end
      const out = new Uint8Array(kept.reduce((n, k) => n + k.length, 0));
      let at = 0;
      for (const k of kept) {
        out.set(k, at);
        at += k.length;
      }
      return out;
    }
    const end = i + 2 + ((bytes[i + 2]! << 8) | bytes[i + 3]!);
    if (end > bytes.length || end < i + 4) return bytes;
    const metadata = (marker >= 0xe1 && marker <= 0xef && marker !== 0xe2) || marker === 0xfe;
    if (!metadata) kept.push(bytes.subarray(i, end));
    i = end;
  }
  return bytes;
}

/** Why a stored or received picture is not acceptable, or null when it is. */
export function athletePictureProblem(dataUrl: string): string | null {
  if (!dataUrl.startsWith(PREFIX)) return 'not a JPEG';
  const bytes = decodeBase64(dataUrl.slice(PREFIX.length));
  if (bytes === null) return 'not a JPEG';
  if (bytes.byteLength > MAX_ATHLETE_PICTURE_BYTES) return 'too large';
  return jpegProblem(bytes);
}

export const AthletePicture = z.string().refine((s) => athletePictureProblem(s) === null, 'Not an acceptable athlete picture');

export function athletePictureDataUrl(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return PREFIX + btoa(binary);
}

/** A shooter's initials for a missing picture: the first letters of the first and last words ("Ingrid Solberg" → "IS"). */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => w !== '');
  const first = words[0];
  if (first === undefined) return '?';
  const last = words.length > 1 ? words[words.length - 1]! : '';
  return (Array.from(first)[0]! + (last === '' ? '' : Array.from(last)[0]!)).toLocaleUpperCase();
}
