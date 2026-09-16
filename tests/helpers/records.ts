// Record builders for pipeline tests. Ids default to real UUIDs so records survive the zod validation
// the repositories run on read (data-model §6).

import { initialAnalysis, type TargetAnalysis } from '@/lib/domain/analysis';
import type { Calibration, CaptureInfo, TargetPhoto } from '@/lib/domain/photo';
import type { BiathlonSession } from '@/lib/domain/session';

export function makeSession(over: Partial<BiathlonSession> = {}): BiathlonSession {
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    name: 'Session 2026-09-05',
    sessionDate: '2026-09-05',
    createdAt: '2026-09-05T23:40:00.000Z',
    updatedAt: '2026-09-05T23:40:00.000Z',
    photoIds: [],
    analyzeRequestedAt: null,
    artifacts: [],
    shares: [],
    notes: '',
    ...over,
  };
}

export function makeCapture(over: Partial<CaptureInfo> = {}): CaptureInfo {
  return {
    overlayTemplate: 'precision',
    outerDiameterFraction: 0.85,
    frameWidthPx: 2400,
    frameHeightPx: 3200,
    calibrationPriorFramePx: null,
    trackSettings: null,
    ...over,
  };
}

export function makePrior(over: Partial<Calibration> = {}): Calibration {
  return {
    cx: 1200,
    cy: 1600,
    radiusPx: 560,
    axisRatio: 1,
    angleDeg: 0,
    anchorDiameterMm: 112.4,
    source: 'overlay',
    confidence: null,
    ...over,
  };
}

export function makePhoto(over: Partial<TargetPhoto> = {}): TargetPhoto {
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    origin: 'camera-overlay',
    originalFormat: 'jpeg',
    originalFilename: null,
    importedAt: '2026-09-05T23:40:00.000Z',
    capture: null,
    exif: null,
    captureTime: { local: null, offset: null, utc: null, source: 'client-clock' },
    working: { widthPx: 1200, heightPx: 1600, scaleFromOriginal: 0.5 },
    imageStats: null,
    lightingSuggestion: { label: 'unknown', confidence: 0, reasons: [] },
    lighting: 'unknown',
    lightingConfirmed: false,
    categorization: { template: 'precision', position: 'prone', roundsProne: 10, roundsStanding: null },
    notes: null,
    status: 'processing',
    reasons: [],
    ...over,
  };
}

export function makeAnalysis(
  photoId: string,
  pipeline: Partial<TargetAnalysis['pipeline']> = {},
  over: Partial<TargetAnalysis> = {},
): TargetAnalysis {
  const base = initialAnalysis(photoId, '2026-09-05T23:40:00.000Z');
  return { ...base, pipeline: { ...base.pipeline, ...pipeline }, ...over };
}
