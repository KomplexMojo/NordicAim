// A QR Code encoder (ISO/IEC 18004), byte mode, versions 1-10 (plenty for this app's URLs: a version-10
// code at the lowest error-correction level holds 174 bytes). Written from scratch rather than adding a
// dependency (AGENTS.md golden rule 3): generation needs no camera and no decoder, just this module's own
// pure arithmetic. Verified module-for-module against a reference encoder and round-trip-scanned with a
// real decoder before landing; the mask-penalty scoring (ISO §8.8.2) and the version/format bit layout are
// the parts most QR write-ups get subtly wrong, so both are covered by this module's unit tests. Pure.

import { el } from './svg';

export type QrErrorCorrection = 'L' | 'M' | 'Q' | 'H';

// --- GF(256) arithmetic (primitive polynomial x^8+x^4+x^3+x^2+1 = 0x11d, generator 2) ---
const GF_EXP = new Int32Array(512);
const GF_LOG = new Int32Array(256);
(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255]!;
})();
function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a]! + GF_LOG[b]!]!;
}

/** Reed-Solomon generator polynomial of the given degree, coefficients highest-order first. */
function rsGeneratorPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next: number[] = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j]! ^= poly[j]!;
      next[j + 1]! ^= gfMul(poly[j]!, GF_EXP[i]!);
    }
    poly = next;
  }
  return poly;
}

/** The `ecLen` error-correction codewords for one block of data codewords. */
function rsRemainder(data: number[], ecLen: number): number[] {
  const gen = rsGeneratorPoly(ecLen);
  const res = data.concat(new Array(ecLen).fill(0));
  for (let i = 0; i < data.length; i++) {
    const coef = res[i]!;
    if (coef === 0) continue;
    for (let j = 0; j < gen.length; j++) res[i + j]! ^= gfMul(gen[j]!, coef);
  }
  return res.slice(data.length);
}

