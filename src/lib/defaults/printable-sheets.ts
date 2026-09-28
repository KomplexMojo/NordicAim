// template-reference.md §10 (issue #67, REV-135). The printable NordicAim training sheets, one US Letter PDF per template, made by
// `pnpm make:test-sheets` (`scripts/make-test-sheets.mjs`, whose `SHEETS` list must match this) into `public/sheets/`. They are
// same-origin static assets, precached by the service worker so they download offline at the range.

import type { TemplateId } from '@/lib/domain/enums';

export interface PrintableSheet {
  template: TemplateId;
  /** Relative to the app's base URL (`import.meta.env.BASE_URL`). */
  assetPath: string;
  /** The name the download is saved under. */
  fileName: string;
  /** What the PDF's pages are, in order. */
  pages: string;
}

export const PRINTABLE_SHEET: Record<TemplateId, PrintableSheet> = {
  sighting: {
    template: 'sighting',
    assetPath: 'sheets/nordicaim-sighting-letter.pdf',
    fileName: 'nordicaim-sighting-letter.pdf',
    pages: 'Sight in, Confirm',
  },
  precision: {
    template: 'precision',
    assetPath: 'sheets/nordicaim-precision-letter.pdf',
    fileName: 'nordicaim-precision-letter.pdf',
    pages: 'Prone, Standing',
  },
};
