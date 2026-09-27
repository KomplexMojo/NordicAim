// template-reference.md §3, §4, §7 (M26, REV-121). The user's own reference sheets: make one from a photo, store it,
// restore the shipped default, and send that template's unedited photos back through Stage A when the sheet changes.
//
// Nothing here changes detection yet: A5 does not read a reference until §6 is implemented. The re-run of §7 is what
// the spec asks for, so that it is already in place when §6 lands.

import type { TemplateId } from '@/lib/domain/enums';
import type { Calibration } from '@/lib/domain/photo';
import { detectFormat } from '@/lib/media/format';
import type { AppSettings } from '@/lib/domain/settings';
import type { TemplateReference } from '@/lib/domain/template-reference';
import { photoStatus } from '@/lib/domain/status';
import { emitPipelineChanged } from '@/lib/pipeline/events';
import { pipelineHooks } from '@/lib/pipeline/hooks';
import { canRerunStageA } from '@/lib/pipeline/template-change';
import { getAnalysisRecord, putAnalysisRecord } from '@/lib/store/analyses-repo';
import { referenceImageKey } from '@/lib/store/blob-keys';
import { deleteBlob, getBlob, putBlob } from '@/lib/store/blobs-repo';
import type { AppTx } from '@/lib/store/db';
import { listPhotoRecords, putPhotoRecord } from '@/lib/store/photos-repo';
import { getSettings, putSettings } from '@/lib/store/settings-repo';
import type { CvWorkerApi } from '@/workers/cv-client';

import type { ServiceContext } from './context';
import type { ImageTools } from './ingest';

/** §3 step 2 and step 4: the message shown when a photo is refused. Nothing is stored. */
export const REFERENCE_REFUSED_MESSAGE = "The rings weren't found. Photograph the whole target, flat and in good light.";
/** §3 step 5: the warning when A5 finds holes on the result. */
export const REFERENCE_HOLES_MESSAGE = 'This sheet seems to have holes in it. A reference should be a blank sheet.';

export class UnsupportedReferenceImageError extends Error {
  constructor() {
    super('The chosen file is not a JPEG, PNG or HEIC image');
    this.name = 'UnsupportedReferenceImageError';
  }
}

export interface ReferenceTools {
  imageTools: Pick<ImageTools, 'makeWorkingImages'>;
  cv: Pick<CvWorkerApi, 'makeReference'>;
}

/** A reference made and checked, not yet stored (§3: everything is prepared before any transaction). */
export interface PreparedReference {
  template: TemplateId;
  bytes: ArrayBuffer;
  sha256: string;
  widthPx: number;
  heightPx: number;
  calibration: Calibration;
  /** §3 step 5: > 0 means the user must confirm *Use anyway*. */
  holesFound: number;
}

export type PrepareReferenceResult =
  | { status: 'ok'; prepared: PreparedReference }
  | { status: 'refused'; reason: 'no-disc' | 'wrong-template' };

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * §3 steps 1–5. The source photo is never stored: only the result of step 3 is, and only by
 * {@link saveTemplateReference}.
 */
export async function prepareTemplateReference(
  blob: Blob,
  template: TemplateId,
  holeDiameterMm: number,
  tools: ReferenceTools,
): Promise<PrepareReferenceResult> {
  const format = detectFormat(new Uint8Array(await blob.arrayBuffer()));
  if (format === null) throw new UnsupportedReferenceImageError();
  const { working } = await tools.imageTools.makeWorkingImages(blob, format);
  const made = await tools.cv.makeReference(await working.arrayBuffer(), template, holeDiameterMm);
  if (made.status === 'refused') return made;
  return {
    status: 'ok',
    prepared: {
      template,
      bytes: made.jpeg,
      sha256: await sha256Hex(made.jpeg),
      widthPx: made.widthPx,
      heightPx: made.heightPx,
      calibration: made.calibration,
      holesFound: made.holesFound,
    },
  };
}

export interface ReferenceChange {
  settings: AppSettings;
  /** §7: how many photos went back to Stage A. */
  rerun: number;
}

/**
 * §7: every stored photo of `template` whose Stage A finished and that has nothing manual goes back to Stage A (and
 * so Stage B). Runs inside the caller's transaction and only awaits IndexedDB calls.
 */
async function rerunTemplatePhotos(tx: AppTx, template: TemplateId, nowIso: string): Promise<Array<{ sessionId: string; photoId: string }>> {
  const changed: Array<{ sessionId: string; photoId: string }> = [];
  for (const photo of await listPhotoRecords(tx)) {
    if (photo.categorization.template !== template) continue;
    const analysis = await getAnalysisRecord(tx, photo.id);
    if (analysis === null || !canRerunStageA(analysis)) continue;
    const next = { ...analysis, pipeline: { ...analysis.pipeline, stageA: 'pending' as const, stageB: 'pending' as const }, updatedAt: nowIso };
    const { status, reasons } = photoStatus({ categorization: photo.categorization, analysis: next, result: next.computed?.result ?? null });
    await putAnalysisRecord(tx, next);
    await putPhotoRecord(tx, { ...photo, status, reasons });
    changed.push({ sessionId: photo.sessionId, photoId: photo.id });
  }
  return changed;
}

async function changeReference(
  ctx: ServiceContext,
  template: TemplateId,
  write: (tx: AppTx) => Promise<TemplateReference | null>,
): Promise<ReferenceChange> {
  const nowIso = ctx.now().toISOString();
  const tx = ctx.db.transaction(['settings', 'blobs', 'photos', 'analyses'], 'readwrite');
  const settings = await getSettings(tx);
  const reference = await write(tx);
  const next: AppSettings = { ...settings, templateReferences: { ...settings.templateReferences, [template]: reference } };
  await putSettings(tx, next);
  const changed = await rerunTemplatePhotos(tx, template, nowIso);
  await tx.done;
  for (const c of changed) emitPipelineChanged(c);
  if (changed.length > 0) pipelineHooks.notify();
  return { settings: next, rerun: changed.length };
}

/** §4: stores the image and its settings entry in one transaction, then §7. */
export function saveTemplateReference(ctx: ServiceContext, prepared: PreparedReference): Promise<ReferenceChange> {
  const capturedAt = ctx.now().toISOString();
  const record = { bytes: prepared.bytes, contentType: 'image/jpeg', sizeBytes: prepared.bytes.byteLength, createdAt: capturedAt };
  return changeReference(ctx, prepared.template, async (tx) => {
    await putBlob(tx, referenceImageKey(prepared.template), record);
    return {
      template: prepared.template,
      capturedAt,
      sha256: prepared.sha256,
      widthPx: prepared.widthPx,
      heightPx: prepared.heightPx,
      calibration: prepared.calibration,
    };
  });
}

/** §2 **Restore default**: deletes the custom image and its entry in one transaction, then §7. */
export function restoreDefaultReference(ctx: ServiceContext, template: TemplateId): Promise<ReferenceChange> {
  return changeReference(ctx, template, async (tx) => {
    await deleteBlob(tx, referenceImageKey(template));
    return null;
  });
}

/** The custom reference image for a template, or null when the shipped default is in use. */
export function getCustomReferenceImage(ctx: ServiceContext, template: TemplateId): Promise<Blob | null> {
  return getBlob(ctx.db, referenceImageKey(template));
}