// Error-correction block structure (ISO/IEC 18004 Table 9), versions 1-10: per-block EC codewords and
// each group's block count/data-codeword size. Most versions have one group; a few split into two so no
// single block holds too many codewords for one Reed-Solomon pass.
interface EcBlockShape {
  ec: number;
  g1Blocks: number;
  g1Data: number;
  g2Blocks: number;
  g2Data: number;
}
const EC_TABLE: Record<number, Record<QrErrorCorrection, EcBlockShape>> = {
  1: { L: { ec: 7, g1Blocks: 1, g1Data: 19, g2Blocks: 0, g2Data: 0 }, M: { ec: 10, g1Blocks: 1, g1Data: 16, g2Blocks: 0, g2Data: 0 }, Q: { ec: 13, g1Blocks: 1, g1Data: 13, g2Blocks: 0, g2Data: 0 }, H: { ec: 17, g1Blocks: 1, g1Data: 9, g2Blocks: 0, g2Data: 0 } },
  2: { L: { ec: 10, g1Blocks: 1, g1Data: 34, g2Blocks: 0, g2Data: 0 }, M: { ec: 16, g1Blocks: 1, g1Data: 28, g2Blocks: 0, g2Data: 0 }, Q: { ec: 22, g1Blocks: 1, g1Data: 22, g2Blocks: 0, g2Data: 0 }, H: { ec: 28, g1Blocks: 1, g1Data: 16, g2Blocks: 0, g2Data: 0 } },
  3: { L: { ec: 15, g1Blocks: 1, g1Data: 55, g2Blocks: 0, g2Data: 0 }, M: { ec: 26, g1Blocks: 1, g1Data: 44, g2Blocks: 0, g2Data: 0 }, Q: { ec: 18, g1Blocks: 2, g1Data: 17, g2Blocks: 0, g2Data: 0 }, H: { ec: 22, g1Blocks: 2, g1Data: 13, g2Blocks: 0, g2Data: 0 } },
  4: { L: { ec: 20, g1Blocks: 1, g1Data: 80, g2Blocks: 0, g2Data: 0 }, M: { ec: 18, g1Blocks: 2, g1Data: 32, g2Blocks: 0, g2Data: 0 }, Q: { ec: 26, g1Blocks: 2, g1Data: 24, g2Blocks: 0, g2Data: 0 }, H: { ec: 16, g1Blocks: 4, g1Data: 9, g2Blocks: 0, g2Data: 0 } },
  5: { L: { ec: 26, g1Blocks: 1, g1Data: 108, g2Blocks: 0, g2Data: 0 }, M: { ec: 24, g1Blocks: 2, g1Data: 43, g2Blocks: 0, g2Data: 0 }, Q: { ec: 18, g1Blocks: 2, g1Data: 15, g2Blocks: 2, g2Data: 16 }, H: { ec: 22, g1Blocks: 2, g1Data: 11, g2Blocks: 2, g2Data: 12 } },
  6: { L: { ec: 18, g1Blocks: 2, g1Data: 68, g2Blocks: 0, g2Data: 0 }, M: { ec: 16, g1Blocks: 4, g1Data: 27, g2Blocks: 0, g2Data: 0 }, Q: { ec: 24, g1Blocks: 4, g1Data: 19, g2Blocks: 0, g2Data: 0 }, H: { ec: 28, g1Blocks: 4, g1Data: 15, g2Blocks: 0, g2Data: 0 } },
  7: { L: { ec: 20, g1Blocks: 2, g1Data: 78, g2Blocks: 0, g2Data: 0 }, M: { ec: 18, g1Blocks: 4, g1Data: 31, g2Blocks: 0, g2Data: 0 }, Q: { ec: 18, g1Blocks: 2, g1Data: 14, g2Blocks: 4, g2Data: 15 }, H: { ec: 26, g1Blocks: 4, g1Data: 13, g2Blocks: 1, g2Data: 14 } },
  8: { L: { ec: 24, g1Blocks: 2, g1Data: 97, g2Blocks: 0, g2Data: 0 }, M: { ec: 22, g1Blocks: 2, g1Data: 38, g2Blocks: 2, g2Data: 39 }, Q: { ec: 22, g1Blocks: 4, g1Data: 18, g2Blocks: 2, g2Data: 19 }, H: { ec: 26, g1Blocks: 4, g1Data: 14, g2Blocks: 2, g2Data: 15 } },
  9: { L: { ec: 30, g1Blocks: 2, g1Data: 116, g2Blocks: 0, g2Data: 0 }, M: { ec: 22, g1Blocks: 3, g1Data: 36, g2Blocks: 2, g2Data: 37 }, Q: { ec: 20, g1Blocks: 4, g1Data: 16, g2Blocks: 4, g2Data: 17 }, H: { ec: 24, g1Blocks: 4, g1Data: 12, g2Blocks: 4, g2Data: 13 } },
  10: { L: { ec: 18, g1Blocks: 2, g1Data: 68, g2Blocks: 2, g2Data: 69 }, M: { ec: 26, g1Blocks: 4, g1Data: 43, g2Blocks: 1, g2Data: 44 }, Q: { ec: 24, g1Blocks: 6, g1Data: 19, g2Blocks: 2, g2Data: 20 }, H: { ec: 28, g1Blocks: 6, g1Data: 15, g2Blocks: 2, g2Data: 16 } },
};

function totalDataCodewords(version: number, level: QrErrorCorrection): number {
  const c = EC_TABLE[version]![level];
  return c.g1Blocks * c.g1Data + c.g2Blocks * c.g2Data;
}

// Alignment pattern centre positions by version; the grid is this list crossed with itself, minus the
// three combinations that would overlap a finder pattern (first×first, first×last, last×first).
const ALIGNMENT_POSITIONS: Record<number, number[]> = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
  7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

/** The 15-bit format string (EC level + mask, BCH(15,5) with the fixed XOR mask), LSB-first. */
function formatBitsLsbFirst(level: QrErrorCorrection, mask: number): number[] {
  const levelBits: Record<QrErrorCorrection, number> = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 };
  const data = (levelBits[level] << 3) | mask;
  let d = data << 10;
  const gen = 0b10100110111;
  for (let i = 14; i >= 10; i--) if (d & (1 << i)) d ^= gen << (i - 10);
  const masked = ((data << 10) | d) ^ 0b101010000010010;
  return Array.from({ length: 15 }, (_, i) => (masked >> i) & 1);
}

