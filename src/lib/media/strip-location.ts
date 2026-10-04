// REV-158: removes where a photo was taken from its file, without touching the image. The GPS directory inside the EXIF
// data is emptied in place (its entries and their values zeroed, its count set to 0), XMP location fields are blanked
// with spaces, and an IPTC block is zeroed. Nothing moves, so no offset in the file changes: the same code works inside
// a JPEG, a HEIC (the iPhone's own format) and a PNG. The capture time, orientation and camera details stay. Pure.

import type { ImageFormat } from './format';

export class LocationNotRemovedError extends Error {
  constructor(reason: string) {
    super(`This photo wasn't added: its location could not be removed (${reason}). Try taking it with the app's shutter instead.`);
    this.name = 'LocationNotRemovedError';
  }
}

/** Bytes per value of each TIFF field type (1–13); 0 for an unknown type. */
const TIFF_TYPE_SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8, 4];
const GPS_IFD_POINTER = 0x8825;

function fail(reason: string): never {
  throw new LocationNotRemovedError(reason);
}

/** Empties the GPS directory of the TIFF block at `tiff` (EXIF data), staying inside `end`. True when there was one. */
function wipeTiffGps(b: Uint8Array, tiff: number, end: number): boolean {
  if (tiff + 8 > end) fail('short EXIF block');
  const little = b[tiff] === 0x49 && b[tiff + 1] === 0x49;
  if (!little && !(b[tiff] === 0x4d && b[tiff + 1] === 0x4d)) fail('unknown EXIF byte order');
  const u16 = (at: number) => {
    if (at + 2 > end) fail('EXIF entry out of range');
    return little ? b[at]! | (b[at + 1]! << 8) : (b[at]! << 8) | b[at + 1]!;
  };
  const u32 = (at: number) => {
    if (at + 4 > end) fail('EXIF entry out of range');
    return little
      ? (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0
      : ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;
  };
  const ifd0 = tiff + u32(tiff + 4);
  const count0 = u16(ifd0);
  for (let i = 0; i < count0; i += 1) {
    const entry = ifd0 + 2 + i * 12;
    if (u16(entry) !== GPS_IFD_POINTER) continue;
    const gps = tiff + u32(entry + 8);
    const n = u16(gps);
    for (let j = 0; j < n; j += 1) {
      const e = gps + 2 + j * 12;
      const size = (TIFF_TYPE_SIZE[u16(e + 2)] ?? 0) * u32(e + 4);
      if (size > 4) {
        const at = tiff + u32(e + 8);
        if (at + size > end) fail('GPS value out of range');
        b.fill(0, at, at + size);
      }
    }
    const listEnd = gps + 2 + n * 12 + 4;
    if (listEnd > end) fail('GPS directory out of range');
    // No entries and no next directory: an empty GPS directory every reader accepts.
    b.fill(0, gps, listEnd);
    return true;
  }
  return false;
}

const XMP_START = '<x:xmpmeta';
const XMP_END = '</x:xmpmeta>';
const XMP_LOCATION = '(?:exif:GPS\\w*|photoshop:(?:City|State|Country)|Iptc4xmpCore:(?:Location|CountryCode))';

function latin1(b: Uint8Array, from: number, to: number): string {
  let s = '';
  for (let i = from; i < to; i += 8192) s += String.fromCharCode(...b.subarray(i, Math.min(to, i + 8192)));
  return s;
}

/** Overwrites XMP location fields with spaces, in every XMP packet between `from` and `to`. True when any were found. */
function blankXmpLocation(b: Uint8Array, from = 0, to = b.length): boolean {
  const text = latin1(b, from, to);
  let found = false;
  const blank = (start: number, length: number) => {
    b.fill(0x20, from + start, from + start + length);
    found = true;
  };
  let at = text.indexOf(XMP_START);
  while (at !== -1) {
    const stop = text.indexOf(XMP_END, at);
    if (stop === -1) break;
    const packet = text.slice(at, stop);
    for (const m of packet.matchAll(new RegExp(`${XMP_LOCATION}\\s*=\\s*"([^"]*)"`, 'g'))) {
      if (m[1]!.length > 0) blank(at + m.index + m[0].length - 1 - m[1]!.length, m[1]!.length);
    }
    for (const m of packet.matchAll(new RegExp(`<(${XMP_LOCATION})>([\\s\\S]*?)</\\1>`, 'g'))) {
      if (m[2]!.length > 0) blank(at + m.index + m[1]!.length + 2, m[2]!.length);
    }
    at = text.indexOf(XMP_START, stop);
  }
  return found;
}

function stripJpeg(b: Uint8Array): void {
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) fail('broken JPEG segment');
    const marker = b[i + 1]!;
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) return; // the image data follows: no more metadata
    const length = (b[i + 2]! << 8) | b[i + 3]!;
    const end = i + 2 + length;
    if (length < 2 || end > b.length) fail('broken JPEG segment');
    const isExif = marker === 0xe1 && latin1(b, i + 4, Math.min(end, i + 10)) === 'Exif\0\0';
    if (isExif) wipeTiffGps(b, i + 10, end);
    else if (marker === 0xed) b.fill(0, i + 4, end); // IPTC (Photoshop) block: may name a place
    i = end;
  }
}

