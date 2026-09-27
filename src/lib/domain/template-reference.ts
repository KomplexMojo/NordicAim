// template-reference.md §4 (M26, REV-121). A reference sheet: a blank target sheet cut down to its target circles,
// one per template. Pure zod schemas and helpers; no DOM, no IO.

import { z } from 'zod';

import { TemplateId } from './enums';
import { Calibration } from './photo';
import { UtcIso } from './primitives';

/** §4: a custom reference the user made from a photo. The image is the blob `reference:<template>:image`. */
export const TemplateReference = z.object({
  template: TemplateId,
  capturedAt: UtcIso,
  sha256: z.string().regex(/^[0-9a-f]{64}$/), // of the stored JPEG bytes
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
  calibration: Calibration, // from §3 step 4, in this image's pixels
});
export type TemplateReference = z.infer<typeof TemplateReference>;

/** §4: `null` means the shipped default is in use. */
export const TemplateReferences = z.object({
  sighting: TemplateReference.nullable(),
  precision: TemplateReference.nullable(),
});
export type TemplateReferences = z.infer<typeof TemplateReferences>;

export const DEFAULT_TEMPLATE_REFERENCES: TemplateReferences = { sighting: null, precision: null };

/** §4: which reference an analysis used; `null` when detection used the geometric masks alone. */
export const ReferenceUsed = z.object({
  template: TemplateId,
  source: z.enum(['default', 'custom']),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type ReferenceUsed = z.infer<typeof ReferenceUsed>;