/** The 18-bit version string (version 7+), BCH(18,6), LSB-first, no XOR mask. */
function versionBitsLsbFirst(version: number): number[] {
  let d = version << 12;
  const gen = 0b1111100100101;
  for (let i = 17; i >= 12; i--) if (d & (1 << i)) d ^= gen << (i - 12);
  const code = (version << 12) | d;
  return Array.from({ length: 18 }, (_, i) => (code >> i) & 1);
}

/** Byte-mode data + padding, split into blocks, each with its Reed-Solomon codewords appended, then
 * interleaved column-wise (data codewords first, then EC codewords) per ISO/IEC 18004 §8.6. */
function buildCodewords(text: string, version: number, level: QrErrorCorrection): number[] {
  const bytes = Array.from(new TextEncoder().encode(text));
  const dataCap = totalDataCodewords(version, level);
  const countBits = version <= 9 ? 8 : 16;

  const bits: number[] = [];
  const push = (val: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  push(0b0100, 4); // byte mode indicator
  push(bytes.length, countBits);
  for (const b of bytes) push(b, 8);
  if (bits.length + 4 <= dataCap * 8) push(0, 4); // terminator, only if it fits
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j]!;
    codewords.push(v);
  }
  let pad = 0;
  while (codewords.length < dataCap) {
    codewords.push(pad === 0 ? 0xec : 0x11);
    pad ^= 1;
  }
  if (codewords.length > dataCap) {
    throw new Error(`qrcode: text too long for version ${version} at level ${level}`);
  }

  const shape = EC_TABLE[version]![level];
  const blocks: number[][] = [];
  let idx = 0;
  for (let i = 0; i < shape.g1Blocks; i++, idx += shape.g1Data) blocks.push(codewords.slice(idx, idx + shape.g1Data));
  for (let i = 0; i < shape.g2Blocks; i++, idx += shape.g2Data) blocks.push(codewords.slice(idx, idx + shape.g2Data));
  const ecBlocks = blocks.map((b) => rsRemainder(b, shape.ec));

  const final: number[] = [];
  const maxData = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxData; i++) for (const b of blocks) if (i < b.length) final.push(b[i]!);
  for (let i = 0; i < shape.ec; i++) for (const eb of ecBlocks) final.push(eb[i]!);
  return final;
}

