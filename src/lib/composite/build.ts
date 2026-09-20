// rendering-composite.md §5-§6. `buildComposite` (select slots, render, rasterise, store, prune to 3),
// `loadArtifact` and `latestArtifact` (re-verify sha256 before ever handing bytes to share code).

import { BIATHLON_50M } from '@/lib/defaults/biathlon';
import type { TargetAnalysis } from '@/lib/domain/analysis';
import { isCategorizationComplete } from '@/lib/domain/categorization';
import type { TargetPhoto } from '@/lib/domain/photo';
import type { ArtifactMeta } from '@/lib/domain/session';
import { emitPipelineChanged } from '@/lib/pipeline/events';
import type { RenderTools } from '@/lib/render/rasterize-browser';
import { analyzeTarget } from '@/lib/scoring/analyze';
import type { ServiceContext } from '@/lib/services/context';
import { SessionNotFoundError } from '@/lib/services/sessions';
import { getAnalysisRecord } from '@/lib/store/analyses-repo';
import { artifactJsonKey, artifactPngKey, artifactPrefix } from '@/lib/store/blob-keys';
import { deleteByPrefix, getBlob, putBlob } from '@/lib/store/blobs-repo';
import { listPhotosBySession } from '@/lib/store/photos-repo';
import { getSessionRecord, putSessionRecord } from '@/lib/store/sessions-repo';
import type { ScoringRule } from '@/lib/domain/settings';
import { scoringDiameterFromSettings, scoringHoleDiameterMm } from '@/lib/scoring/rule';
import { getSettings } from '@/lib/store/settings-repo';

import { ArtifactNotFoundError, EmptyCompositeError, type CompositeArtifact } from './artifact';
import { selectDefaultSlots, type SlotIds } from './select-defaults';
import { COMPOSITE_RENDERER_VERSION, renderComposite, type CompositeInput, type SlotData } from '@/lib/render/composite';

