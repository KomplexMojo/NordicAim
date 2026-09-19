// backing-sheet.md §2, §4 (REV-48). The backing card: measure the photo's colour and, when there is
// one, store it as the Settings backing. **The card photo itself is not kept** — the colour signature
// is all detection uses, and the Settings swatch is drawn from it. A card that yields no clear colour
// stores nothing; the UI shows `CARD_NO_COLOUR_MESSAGE` instead.

import { backingColourFromCard } from '@/lib/cv/backing-colour';
import type { ColourSignature } from '@/lib/domain/backing';
import type { AppSettings } from '@/lib/domain/settings';

import type { ServiceContext } from './context';
import type { ImageTools } from './ingest';
import { setBacking } from './settings';

/**
 * The card is a flat colour: 512 px on the long side is far more than the statistics need and keeps
 * the measurement instant on a phone.
 */
export const CARD_MEASURE_LONGEST = 512;

export interface MeasureBackingCardResult {
  /** Null when the card showed no clear colour: nothing was stored (backing-sheet.md §4.3). */
  colour: ColourSignature | null;
  settings: AppSettings | null;
}

/**
 * backing-sheet.md §4: measure the card (before anything is written, so a colourless card leaves no
 * trace) and store its colour as the Settings backing. The mode is left as the user set it — `Auto`
 * uses the card colour when there is one (§4a). Changing it re-runs nothing (§2).
 */
export async function measureBackingCard(
  ctx: ServiceContext,
  blob: Blob,
  imageTools: Pick<ImageTools, 'toRgba'>,
): Promise<MeasureBackingCardResult> {
  const rgba = await imageTools.toRgba(blob, CARD_MEASURE_LONGEST);
  const colour = backingColourFromCard(rgba);
  if (colour === null) return { colour: null, settings: null };
  const settings = await setBacking(ctx, { kind: 'coloured', source: 'card', cardPhotoId: null, colour });
  return { colour, settings };
}