function maskFn(mask: number): (r: number, c: number) => boolean {
  switch (mask) {
    case 0: return (r, c) => (r + c) % 2 === 0;
    case 1: return (r) => r % 2 === 0;
    case 2: return (_r, c) => c % 3 === 0;
    case 3: return (r, c) => (r + c) % 3 === 0;
    case 4: return (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    case 7: return (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    default: throw new Error(`qrcode: bad mask pattern ${mask}`);
  }
}

/** ISO/IEC 18004 §8.8.2: the four penalty rules used to pick the most scanner-friendly of the 8 masks. */
function maskPenalty(m: number[][], size: number): number {
  let score = 0;
  const runPenalty = (line: number[]) => {
    let p = 0;
    let runLen = 1;
    for (let i = 1; i <= line.length; i++) {
      if (i < line.length && line[i] === line[i - 1]) {
        runLen++;
        continue;
      }
      if (runLen >= 5) p += 3 + (runLen - 5);
      runLen = 1;
    }
    return p;
  };
  for (let r = 0; r < size; r++) score += runPenalty(m[r]!);
  for (let c = 0; c < size; c++) score += runPenalty(m.map((row) => row[c]!));

  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = m[r]![c]!;
      if (v === m[r]![c + 1] && v === m[r + 1]![c] && v === m[r + 1]![c + 1]) score += 3;
    }
  }

  const finderLike = [1, 0, 1, 1, 1, 0, 1];
  const matchesAt = (line: number[], i: number) => finderLike.every((v, k) => line[i + k] === v);
  const checkLine = (line: number[]) => {
    let p = 0;
    for (let i = 0; i + 7 <= line.length; i++) {
      if (!matchesAt(line, i)) continue;
      if (i >= 4 && line.slice(i - 4, i).every((v) => v === 0)) p += 40;
      if (i + 11 <= line.length && line.slice(i + 7, i + 11).every((v) => v === 0)) p += 40;
    }
    return p;
  };
  for (let r = 0; r < size; r++) score += checkLine(m[r]!);
  for (let c = 0; c < size; c++) score += checkLine(m.map((row) => row[c]!));

  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark += m[r]![c]!;
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

/** The smallest version (1-10) whose capacity fits `text` in byte mode at `level`. */
function chooseVersion(text: string, level: QrErrorCorrection): number {
  const byteLen = new TextEncoder().encode(text).length;
  for (let v = 1; v <= 10; v++) {
    const countBits = v <= 9 ? 8 : 16;
    const needed = 4 + countBits + byteLen * 8;
    if (needed <= totalDataCodewords(v, level) * 8) return v;
  }
  throw new Error(`qrcode: "${text}" is too long for versions 1-10 at level ${level}`);
}

/**
 * Encodes `text` (byte mode) as a QR Code matrix, `true` = dark module. Picks the smallest version
 * (1-10) that fits, then the mask (of the 8 standard patterns) with the lowest ISO §8.8.2 penalty.
 */
export function qrMatrix(text: string, level: QrErrorCorrection = 'M'): boolean[][] {
  const version = chooseVersion(text, level);
  const size = 17 + version * 4;
  const grid: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));
  const isFunction: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const setFunction = (r: number, c: number, val: number) => {
    grid[r]![c] = val;
    isFunction[r]![c] = true;
  };

  const placeFinder = (r0: number, c0: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = r0 + dr;
        const c = c0 + dc;
        if (r < 0 || c < 0 || r >= size || c >= size) continue;
        let val = 0;
        if (dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6) {
          const onBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
          const inner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
          val = onBorder || inner ? 1 : 0;
        }
        setFunction(r, c, val);
      }
    }
  };
  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  for (let i = 8; i < size - 8; i++) {
    if (!isFunction[6]![i]) setFunction(6, i, i % 2 === 0 ? 1 : 0);
    if (!isFunction[i]![6]) setFunction(i, 6, i % 2 === 0 ? 1 : 0);
  }

  const pos = ALIGNMENT_POSITIONS[version]!;
  const first = pos[0];
  const last = pos[pos.length - 1];
  for (const r of pos) {
    for (const c of pos) {
      if ((r === first && c === first) || (r === first && c === last) || (r === last && c === first)) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const onBorder = dr === -2 || dr === 2 || dc === -2 || dc === 2;
          const center = dr === 0 && dc === 0;
          setFunction(r + dr, c + dc, onBorder || center ? 1 : 0);
        }
      }
    }
  }

  // Reserve the format-info strips (row 8, col 8) and the dark module with placeholder values; the real
  // bits are written after the mask is chosen below. (8,8) itself belongs to neither strip's loop and
  // must be reserved explicitly, or data placement fills it and silently drops one data bit.)
  for (let i = 0; i < 8; i++) {
    if (!isFunction[8]![i]) setFunction(8, i, 0);
    if (!isFunction[i]![8]) setFunction(i, 8, 0);
  }
  setFunction(8, 8, 0);
  for (let i = 0; i < 8; i++) {
    setFunction(8, size - 1 - i, 0);
    setFunction(size - 1 - i, 8, 0);
  }
  setFunction(size - 8, 8, 1); // dark module

  if (version >= 7) {
    for (let r = 0; r < 6; r++) for (let c = 0; c < 3; c++) setFunction(r, size - 11 + c, 0);
    for (let c = 0; c < 6; c++) for (let r = 0; r < 3; r++) setFunction(size - 11 + r, c, 0);
  }

  // Zigzag data placement: two-column strips from the right edge, direction alternating, skipping the
  // timing column and any reserved cell.
  const codewords = buildCodewords(text, version, level);
  const dataBits: number[] = [];
  for (const cw of codewords) for (let i = 7; i >= 0; i--) dataBits.push((cw >> i) & 1);
  let bitIdx = 0;
  const nextBit = () => (bitIdx < dataBits.length ? dataBits[bitIdx++]! : 0);

  let col = size - 1;
  let upward = true;
  while (col > 0) {
    if (col === 6) col--;
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (const c of [col, col - 1]) {
        if (!isFunction[row]![c]) grid[row]![c] = nextBit();
      }
    }
    upward = !upward;
    col -= 2;
  }

  let best: { matrix: number[][]; score: number; mask: number } | null = null;
  for (let mask = 0; mask < 8; mask++) {
    const fn = maskFn(mask);
    const m = grid.map((row, r) => row.map((v, c) => (isFunction[r]![c] ? v : v ^ (fn(r, c) ? 1 : 0))));
    const score = maskPenalty(m, size);
    if (!best || score < best.score) best = { matrix: m, score, mask };
  }
  const finalMatrix = best!.matrix;
  const mask = best!.mask;

  const fBits = formatBitsLsbFirst(level, mask);
  // "Vertical" copy: col 8, continuous from the top-left finder (bits 0-7) into the bottom-left (8-14).
  for (let i = 0; i < 15; i++) {
    const row = i < 6 ? i : i < 8 ? i + 1 : size - 15 + i;
    finalMatrix[row]![8] = fBits[i]!;
  }
  // "Horizontal" copy: row 8, from the top-right (bits 0-7) into the top-left (8-14), skipping col 6/8.
  for (let i = 0; i < 15; i++) {
    const col2 = i < 8 ? size - 1 - i : i < 9 ? 7 : 15 - i - 1;
    finalMatrix[8]![col2] = fBits[i]!;
  }

  if (version >= 7) {
    const vBits = versionBitsLsbFirst(version);
    for (let i = 0; i < 18; i++) finalMatrix[Math.floor(i / 3)]![(i % 3) + size - 11] = vBits[i]!;
    for (let i = 0; i < 18; i++) finalMatrix[(i % 3) + size - 11]![Math.floor(i / 3)] = vBits[i]!;
  }

  return finalMatrix.map((row) => row.map((v) => v === 1));
}

