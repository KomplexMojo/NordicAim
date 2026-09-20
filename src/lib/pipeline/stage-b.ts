// analysis-pipeline §2 (B1-B5), §4, §5. Stage B for one photo: combine the user's metadata with the
// detected shots, score the target, render its diagrams, and record the status the result implies.

import { BIATHLON_50M } from '@/lib/defaults/biathlon';
import type { Shot, TargetAnalysis } from '@/lib/domain/analysis';
import { isCategorizationComplete } from '@/lib/domain/categorization';
import type { Position, Warning } from '@/lib/domain/enums';
import type { Categorization } from '@/lib/domain/photo';
import { photoStatus } from '@/lib/domain/status';
import { emitPipelineChanged } from '@/lib/pipeline/events';
import { summaryHooks } from '@/lib/pipeline/hooks';
import { renderDiagramSvg, type DiagramInput } from '@/lib/render/diagram';
import type { RenderTools } from '@/lib/render/rasterize-browser';
import { ENGINE_VERSION, analyzeTarget } from '@/lib/scoring/analyze';
import { mergeReconcileWarnings, reconcileShots } from '@/lib/scoring/reconcile-shots';
import type { ServiceContext } from '@/lib/services/context';
import { AnalysisNotFoundError, PhotoNotFoundError } from '@/lib/services/photos';
import { getAnalysisRecord, putAnalysisRecord } from '@/lib/store/analyses-repo';
import { diagramCellSvgKey, diagramFullPngKey, diagramFullSvgKey, diagramPrefix } from '@/lib/store/blob-keys';
import { deleteByPrefix, putBlob } from '@/lib/store/blobs-repo';
import type { StoredBlob } from '@/lib/store/db';
import { getPhotoRecord, listPhotosBySession, putPhotoRecord } from '@/lib/store/photos-repo';
import { sightingRoles } from '@/lib/domain/sighting-role';
import { getSessionRecord, putSessionRecord } from '@/lib/store/sessions-repo';
import { scoringDiameterFromSettings } from '@/lib/scoring/rule';
import { getSettings } from '@/lib/store/settings-repo';

/** rendering-composite §3: the `full` diagram variant is 1500 × 1700 for both templates. */
const FULL_SIZE = { widthPx: 1500, heightPx: 1700 } as const;

/** rendering-composite §3 item 3 / `DiagramInput.positionLabel`. */
export function positionLabel(position: Position): string {
  if (position === 'prone') return 'Prone';
  if (position === 'standing') return 'Standing';
  return 'Prone + standing';
}

/**
 * analysis-pipeline §2 (B4): Stage A's warnings are kept as they are, and `template-mismatch` is
 * Stage B's own — it is (re)decided here from the hint A3 recorded against the template the user
 * finally chose, so changing the template on the metadata screen clears it again.
 */
export function stageBWarnings(analysis: TargetAnalysis, categorization: Categorization): Warning[] {
  const kept = analysis.pipeline.warnings.filter((w) => w !== 'template-mismatch');
  const hint = analysis.pipeline.templateHint;
  const mismatch = hint !== null && hint.template !== categorization.template && hint.confidence >= 0.5;
  return mismatch ? [...kept, 'template-mismatch'] : kept;
}

/** Whether reconciliation left the stored shots exactly as they were. */
function sameShots(a: Shot[], b: Shot[]): boolean {
  return a.length === b.length && a.every((shot, i) => JSON.stringify(shot) === JSON.stringify(b[i]));
}

/** One transaction: save the mutated analysis and the photo status it implies (data-model §7). */
async function commitAnalysis(
  ctx: ServiceContext,
  photoId: string,
  mutate: (analysis: TargetAnalysis) => TargetAnalysis,
): Promise<void> {
  const nowIso = ctx.now().toISOString();
  const tx = ctx.db.transaction(['photos', 'analyses'], 'readwrite');
  const photo = await getPhotoRecord(tx, photoId);
  const analysis = await getAnalysisRecord(tx, photoId);
  if (photo === null || analysis === null) {
    await tx.done;
    throw photo === null ? new PhotoNotFoundError(photoId) : new AnalysisNotFoundError(photoId);
  }

  const next: TargetAnalysis = { ...mutate(analysis), updatedAt: nowIso };
  const { status, reasons } = photoStatus({
    categorization: photo.categorization,
    analysis: next,
    result: next.computed?.result ?? null,
  });

  await putAnalysisRecord(tx, next);
  await putPhotoRecord(tx, { ...photo, status, reasons });
  await tx.done;
}