const WIDTH_PX = 1440;
const KEEP_ARTIFACTS = 3;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** "2026-09-05 17:20", the device's local wall-clock time (§5 `generatedAtLocal`). */
function formatGeneratedAtLocal(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function candidateCount(photos: TargetPhoto[], analyses: Map<string, TargetAnalysis>, template: 'sighting' | 'precision'): number {
  return photos.filter(
    (p) => p.status === 'analyzed' && p.categorization.template === template && (analyses.get(p.id)?.computed ?? null) !== null,
  ).length;
}

/**
 * §6 step 2: "Run `analyzeTarget` per slot" — a fresh call against the *current* profile (current
 * `holeDiameterMm`), not the stored `analysis.computed.result` from that photo's own Stage B run.
 * Settings can change between Stage B and a later composite rebuild, and the composite's stat cards
 * and footer text (`sightingFooterLines`/`precisionFooterLines`) are always built from the current
 * `holeDiameterMm` too, so reusing a stale stored result could show two different hit/miss counts for
 * the same target in one image. Recomputing here keeps both in agreement.
 */
function toSlotData(
  id: string | null,
  photoById: Map<string, TargetPhoto>,
  analyses: Map<string, TargetAnalysis>,
  profiles: Record<ScoringRule, typeof BIATHLON_50M>,
  rule: ScoringRule,
): SlotData | null {
  if (id === null) return null;
  const photo = photoById.get(id);
  const analysis = analyses.get(id);
  if (photo === undefined || analysis === undefined || analysis.computed === null) return null;
  const categorization = photo.categorization;
  if (!isCategorizationComplete(categorization)) return null;
  const score = (r: ScoringRule) =>
    analyzeTarget({ template: categorization.template!, categorization, shots: analysis.shots, profile: profiles[r] });
  // REV-59: the same shots under every rule, for the band's comparison; `result` is the rule in force.
  const byRule = { gauge: score('gauge'), centre: score('centre'), visible: score('visible') };
  return { photo, analysis, result: byRule[rule], byRule };
}

/**
 * rendering-composite.md §6. Selects slots, renders and rasterises the SVG, hashes the PNG, and stores
 * it in one transaction, pruning to the newest 3 artifacts. Everything but the IDB writes happens
 * before the transaction (data-model §6).
 */
/** `release` is the running build's git short SHA (`BUILD_SHA`), printed in the image's footer (REV-69). */
export async function buildComposite(
  ctx: ServiceContext,
  sessionId: string,
  render: RenderTools,
  release = 'dev',
): Promise<CompositeArtifact> {
  const session = await getSessionRecord(ctx.db, sessionId);
  if (session === null) throw new SessionNotFoundError(sessionId);

  const photos = await listPhotosBySession(ctx.db, sessionId);
  const analysisEntries = await Promise.all(photos.map(async (p) => [p.id, await getAnalysisRecord(ctx.db, p.id)] as const));
  const analyses = new Map(
    analysisEntries.filter((entry): entry is [string, TargetAnalysis] => entry[1] !== null),
  );

  const slotIds: SlotIds = selectDefaultSlots(photos, analyses);
  const anySighting = slotIds.sighting.some((id) => id !== null);
  const anyPrecision = slotIds.precision.some((id) => id !== null);
  if (!anySighting && !anyPrecision) throw new EmptyCompositeError(sessionId);

  const settings = await getSettings(ctx.db);
  // REV-56: the summary is scored and drawn under the owner's scoring rule, like Stage B.
  const holeDiameterMm = scoringDiameterFromSettings(settings);
  // `BIATHLON_50M` is `as const`; overriding one field widens the type away from the literal profile
  // `analyzeTarget` accepts, so the assertion restores it (same pattern as `runStageB`).
  const profileFor = (rule: ScoringRule) =>
    ({
      ...BIATHLON_50M,
      holeDiameterMm: scoringHoleDiameterMm(rule, settings.profileOverrides.holeDiameterMm, settings.visibleHoleDiameterMm),
    }) as typeof BIATHLON_50M;
  // REV-59: every slot is scored under all three rules, so the band can show where they differ.
  const profiles = { gauge: profileFor('gauge'), centre: profileFor('centre'), visible: profileFor('visible') };
  const rule = settings.scoringRule;

  const photoById = new Map(photos.map((p) => [p.id, p]));
  const slots = {
    sighting: [
      toSlotData(slotIds.sighting[0], photoById, analyses, profiles, rule),
      toSlotData(slotIds.sighting[1], photoById, analyses, profiles, rule),
    ] as [SlotData | null, SlotData | null],
    precision: [
      toSlotData(slotIds.precision[0], photoById, analyses, profiles, rule),
      toSlotData(slotIds.precision[1], photoById, analyses, profiles, rule),
    ] as [SlotData | null, SlotData | null],
  };

  const filledSighting = slotIds.sighting.filter((id) => id !== null).length;
  const filledPrecision = slotIds.precision.filter((id) => id !== null).length;
  const moreCount =
    Math.max(0, candidateCount(photos, analyses, 'sighting') - filledSighting) +
    Math.max(0, candidateCount(photos, analyses, 'precision') - filledPrecision);

  const now = ctx.now();
  const nowIso = now.toISOString();
  const input: CompositeInput = {
    session,
    slots,
    generatedAtLocal: formatGeneratedAtLocal(now),
    release,
    holeDiameterMm,
    scoring: { rule, visibleHoleDiameterMm: settings.visibleHoleDiameterMm },
    moreCount,
  };

  // §5 (REV-51): the height depends on the count and on the band's content, so take it from the render.
  const { svg, height: heightPx } = renderComposite(input);
  const png = await render.svgToPng(svg, WIDTH_PX, heightPx);
  const pngBuffer = await png.arrayBuffer();
  const sha256 = await sha256Hex(pngBuffer);

  const id = ctx.newId();
  const filledSlots = [...slots.sighting, ...slots.precision].filter((s): s is SlotData => s !== null);
  // §6: "carries no image data and no GPS" — restated from `photo.lighting`, not the full `TargetPhoto`
  // (whose `exif.gps` field it must never carry, even indirectly).
  const lightingLabels = new Set(filledSlots.map((s) => s.photo.lighting));
  const jsonSidecar = {
    sessionId,
    createdAt: nowIso,
    slots: slotIds,
    perSlot: filledSlots.map((s) => ({ photoId: s.photo.id, template: s.result.template, position: s.result.position, result: s.result })),
    lightingSummary: lightingLabels.size === 1 ? [...lightingLabels][0]! : 'mixed',
  };

  const jsonBytes = new TextEncoder().encode(JSON.stringify(jsonSidecar));
  const jsonBuffer = jsonBytes.buffer.slice(jsonBytes.byteOffset, jsonBytes.byteOffset + jsonBytes.byteLength) as ArrayBuffer;

  const meta: ArtifactMeta = { id, sha256, widthPx: WIDTH_PX, heightPx, createdAt: nowIso, rendererVersion: COMPOSITE_RENDERER_VERSION, scoringRule: rule };
  const pngContentType = png.type === '' ? 'image/png' : png.type;

  const tx = ctx.db.transaction(['sessions', 'blobs'], 'readwrite');
  const currentSession = await getSessionRecord(tx, sessionId);
  if (currentSession === null) {
    await tx.done;
    throw new SessionNotFoundError(sessionId);
  }

  await putBlob(tx, artifactPngKey(id), { bytes: pngBuffer, contentType: pngContentType, sizeBytes: pngBuffer.byteLength, createdAt: nowIso });
  await putBlob(tx, artifactJsonKey(id), {
    bytes: jsonBuffer,
    contentType: 'application/json',
    sizeBytes: jsonBuffer.byteLength,
    createdAt: nowIso,
  });

  const artifacts = [...currentSession.artifacts, meta];
  const overflow = Math.max(0, artifacts.length - KEEP_ARTIFACTS);
  const pruned = artifacts.slice(overflow);
  const removed = artifacts.slice(0, overflow);
  for (const stale of removed) await deleteByPrefix(tx, artifactPrefix(stale.id));

  await putSessionRecord(tx, { ...currentSession, artifacts: pruned, updatedAt: nowIso });
  await tx.done;

  emitPipelineChanged({ sessionId });

  // Brand applied only here (rendering-composite.md §6).
  return { ...meta, sessionId } as CompositeArtifact;
}

async function loadArtifactByMeta(ctx: ServiceContext, sessionId: string, meta: ArtifactMeta): Promise<{ artifact: CompositeArtifact; png: Blob }> {
  const png = await getBlob(ctx.db, artifactPngKey(meta.id));
  if (png === null) throw new ArtifactNotFoundError(sessionId, meta.id);
  const bytes = await png.arrayBuffer();
  const sha256 = await sha256Hex(bytes);
  if (sha256 !== meta.sha256) throw new ArtifactNotFoundError(sessionId, meta.id);
  const artifact = { ...meta, sessionId } as CompositeArtifact;
  return { artifact, png: new Blob([bytes], { type: png.type }) };
}

/** §6: re-verifies sha256; a mismatch or unknown id throws `ArtifactNotFoundError`. */
export async function loadArtifact(ctx: ServiceContext, sessionId: string, artifactId: string): Promise<{ artifact: CompositeArtifact; png: Blob }> {
  const session = await getSessionRecord(ctx.db, sessionId);
  if (session === null) throw new SessionNotFoundError(sessionId);
  const meta = session.artifacts.find((a) => a.id === artifactId);
  if (meta === undefined) throw new ArtifactNotFoundError(sessionId, artifactId);
  return loadArtifactByMeta(ctx, sessionId, meta);
}

/** The newest stored artifact (`session.artifacts` is newest-last), or `null` when none exists yet. */
export async function latestArtifact(ctx: ServiceContext, sessionId: string): Promise<{ artifact: CompositeArtifact; png: Blob } | null> {
  const session = await getSessionRecord(ctx.db, sessionId);
  if (session === null || session.artifacts.length === 0) return null;
  const meta = session.artifacts[session.artifacts.length - 1]!;
  return loadArtifactByMeta(ctx, sessionId, meta);
}