export interface QrSvgOptions {
  /** Error correction level. Default `'M'` (recovers ~15%): a reasonable default for print and screens. */
  level?: QrErrorCorrection;
  /** Pixels per module at the SVG's own coordinate scale (it's a `viewBox`, so this just sets proportions
   * unless the caller also fixes width/height). Default 4. */
  moduleSize?: number;
  /** Quiet zone width in modules around the code; ISO/IEC 18004 recommends at least 4. Default 4. */
  quietZone?: number;
  /** Dark module colour. Default `#000000`. */
  dark?: string;
  /** Light module / background colour. Omit for a transparent background. */
  light?: string;
}

/** Renders `text` as a self-contained QR Code `<svg>` (all dark modules as one `<path>`). */
export function qrCodeSvg(text: string, opts: QrSvgOptions = {}): string {
  const { level = 'M', moduleSize = 4, quietZone = 4, dark = '#000000', light } = opts;
  const matrix = qrMatrix(text, level);
  const n = matrix.length;
  const side = (n + quietZone * 2) * moduleSize;

  let path = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!matrix[r]![c]) continue;
      const x = (c + quietZone) * moduleSize;
      const y = (r + quietZone) * moduleSize;
      path += `M${x} ${y}h${moduleSize}v${moduleSize}h${-moduleSize}z`;
    }
  }

  const background = light !== undefined ? el('rect', { x: 0, y: 0, width: side, height: side, fill: light }) : '';
  const modules = el('path', { d: path, fill: dark });
  return el('svg', { xmlns: 'http://www.w3.org/2000/svg', width: side, height: side, viewBox: `0 0 ${side} ${side}` }, background + modules);
}
