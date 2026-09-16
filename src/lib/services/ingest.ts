import type { PhotoOrigin } from '@/lib/domain/enums';
import { initialAnalysis } from '@/lib/domain/analysis';
import type { CaptureInfo, Categorization, TargetPhoto } from '@/lib/domain/photo';
import { photoStatus } from '@/lib/domain/status';
import { detectFormat, type ImageFormat, type RgbaImage } from '@/lib/media/format';
import { resolveCaptureTime } from '@/lib/media/capture-time';
import { readExif } from '@/lib/media/exif';
import { computeImageStats } from '@/lib/media/image-stats';
import { estimateBrightnessValue, suggestLighting } from '@/lib/media/lighting';
import { photoOriginalKey, photoThumbKey, photoWorkingKey } from '@/lib/store/blob-keys';
import { putBlob } from '@/lib/store/blobs-repo';
import { putAnalysisRecord } from '@/lib/store/analyses-repo';
import { putPhotoRecord } from '@/lib/store/photos-repo';
import { getSessionRecord, putSessionRecord } from '@/lib/store/sessions-repo';
import type { StoredBlob } from '@/lib/store/db';
import { pipelineHooks } from '@/lib/pipeline/hooks';

import type { ServiceContext } from './context';
import { SessionNotFoundError } from './sessions';

const MAX_ORIGINAL_BYTES = 30 * 1024 * 1024;

export class UnsupportedFormatError extends Error {
  constructor() {
    super('Unsupported image format');
    this.name = 'UnsupportedFormatError';
  }
}

export class TooLargeError extends Error {
  constructor() {
    super(`Image exceeds ${MAX_ORIGINAL_BYTES} bytes`);
    this.name = 'TooLargeError';
  }
}

function contentTypeFor(format: ImageFormat): string {
  if (format === 'jpeg') return 'image/jpeg';
  if (format === 'png') return 'image/png';
  return 'image/heic';
}

export interface ImageTools {
  makeWorkingImages(
    blob: Blob,
    format: ImageFormat,
  ): Promise<{
    working: Blob;
    thumb: Blob;
    originalSize: { widthPx: number; heightPx: number };
    workingSize: { widthPx: number; heightPx: number; scaleFromOriginal: number };
  }>;
  toRgba(blob: Blob, maxLongest: number): Promise<RgbaImage>;
}

export interface IngestPhotoInput {
  sessionId: string;
  blob: Blob;
  origin: PhotoOrigin;
  originalFilename: string | null;
  clientLocal: string;
  clientOffset: string;
  capture: CaptureInfo | null;
  categorization: Categorization;
}

/** data-model §7, analysis-pipeline §2 (A1). */
export async function ingestPhoto(
  ctx: ServiceContext,
  input: IngestPhotoInput,
  imageTools: ImageTools,
): Promise<TargetPhoto> {
  const { sessionId, blob, origin, originalFilename, clientLocal, clientOffset, capture, categorization } = input;

  // 1. bytes -> format
  const originalBuffer = await blob.arrayBuffer();
  const format = detectFormat(new Uint8Array(originalBuffer));
  if (format === null) throw new UnsupportedFormatError();
  if (blob.size > MAX_ORIGINAL_BYTES) throw new TooLargeError();

  // 2. working images, read bytes now
  const { working, thumb, workingSize } = await imageTools.makeWorkingImages(blob, format);
  const workingBuffer = await working.arrayBuffer();
  const thumbBuffer = await thumb.arrayBuffer();

  // 3. metadata (analysis-pipeline §2 A2, metadata-lighting §1-§4)
  const exif = await readExif(new Uint8Array(originalBuffer));
  const captureTime = resolveCaptureTime({ exif, origin, clientLocal, clientOffset });
  const imageStats = computeImageStats(await imageTools.toRgba(working, 256));
  const localHour = captureTime.local === null ? null : Number(captureTime.local.slice(11, 13));
  const exposure = exif ?? { fNumber: null, exposureTimeSec: null, iso: null };
  const bv = exif?.brightnessValue ?? estimateBrightnessValue(exposure) ?? null;
  const suggestion = suggestLighting({ bv, flashFired: exif?.flashFired ?? null, localHour, stats: imageStats });
  const lightingSuggestion = suggestion;
  const lighting = suggestion.label;
  const lightingConfirmed = false;
  const notes = null;

  const photoId = ctx.newId();
  const nowIso = ctx.now().toISOString();

  // 4. initial analysis + status
  const analysis = initialAnalysis(photoId, nowIso);
  const { status, reasons } = photoStatus({ categorization, analysis, result: null });

  const photo: TargetPhoto = {
    schemaVersion: 1,
    id: photoId,
    sessionId,
    origin,
    originalFormat: format,
    originalFilename,
    importedAt: nowIso,
    capture,
    exif,
    captureTime,
    working: {
      widthPx: workingSize.widthPx,
      heightPx: workingSize.heightPx,
      scaleFromOriginal: workingSize.scaleFromOriginal,
    },
    imageStats,
    lightingSuggestion,
    lighting,
    lightingConfirmed,
    categorization,
    notes,
    status,
    reasons,
  };

  const originalRecord: StoredBlob = {
    bytes: originalBuffer,
    contentType: contentTypeFor(format),
    sizeBytes: originalBuffer.byteLength,
    createdAt: nowIso,
  };
  const workingRecord: StoredBlob = {
    bytes: workingBuffer,
    contentType: 'image/jpeg',
    sizeBytes: workingBuffer.byteLength,
    createdAt: nowIso,
  };
  const thumbRecord: StoredBlob = {
    bytes: thumbBuffer,
    contentType: 'image/jpeg',
    sizeBytes: thumbBuffer.byteLength,
    createdAt: nowIso,
  };

  // 5. one transaction over photos, blobs, analyses, sessions
  const tx = ctx.db.transaction(['sessions', 'photos', 'analyses', 'blobs'], 'readwrite');
  const session = await getSessionRecord(tx, sessionId);
  if (session === null) throw new SessionNotFoundError(sessionId);

  await putPhotoRecord(tx, photo);
  await putAnalysisRecord(tx, analysis);
  await putBlob(tx, photoOriginalKey(photoId), originalRecord);
  await putBlob(tx, photoWorkingKey(photoId), workingRecord);
  await putBlob(tx, photoThumbKey(photoId), thumbRecord);
  await putSessionRecord(tx, { ...session, photoIds: [...session.photoIds, photoId], updatedAt: nowIso });
  await tx.done;

  // 6. after commit
  pipelineHooks.notify();

  return photo;
}