interface Box {
  type: string;
  start: number;
  body: number;
  end: number;
}

function boxes(b: Uint8Array, from: number, to: number): Box[] {
  const out: Box[] = [];
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let at = from;
  while (at + 8 <= to) {
    let size = view.getUint32(at);
    const type = latin1(b, at + 4, at + 8);
    let body = at + 8;
    if (size === 1) {
      if (at + 16 > to) fail('broken HEIC box');
      size = Number(view.getBigUint64(at + 8));
      body = at + 16;
    } else if (size === 0) size = to - at;
    if (size < body - at || at + size > to) fail('broken HEIC box');
    out.push({ type, start: at, body, end: at + size });
    at += size;
  }
  return out;
}

function stripHeic(b: Uint8Array): void {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const meta = boxes(b, 0, b.length).find((x) => x.type === 'meta');
  if (meta === undefined) return; // no metadata at all
  const children = boxes(b, meta.body + 4, meta.end);
  const iinf = children.find((x) => x.type === 'iinf');
  const iloc = children.find((x) => x.type === 'iloc');
  if (iinf === undefined) return;

  const exifIds = new Set<number>();
  const iinfVersion = b[iinf.body]!;
  const infeFrom = iinf.body + 4 + (iinfVersion === 0 ? 2 : 4);
  for (const infe of boxes(b, infeFrom, iinf.end)) {
    if (infe.type !== 'infe') continue;
    const version = b[infe.body]!;
    if (version < 2) continue;
    const id = version === 2 ? view.getUint16(infe.body + 4) : view.getUint32(infe.body + 4);
    const typeAt = infe.body + 4 + (version === 2 ? 2 : 4) + 2;
    if (latin1(b, typeAt, typeAt + 4) === 'Exif') exifIds.add(id);
  }
  if (exifIds.size === 0) return;
  if (iloc === undefined) fail('no item locations');

  const version = b[iloc.body]!;
  let at = iloc.body + 4;
  const sizes = b[at]!;
  const offsetSize = sizes >> 4;
  const lengthSize = sizes & 0x0f;
  const baseOffsetSize = b[at + 1]! >> 4;
  const indexSize = version === 1 || version === 2 ? b[at + 1]! & 0x0f : 0;
  at += 2;
  const readN = (n: number) => {
    if (at + n > iloc.end) fail('broken item locations');
    let v = 0;
    for (let k = 0; k < n; k += 1) v = v * 256 + b[at + k]!;
    at += n;
    return v;
  };
  const itemCount = readN(version < 2 ? 2 : 4);
  for (let item = 0; item < itemCount; item += 1) {
    const id = readN(version < 2 ? 2 : 4);
    const method = version === 1 || version === 2 ? readN(2) & 0x0f : 0;
    readN(2); // data reference index
    const base = readN(baseOffsetSize);
    const extents = readN(2);
    const list: Array<{ offset: number; length: number }> = [];
    for (let e = 0; e < extents; e += 1) {
      readN(indexSize);
      list.push({ offset: readN(offsetSize), length: readN(lengthSize) });
    }
    if (!exifIds.has(id)) continue;
    if (method !== 0 || list.length !== 1) fail('EXIF stored in an unusual way');
    const start = base + list[0]!.offset;
    const end = start + (list[0]!.length === 0 ? b.length - start : list[0]!.length);
    if (end > b.length || start + 4 > end) fail('EXIF item out of range');
    wipeTiffGps(b, start + 4 + view.getUint32(start), end);
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(b: Uint8Array, from: number, to: number): number {
  let c = 0xffffffff;
  for (let i = from; i < to; i += 1) c = CRC_TABLE[(c ^ b[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function stripPng(b: Uint8Array): void {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let at = 8;
  while (at + 12 <= b.length) {
    const length = view.getUint32(at);
    const type = latin1(b, at + 4, at + 8);
    const data = at + 8;
    const end = data + length;
    if (end + 4 > b.length) fail('broken PNG chunk');
    const changed = type === 'eXIf' ? wipeTiffGps(b, data, end) : type === 'iTXt' || type === 'tEXt' ? blankXmpLocation(b, data, end) : false;
    if (changed) view.setUint32(end, crc32(b, at + 4, end));
    if (type === 'IEND') return;
    at = end + 4;
  }
}

/**
 * A copy of `bytes` with the location taken out of its metadata (the image itself is untouched). Throws
 * `LocationNotRemovedError` when the file's metadata is laid out in a way this cannot safely change.
 */
export function stripLocation(bytes: Uint8Array, format: ImageFormat): Uint8Array {
  const b = bytes.slice();
  if (format === 'jpeg') stripJpeg(b);
  else if (format === 'heic') stripHeic(b);
  else {
    stripPng(b);
    return b; // PNG text chunks were handled with their checksums
  }
  blankXmpLocation(b);
  return b;
}
