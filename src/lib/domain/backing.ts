// backing-sheet.md §3 (REV-38). The optional coloured backing sheet a shooter puts behind the target,
// and the colour it shows through every hole. Pure zod schemas and helpers; no DOM, no IO.

import { z } from 'zod';

import { Id } from './primitives';
import type { PhotoOrigin } from './enums';

/** backing-sheet.md §3: the measured colour of a backing, from a card photo or an estimate. */
export const ColourSignature = z.object({
  hueDeg: z.number().gte(0).lt(360), // circular median hue of the backing
  hueSpreadDeg: z.number().gte(0).lte(90), // half-width covering the p10..p90 hue range
  satP10: z.number().min(0).max(1), // HSV saturation, 10th percentile of accepted pixels
  valP10: z.number().min(0).max(1), // HSV value, 10th percentile
  samples: z.number().int().positive(),
});
export type ColourSignature = z.infer<typeof ColourSignature>;

/** backing-sheet.md §3: the backing itself — its card photo (when taken) and its colour (when known). */
export const BackingSheet = z.object({
  kind: z.literal('coloured'),
  source: z.enum(['card', 'estimated']),
  // Always null since REV-48 (the card photo is not kept); kept so records stored before it still parse.
  cardPhotoId: Id.nullable(),
  colour: ColourSignature.nullable(), // null until a card is measured or an estimate succeeds
});
export type BackingSheet = z.infer<typeof BackingSheet>;

/**
 * backing-sheet.md §2: `Auto` decides per photo whether a coloured backing is present (§4a), `None`
 * never uses colour, `Coloured backing` always does.
 */
export const BackingMode = z.enum(['auto', 'none', 'coloured']);
export type BackingMode = z.infer<typeof BackingMode>;

/** backing-sheet.md §2: the default for a shooter who has never chosen. */
export const DEFAULT_BACKING_MODE: BackingMode = 'auto';

/**
 * backing-sheet.md §3: `PhotoOrigin` for a backing-card photo — never a target. Since REV-48 nothing new
 * is written with it; the migration (§3a) deletes the ones stored before.
 */
export const BACKING_CARD_ORIGIN = 'backing-card' satisfies PhotoOrigin;

/**
 * backing-sheet.md §3: a backing-card photo is **not a target**. It is excluded from Stage A and B,
 * from photo counts, "Analyze N targets", results cards, the summary image and every share.
 */
export function isTargetPhoto(photo: { origin: PhotoOrigin }): boolean {
  return photo.origin !== BACKING_CARD_ORIGIN;
}

/** The label the Settings screen's Backing sheet select shows for a mode (backing-sheet.md §2). */
export const BACKING_MODE_LABEL: Record<BackingMode, string> = {
  auto: 'Auto',
  none: 'None',
  coloured: 'Coloured backing',
};

/**
 * backing-sheet.md §2: the colour swatch the Settings screen shows. It is drawn from the measured
 * signature itself (hue with the 10th-percentile saturation and value), so what the shooter sees is
 * what detection matches, not a prettified version of it.
 */
export function swatchCss(colour: ColourSignature): string {
  const c = colour.valP10 * colour.satP10;
  const x = c * (1 - Math.abs(((colour.hueDeg / 60) % 2) - 1));
  const m = colour.valP10 - c;
  const sector = Math.floor(colour.hueDeg / 60) % 6;
  const rgb: [number, number, number] =
    sector === 0
      ? [c, x, 0]
      : sector === 1
        ? [x, c, 0]
        : sector === 2
          ? [0, c, x]
          : sector === 3
            ? [0, x, c]
            : sector === 4
              ? [x, 0, c]
              : [c, 0, x];
  const to255 = (v: number): number => Math.max(0, Math.min(255, Math.round((v + m) * 255)));
  return `rgb(${to255(rgb[0])}, ${to255(rgb[1])}, ${to255(rgb[2])})`;
}

/** backing-sheet.md §4: shown when a card photo yields no clear colour. */
export const CARD_NO_COLOUR_MESSAGE =
  "Couldn't find a clear colour on this card. Retake it in even light, filling the frame.";
