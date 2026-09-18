// backing-sheet.md §2, §3, §4. The backing card: measure the photo's colour first, and only store it
// when there is one. A card that yields no clear colour is never saved as the session's card — the UI
// shows `CARD_NO_COLOUR_MESSAGE` instead.

import { backingColourFromCard } from '@/lib/cv/backing-colour';
import { BACKING_CARD_ORIGIN, type BackingSheet, type ColourSignature } from '@/lib/domain/backing';
import type { TargetPhoto } from '@/lib/domain/photo';
import { emptyCategorization } from '@/lib/domain/categorization';

import type { ServiceContext } from './context';
import { ingestPhoto, type ImageTools } from './ingest';
import { deletePhoto } from './photos';
import { SessionNotFoundError, getSession, setSessionBacking } from './sessions';

/**
 * The card is a flat colour: 512 px on the long side is far more than the statistics need and keeps
 * the measurement instant on a phone.
 */
export const CARD_MEASURE_LONGEST = 512;

export interface AddBackingCardInput {
  sessionId: string;
  blob: Blob;
  originalFilename: string | null;
  clientLocal: string;
  clientOffset: string;
}

export interface AddBackingCardResult {
  /** Null when the card showed no clear colour: nothing was stored (backing-sheet.md §4.3). */
  photo: TargetPhoto | null;
  colour: ColourSignature | null;
}

/**
 * backing-sheet.md §2, §4: measure the card, store it as a photo with `origin: 'backing-card'`, and
 * point the session's backing at it. Replacing a card removes the previous card photo. The session's
 * `backingMode` is left as the user set it — `Auto` uses a card when the session has one (§4a).
 */
export async function addBackingCard(
  ctx: ServiceContext,
  input: AddBackingCardInput,
  imageTools: ImageTools,
): Promise<AddBackingCardResult> {
  const session = await getSession(ctx, input.sessionId);
  if (session === null) throw new SessionNotFoundError(input.sessionId);

  // Measured BEFORE anything is stored, so a colourless card leaves no trace.
  const rgba = await imageTools.toRgba(input.blob, CARD_MEASURE_LONGEST);
  const colour = backingColourFromCard(rgba);
  if (colour === null) return { photo: null, colour: null };

  const photo = await ingestPhoto(
    ctx,
    {
      sessionId: input.sessionId,
      blob: input.blob,
      origin: BACKING_CARD_ORIGIN,
      originalFilename: input.originalFilename,
      clientLocal: input.clientLocal,
      clientOffset: input.clientOffset,
      capture: null,
      categorization: emptyCategorization(),
    },
    imageTools,
  );

  const backing: BackingSheet = { kind: 'coloured', source: 'card', cardPhotoId: photo.id, colour };
  await setSessionBacking(ctx, input.sessionId, { backingMode: session.backingMode, backing });

  const previous = session.backing?.cardPhotoId ?? null;
  if (previous !== null && previous !== photo.id) await deletePhoto(ctx, previous);

  return { photo, colour };
}
