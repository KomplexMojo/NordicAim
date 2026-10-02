// analysis.md §5 (REV-124, issue #57): the coach image as a stored artifact. It is the only other image, besides the session
// summary (`CompositeArtifact`), that the share rule lets leave the phone, and only on the owner's tap. It carries derived
// numbers and the Patterns drawings, never a photo, and no GPS.
//
// Everything but the IndexedDB writes happens before the transaction (data-model §6).

import { coachTrends } from '@/lib/analysis/coach';
import { PATTERN_RANGE_LABEL, PATTERN_VIEWS, filterByRange, type PatternRange, type PatternView } from '@/lib/patterns/collect';
import { summarizePatterns } from '@/lib/patterns/summarize';
import { buildTrendsPayload } from '@/lib/provenance/payload-trends';
import { makeStamp } from '@/lib/provenance/stamp';
import { patternsSizeFactor } from '@/lib/render/patterns';
import type { RenderTools } from '@/lib/render/rasterize-browser';
import { renderTrendsSheet, TRENDS_RENDERER_VERSION, type TrendsSheetInput } from '@/lib/render/trends-sheet';
import type { ServiceContext } from '@/lib/services/context';
import { loadPatterns } from '@/lib/services/patterns';
import { loadProvenanceKey } from '@/lib/services/provenance';
import { TRENDS_KEY_PREFIX, trendsJsonKey, trendsPngKey, trendsPrefix } from '@/lib/store/blob-keys';
import { deleteByPrefix, getBlob, putBlob } from '@/lib/store/blobs-repo';
import { getSettings } from '@/lib/store/settings-repo';

declare const trendsBrand: unique symbol;

/** A stored coach image. The brand is applied only in this file, so a plain object can never be shared by accident. */
export interface TrendsArtifact {
  readonly [trendsBrand]: true;
  id: string;
  widthPx: number;
  heightPx: number;
  sha256: string;
  createdAt: string;
  range: PatternRange;
  rendererVersion: number;
}

export class EmptyTrendsError extends Error {
  constructor() {
    super('No shots in this range to make a trends image from');
    this.name = 'EmptyTrendsError';
  }
}

/** The newest this many coach images are kept; older ones are deleted when a new one is stored. */
export const KEEP_TRENDS_IMAGES = 3;

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function localStamp(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function toBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** The stored coach images' ids, newest first, read from their sidecars (before any transaction). */
async function storedTrendsIds(ctx: ServiceContext): Promise<string[]> {
  const keys = (await ctx.db.getAllKeys('blobs', IDBKeyRange.bound(TRENDS_KEY_PREFIX, `${TRENDS_KEY_PREFIX}￿`))) as string[];
  const found: Array<{ id: string; createdAt: string }> = [];
  for (const key of keys) {
    if (!key.endsWith(':json')) continue;
    const id = key.slice(TRENDS_KEY_PREFIX.length, -':json'.length);
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

/**
 * §5: renders the coach image for the Analysis screen's range, stores it, prunes to the newest three, and returns it with
 * its PNG, ready for `shareArtifact`. Throws `EmptyTrendsError` when the range has no shots in any view.
 */
export async function buildTrendsImage(
  ctx: ServiceContext,
  range: PatternRange,
  render: RenderTools,
  release = 'dev',
): Promise<{ artifact: TrendsArtifact; png: Blob }> {
  const loaded = await loadPatterns(ctx);
  const byView = Object.fromEntries(PATTERN_VIEWS.map((v) => [v, filterByRange(loaded.data.points[v], range)])) as Record<
    PatternView,
    ReturnType<typeof filterByRange>
  >;
  if (PATTERN_VIEWS.every((v) => byView[v].length === 0)) throw new EmptyTrendsError();

  const kindOf = (v: PatternView) => (v.startsWith('precision') ? ('precision' as const) : ('sighting' as const));
  const views = Object.fromEntries(PATTERN_VIEWS.map((v) => [v, { points: byView[v], summary: summarizePatterns(byView[v], kindOf(v)) }])) as TrendsSheetInput['views'];
  // The same size as the Patterns screen: worked out from every recorded shot, not the range.
  const factor = patternsSizeFactor(PATTERN_VIEWS.map((v) => ({ kind: kindOf(v), points: loaded.data.points[v] })));
  const trends = coachTrends(byView);

  const now = ctx.now();
  const createdAt = now.toISOString();
  const rangeLabel = PATTERN_RANGE_LABEL[range];
  const settings = await getSettings(ctx.db);
  const key = await loadProvenanceKey(ctx);
  let provenance: TrendsSheetInput['provenance'];
  let stamped: { payload: string; stamp: string } | null = null;
  if (key !== null) {
    const payload = buildTrendsPayload({ name: settings.athleteName, club: settings.athleteClub, rangeLabel, release, createdAt, trends });
    stamped = { payload, stamp: await makeStamp(key, payload) };
    provenance = { name: settings.athleteName, club: settings.athleteClub, stamp: stamped.stamp };
  } else if (settings.athleteName !== '' || settings.athleteClub !== '') {
    provenance = { name: settings.athleteName, club: settings.athleteClub, stamp: null };
  }

  const { svg, width, height } = renderTrendsSheet({
    rangeLabel,
    views,
    factor,
    trends,
    release,
    generatedAtLocal: localStamp(now),
    ...(provenance === undefined ? {} : { provenance }),
  });
  const png = await render.svgToPng(svg, width, height);
  const pngBuffer = await png.arrayBuffer();
  const sha256 = await sha256Hex(pngBuffer);
  const id = ctx.newId();
  // No image data and no GPS: the range, the session count and what the stamp covers.
  const sidecar = { createdAt, range, rangeLabel, sessions: trends.sessions.length, rendererVersion: TRENDS_RENDERER_VERSION, sha256, ...(stamped === null ? {} : { provenance: stamped }) };
  const jsonBuffer = toBuffer(new TextEncoder().encode(JSON.stringify(sidecar)));
  const stale = (await storedTrendsIds(ctx)).slice(KEEP_TRENDS_IMAGES - 1);

  const tx = ctx.db.transaction('blobs', 'readwrite');
  await putBlob(tx, trendsPngKey(id), { bytes: pngBuffer, contentType: 'image/png', sizeBytes: pngBuffer.byteLength, createdAt });
  await putBlob(tx, trendsJsonKey(id), { bytes: jsonBuffer, contentType: 'application/json', sizeBytes: jsonBuffer.byteLength, createdAt });
  for (const old of stale) await deleteByPrefix(tx, trendsPrefix(old));
  await tx.done;

  const artifact = { id, widthPx: width, heightPx: height, sha256, createdAt, range, rendererVersion: TRENDS_RENDERER_VERSION } as TrendsArtifact;
  return { artifact, png: new Blob([pngBuffer], { type: 'image/png' }) };
}
