// REV-163: what the three coach images share — the Analysis one (analysis.md §5), the Patterns one (patterns.md §7) and the
// Goals one (goals.md §9). Each is stored as `<prefix><id>:png` with a `:json` sidecar, the newest three of each kind are
// kept, and the result is a `TrendsArtifact`: with the session summary, the only images the share rule lets leave the
// phone, and only on the owner's tap. They carry derived numbers and drawings, never a photo, and no GPS.
//
// Everything but the IndexedDB writes happens before the transaction (data-model §6).

import type { PatternRange } from '@/lib/patterns/collect';
import { makeStamp } from '@/lib/provenance/stamp';
import type { ServiceContext } from '@/lib/services/context';
import { loadProvenanceKey } from '@/lib/services/provenance';
import { COACH_KEY_PREFIX, coachJsonKey, coachPngKey, coachPrefix, type CoachImageKind } from '@/lib/store/blob-keys';
import { deleteByPrefix, getBlob, putBlob } from '@/lib/store/blobs-repo';
import { getSettings } from '@/lib/store/settings-repo';

export type { CoachImageKind } from '@/lib/store/blob-keys';

declare const trendsBrand: unique symbol;

/** A stored coach image of any kind. The brand is applied only in this file, so a plain object can never be shared by accident. */
export interface TrendsArtifact {
  readonly [trendsBrand]: true;
  kind: CoachImageKind;
  id: string;
  widthPx: number;
  heightPx: number;
  sha256: string;
  createdAt: string;
  /** The screen's range; null for the Goals image, which has none. */
  range: PatternRange | null;
  rendererVersion: number;
}

/** The newest this many coach images of each kind are kept; older ones are deleted when a new one is stored. */
export const KEEP_COACH_IMAGES = 3;

/** Nothing on the screen to draw (no shots, or no goal set). */
export class EmptyCoachImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmptyCoachImageError';
  }
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** The header's "generated" time, in the phone's own time zone. */
export function localStamp(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function toBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** REV-100: the footer's athlete line, and the stamp over `payloadOf()` when a key is set. Read before any transaction. */
export async function coachProvenance(
  ctx: ServiceContext,
  payloadOf: (athlete: { name: string; club: string }) => string,
): Promise<{ provenance?: { name: string; club: string; stamp: string | null }; stamped: { payload: string; stamp: string } | null }> {
  const settings = await getSettings(ctx.db);
  const athlete = { name: settings.athleteName, club: settings.athleteClub };
  const key = await loadProvenanceKey(ctx);
  if (key !== null) {
    const payload = payloadOf(athlete);
    const stamped = { payload, stamp: await makeStamp(key, payload) };
    return { provenance: { ...athlete, stamp: stamped.stamp }, stamped };
  }
  if (athlete.name !== '' || athlete.club !== '') return { provenance: { ...athlete, stamp: null }, stamped: null };
  return { stamped: null };
}

/** The stored images' ids of one kind, newest first, read from their sidecars (before any transaction). */
async function storedIds(ctx: ServiceContext, kind: CoachImageKind): Promise<string[]> {
  const prefix = COACH_KEY_PREFIX[kind];
  const keys = (await ctx.db.getAllKeys('blobs', IDBKeyRange.bound(prefix, `${prefix}￿`))) as string[];
  const found: Array<{ id: string; createdAt: string }> = [];
  for (const key of keys) {
    if (!key.endsWith(':json')) continue;
    const id = key.slice(prefix.length, -':json'.length);
    const blob = await getBlob(ctx.db, key);
    let createdAt = '';
    try {
      createdAt = (JSON.parse(await blob!.text()) as { createdAt?: string }).createdAt ?? '';
    } catch {
      // An unreadable sidecar sorts oldest, so it is the first pruned.
    }
    found.push({ id, createdAt });
  }
  return found.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((f) => f.id);
}

export interface CoachImageToStore {
  kind: CoachImageKind;
  png: Blob;
  widthPx: number;
  heightPx: number;
  createdAt: string;
  range: PatternRange | null;
  rendererVersion: number;
  /** What the sidecar records besides the time, renderer version and hash: the filters, counts and stamp. No image data, no GPS. */
  sidecar: Record<string, unknown>;
}

/** Stores the PNG and its sidecar, prunes that kind to the newest three, and returns the artifact with its PNG. */
export async function storeCoachImage(ctx: ServiceContext, image: CoachImageToStore): Promise<{ artifact: TrendsArtifact; png: Blob }> {
  const pngBuffer = await image.png.arrayBuffer();
  const sha256 = await sha256Hex(pngBuffer);
  const id = ctx.newId();
  const sidecar = { createdAt: image.createdAt, ...image.sidecar, rendererVersion: image.rendererVersion, sha256 };
  const jsonBuffer = toBuffer(new TextEncoder().encode(JSON.stringify(sidecar)));
  const stale = (await storedIds(ctx, image.kind)).slice(KEEP_COACH_IMAGES - 1);

  const tx = ctx.db.transaction('blobs', 'readwrite');
  await putBlob(tx, coachPngKey(image.kind, id), { bytes: pngBuffer, contentType: 'image/png', sizeBytes: pngBuffer.byteLength, createdAt: image.createdAt });
  await putBlob(tx, coachJsonKey(image.kind, id), { bytes: jsonBuffer, contentType: 'application/json', sizeBytes: jsonBuffer.byteLength, createdAt: image.createdAt });
  for (const old of stale) await deleteByPrefix(tx, coachPrefix(image.kind, old));
  await tx.done;

  const artifact = {
    kind: image.kind,
    id,
    widthPx: image.widthPx,
    heightPx: image.heightPx,
    sha256,
    createdAt: image.createdAt,
    range: image.range,
    rendererVersion: image.rendererVersion,
  } as TrendsArtifact;
  return { artifact, png: new Blob([pngBuffer], { type: 'image/png' }) };
}
