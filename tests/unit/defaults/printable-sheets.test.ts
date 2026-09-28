import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PRINTABLE_SHEET } from '@/lib/defaults/printable-sheets';

// @ts-expect-error: a Node-only .mjs script without type declarations.
import { SHEETS } from '../../../scripts/make-test-sheets.mjs';

// Issue #67 (REV-135): each template's printable sheet is a committed two-page US Letter PDF that the script makes.
const REPO = fileURLToPath(new URL('../../../', import.meta.url));

describe('printable sheets', () => {
  it('match the files the script writes', () => {
    const fromScript = (SHEETS as Array<{ template: string; file: string }>).map((s) => [s.template, `sheets/${s.file}`]);
    expect(fromScript).toEqual(Object.values(PRINTABLE_SHEET).map((s) => [s.template, s.assetPath]));
  });

  for (const sheet of Object.values(PRINTABLE_SHEET)) {
    it(`${sheet.template}: is a two-page US Letter PDF in public/`, () => {
      const pdf = readFileSync(`${REPO}public/${sheet.assetPath}`).toString('latin1');
      expect(pdf.startsWith('%PDF-')).toBe(true);
      const boxes = [...pdf.matchAll(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/g)].map((m) => [Number(m[1]), Number(m[2])]);
      expect(boxes).toHaveLength(2);
      for (const [w, h] of boxes) {
        expect(w).toBeCloseTo(612, 0);
        expect(h).toBeCloseTo(792, 0);
      }
    });
  }
});
