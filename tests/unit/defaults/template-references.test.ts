import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { calibrationWithPerspective } from '@/lib/cv/alignment-perspective';
import { detectAnchor } from '@/lib/cv/anchor';
import type { OpenCv } from '@/lib/cv/opencv';
import { hintTemplate } from '@/lib/cv/template-hint';
import { DEFAULT_TEMPLATE_REFERENCE } from '@/lib/defaults/template-references';
import { TemplateReference } from '@/lib/domain/template-reference';

import { loadOpenCvForTests } from '../../helpers/opencv';
import { jpegFileToRgba } from '../../helpers/rgba';

// template-reference.md §5: the recorded size, hash and calibration of each shipped default match its file, and the
// app's own A4 still finds that calibration on it (so a re-exported asset can't silently drift from the record).
const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const TEMPLATES = ['sighting', 'precision'] as const;

let cv: OpenCv;
beforeAll(async () => {
  cv = await loadOpenCvForTests();
}, 60_000);

describe('shipped default reference sheets (template-reference.md §5)', () => {
  for (const template of TEMPLATES) {
    const record = DEFAULT_TEMPLATE_REFERENCE[template];
    const path = `${REPO}public/${record.assetPath}`;

    it(`${template}: the record is a valid reference`, () => {
      expect(record.template).toBe(template);
      const parsed = TemplateReference.safeParse({ ...record, capturedAt: '2026-09-27T00:00:00.000Z' });
      expect(parsed.success).toBe(true);
    });

    it(`${template}: the hash matches the file`, () => {
      expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(record.sha256);
    });

    it(`${template}: the app's A4 finds the recorded disc and names the template`, async () => {
      const img = await jpegFileToRgba(path);
      expect([img.width, img.height]).toEqual([record.widthPx, record.heightPx]);
      const detection = detectAnchor(cv, img, null, 'both');
      expect(detection).not.toBeNull();
      expect(hintTemplate(cv, img, detection!.calibration).template).toBe(template);
      const cal = calibrationWithPerspective(img, detection!.calibration, template) ?? detection!.calibration;
      const r = record.calibration.radiusPx;
      expect(Math.hypot(cal.cx - record.calibration.cx, cal.cy - record.calibration.cy)).toBeLessThan(0.005 * r);
      expect(Math.abs(cal.radiusPx - r)).toBeLessThan(0.005 * r);
      expect(cal.anchorDiameterMm).toBe(record.calibration.anchorDiameterMm);
    }, 60_000);
  }
});
