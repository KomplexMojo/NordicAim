import { describe, expect, it } from 'vitest';

// @ts-expect-error: a Node-only .mjs script without type declarations.
import { codeBits, KINDS, MARK } from '../../../scripts/make-test-sheets.mjs';

// Issue #65: the printable test sheet's code strip and registration marks.

describe('test sheet code strip', () => {
  it('reads start, kind (2 bits), version (3 bits), even parity, stop', () => {
    expect(codeBits(0, 1)).toEqual([1, 0, 0, 0, 0, 1, 1, 1]); // sight in, v1
    expect(codeBits(1, 1)).toEqual([1, 0, 1, 0, 0, 1, 0, 1]); // confirm
    expect(codeBits(2, 1)).toEqual([1, 1, 0, 0, 0, 1, 0, 1]); // precision prone
    expect(codeBits(3, 1)).toEqual([1, 1, 1, 0, 0, 1, 1, 1]); // precision standing
  });

  it('gives every kind its own code, and every code has even parity over kind and version', () => {
    const codes = (KINDS as Array<{ code: number }>).map((k) => codeBits(k.code, 1).join(''));
    expect(new Set(codes).size).toBe(4);
    for (const k of KINDS as Array<{ code: number }>) {
      const bits = codeBits(k.code, 1) as number[];
      expect(bits.slice(1, 7).reduce((a, b) => a + b, 0) % 2).toBe(0);
    }
  });

  it('places the marks 170 × 210 mm apart, far enough out to clear the 154.4 mm precision target', () => {
    expect([2 * MARK.dx, 2 * MARK.dy]).toEqual([170, 210]);
    expect(MARK.dx - MARK.size / 2).toBeGreaterThan(154.4 / 2);
  });
});