interface Diagrams {
  fullSvg: string;
  cellSvg: string;
  fullPng: ArrayBuffer;
  fullPngType: string;
}

/** B3: both SVG variants plus the rasterised `full-png`. Everything here happens before the transaction. */
async function renderDiagrams(input: DiagramInput, renderTools: RenderTools): Promise<Diagrams> {
  const fullSvg = renderDiagramSvg(input, 'full');
  const cellSvg = renderDiagramSvg(input, 'cell');
  const png = await renderTools.svgToPng(fullSvg, FULL_SIZE.widthPx, FULL_SIZE.heightPx);
  const fullPng = await png.arrayBuffer();
  return { fullSvg, cellSvg, fullPng, fullPngType: png.type === '' ? 'image/png' : png.type };
}

function svgRecord(svg: string, nowIso: string): StoredBlob {
  const bytes = new TextEncoder().encode(svg);
  // A fresh ArrayBuffer, so the stored bytes never alias a larger pooled buffer.
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return { bytes: buffer, contentType: 'image/svg+xml', sizeBytes: buffer.byteLength, createdAt: nowIso };
}

/**
 * analysis-pipeline §2 (Stage B) and §5. Scores one photo, renders its diagrams and records the
 * outcome in one transaction. Never throws for a scoring or render failure: it records
 * `stageB: 'error'` instead, so the runner does not retry in a loop.
 */
