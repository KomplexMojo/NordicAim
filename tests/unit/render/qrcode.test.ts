import { describe, expect, it } from 'vitest';

import { qrCodeSvg, qrMatrix } from '@/lib/render/qrcode';

/**
 * `qrMatrix('A', 'L')` (version 1, 21x21), rows joined by `|`. Captured from this module after it was
 * checked bit-for-bit against an independent reference QR encoder and round-trip-scanned with zbar; any
 * change here means the module's output changed, which should only happen deliberately.
 */
const A_LEVEL_L_VERSION_1 =
  '111111100101101111111|100000100111001000001|101110101101101011101|101110100101001011101|' +
  '101110100010101011101|100000100000101000001|111111101010101111111|000000001101100000000|' +
  '111011111111011000100|101100001000001000110|010111100110100010001|010110001100001000100|' +
  '001101101000101010101|000000001001010101010|111111101011011101111|100000101111110111000|' +
  '101110101101011101101|101110100110001000110|101110101100100010001|100000101000001000110|' +
  '111111101110101010111';

function matrixToRows(m: boolean[][]): string {
  return m.map((row) => row.map((v) => (v ? '1' : '0')).join('')).join('|');
}

describe('render/qrcode', () => {
  it('matches a known-good encoding exactly (version 1, level L)', () => {
    expect(matrixToRows(qrMatrix('A', 'L'))).toBe(A_LEVEL_L_VERSION_1);
  });

  it('picks the smallest version that fits and grows by 4 modules per version', () => {
    expect(qrMatrix('A', 'L').length).toBe(21); // version 1: 17 + 4*1
    const longer = qrMatrix('https://komplexmojo.github.io/NordicAim/#/demo', 'M');
    expect(longer.length).toBeGreaterThan(21);
    expect((longer.length - 17) % 4).toBe(0);
  });

  it('places the three finder patterns at the expected corners', () => {
    const m = qrMatrix('https://komplexmojo.github.io/NordicAim/#/demo', 'M');
    const n = m.length;
    const isFinderRing = (r0: number, c0: number) => {
      // The 7x7 finder pattern: dark border, dark 3x3 core, light ring between.
      for (let dr = 0; dr < 7; dr++) {
        for (let dc = 0; dc < 7; dc++) {
          const onBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
          const core = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
          const expected = onBorder || core;
          if (m[r0 + dr]![c0 + dc] !== expected) return false;
        }
      }
      return true;
    };
    expect(isFinderRing(0, 0)).toBe(true);
    expect(isFinderRing(0, n - 7)).toBe(true);
    expect(isFinderRing(n - 7, 0)).toBe(true);
  });

  it('throws for text that cannot fit in versions 1-10 at the given level', () => {
    expect(() => qrMatrix('x'.repeat(400), 'H')).toThrow(/too long/);
  });

  it('a higher error-correction level never shrinks capacity headroom at the same version', () => {
    // Longer text needs a higher version at H than at L, since H carries more redundancy per module.
    const text = 'https://komplexmojo.github.io/NordicAim/#/demo?club=a-reasonably-long-club-name-here';
    expect(qrMatrix(text, 'H').length).toBeGreaterThanOrEqual(qrMatrix(text, 'L').length);
  });

  it('renders a self-contained SVG sized for the quiet zone and module size', () => {
    const svg = qrCodeSvg('A', { level: 'L', moduleSize: 4, quietZone: 4, dark: '#111111', light: '#ffffff' });
    const side = (21 + 4 * 2) * 4; // version 1 (21 modules) + 4-module quiet zone each side, at 4 px/module
    expect(svg).toContain(`width="${side}"`);
    expect(svg).toContain(`height="${side}"`);
    expect(svg).toContain(`viewBox="0 0 ${side} ${side}"`);
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('fill="#111111"');
    expect(svg.startsWith('<svg')).toBe(true);
  });

  it('omits the background rect when no light colour is given (transparent)', () => {
    const svg = qrCodeSvg('A', { level: 'L' });
    expect(svg).not.toContain('<rect');
  });
});