export async function runStageB(ctx: ServiceContext, photoId: string, renderTools: RenderTools): Promise<void> {
  const photo = await getPhotoRecord(ctx.db, photoId);
  if (photo === null) throw new PhotoNotFoundError(photoId);
  const analysis = await getAnalysisRecord(ctx.db, photoId);
  if (analysis === null) throw new AnalysisNotFoundError(photoId);

  // Step 1: B1 needs the user's metadata. Without it the photo stays `needs-metadata` and Stage B
  // stays `pending` (the planner does not schedule it either, analysis-pipeline §5).
  if (!isCategorizationComplete(photo.categorization)) return;

  await commitAnalysis(ctx, photoId, (a) => ({
    ...a,
    pipeline: { ...a.pipeline, stageB: 'running', error: null },
  }));
  emitPipelineChanged({ sessionId: photo.sessionId, photoId });

  try {
    const settings = await getSettings(ctx.db);
    // REV-56: scoring, the touch-credit ring and the sighting footer all follow the owner's scoring rule;
    // detection never does (it looks for the physical hole).
    const holeDiameterMm = scoringDiameterFromSettings(settings);
    // `BIATHLON_50M` is declared `as const`, so overriding one field widens it away from the literal
    // profile type `analyzeTarget` accepts; the assertion restores it (data-model §5 override).
    const profile = { ...BIATHLON_50M, holeDiameterMm } as typeof BIATHLON_50M;

    const categorization = photo.categorization;
    const template = categorization.template!;
    const position = categorization.position!;

    // REV-39 (M20): the declared rounds are fact. Reconcile the stored shots against them now that
    // they are known for certain — reject, cap, infer double punches, count misses — so nothing is
    // scored or drawn that breaks the rule (a 10-round precision target cannot score above 100).
    // With no calibration nothing was detected and nothing is scored, so there is nothing to reconcile.
    const reconciled =
      analysis.calibration === null
        ? null
        : reconcileShots({ shots: analysis.shots, categorization, method: analysis.pipeline.detection.method });
    const shots = reconciled?.shots ?? analysis.shots;
    const rejected = reconciled !== null && reconciled.rejected.length > 0;
    const shotsChanged = !sameShots(shots, analysis.shots);

    // B2: scoring only means something once the target has been located on the sheet, and a rejected
    // target (too many holes for the declared rounds) carries no score at all.
    const result =
      analysis.calibration === null || rejected ? null : analyzeTarget({ template, categorization, shots, profile });

    // B4 (warnings half; the status itself is computed inside the transaction below).
    const warnings = mergeReconcileWarnings(stageBWarnings(analysis, categorization), reconciled ?? { warnings: [] });

    // REV-79 / REV-83: a sighting target's symbol is its chosen role, or, for a target saved before roles were chosen, the role its
    // order in the session gives (`sightingRoles`), so old and new targets are drawn alike without rewriting stored data.
    const sightingRole =
      template !== 'sighting'
        ? null
        : (categorization.sightingRole ?? sightingRoles(await listPhotosBySession(ctx.db, photo.sessionId)).get(photo.id) ?? null);

    // B3: rasterise before the transaction (data-model §6).
    const diagrams =
      result === null
        ? null
        : await renderDiagrams(
            {
              template,
              result,
              shots,
              positionLabel: positionLabel(position),
              captureLocal: photo.captureTime.local,
              lighting: photo.lighting,
              holeDiameterMm,
              ...(sightingRole !== null ? { sightingRole } : {}),
              ...(template === 'precision' ? { scoringRule: settings.scoringRule } : {}),
              ...(template === 'precision' && (position === 'prone' || position === 'standing') ? { position } : {}),
              ...(analysis.pipeline.detection.backingColour ? { shotColour: analysis.pipeline.detection.backingColour } : {}),
            },
            renderTools,
          );

    const nowIso = ctx.now().toISOString();
    const tx = ctx.db.transaction(['sessions', 'photos', 'analyses', 'blobs'], 'readwrite');
    const currentPhoto = await getPhotoRecord(tx, photoId);
    const currentAnalysis = await getAnalysisRecord(tx, photoId);
    if (currentPhoto === null || currentAnalysis === null) {
      await tx.done;
      throw currentPhoto === null ? new PhotoNotFoundError(photoId) : new AnalysisNotFoundError(photoId);
    }

    const next: TargetAnalysis = {
      ...currentAnalysis,
      // Only touched when reconciliation changed something (a drop or an inferred round), so a re-run
      // never rewrites shots it did not change (and never renumbers a manual one).
      shots: shotsChanged ? shots : currentAnalysis.shots,
      pipeline: { ...currentAnalysis.pipeline, stageB: 'done', error: null, warnings },
      computed: result === null ? null : { engineVersion: ENGINE_VERSION, result },
      updatedAt: nowIso,
    };
    const { status, reasons } = photoStatus({ categorization: currentPhoto.categorization, analysis: next, result });

    await putAnalysisRecord(tx, next);
    await putPhotoRecord(tx, { ...currentPhoto, status, reasons });

    if (diagrams === null) {
      // No result, so any diagram from an earlier run would now be stale.
      await deleteByPrefix(tx, diagramPrefix(photoId));
    } else {
      await putBlob(tx, diagramFullSvgKey(photoId), svgRecord(diagrams.fullSvg, nowIso));
      await putBlob(tx, diagramCellSvgKey(photoId), svgRecord(diagrams.cellSvg, nowIso));
      await putBlob(tx, diagramFullPngKey(photoId), {
        bytes: diagrams.fullPng,
        contentType: diagrams.fullPngType,
        sizeBytes: diagrams.fullPng.byteLength,
        createdAt: nowIso,
      });
    }

    const session = await getSessionRecord(tx, currentPhoto.sessionId);
    if (session !== null) await putSessionRecord(tx, { ...session, updatedAt: nowIso });
    await tx.done;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await commitAnalysis(ctx, photoId, (a) => ({
      ...a,
      pipeline: { ...a.pipeline, stageB: 'error', error: message.slice(0, 200) },
    }));
    emitPipelineChanged({ sessionId: photo.sessionId, photoId });
    return;
  }

  emitPipelineChanged({ sessionId: photo.sessionId, photoId });
  // B5 (§7): once this photo is settled, ask for the session summary image to be rebuilt.
  summaryHooks.schedule(photo.sessionId);
}
