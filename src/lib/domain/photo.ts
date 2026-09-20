import { z } from 'zod';

import { Lighting, PhotoOrigin, PhotoStatus, Position, Reason, Season, TemplateId } from './enums';
import { Id, LocalDateTime, Offset, UtcIso } from './primitives';

export const Calibration = z.object({
  cx: z.number(),
  cy: z.number(),
  radiusPx: z.number().positive(),
  axisRatio: z.number().gt(0.3).lte(1),
  angleDeg: z.number().gte(0).lt(180), // major axis, clockwise from image +x
  anchorDiameterMm: z.number().positive(), // 115 (sighting) or 112.4 (precision)
  source: z.enum(['overlay', 'auto', 'manual']),
  confidence: z.number().min(0).max(1).nullable(),
  // REV-44 (M18): the target plane's vanishing line, in target mm. null = square on, which computes
  // bit-for-bit the pre-M18 behaviour, so stored analyses need no migration. Applied BEFORE the
  // ellipse map: mmToPx(p) = ellipse( p / (perspective.p * p.xMm + perspective.q * p.yMm + 1) ).
  // A manual handle drag in Adjust keeps it; only "reset alignment" clears it.
  perspective: z.object({ p: z.number(), q: z.number() }).nullable().default(null),
});
export type Calibration = z.infer<typeof Calibration>;

export const CaptureInfo = z.object({
  overlayTemplate: TemplateId.nullable(),
  outerDiameterFraction: z.number().min(0.3).max(1).nullable(),
  frameWidthPx: z.number().int().positive(),
  frameHeightPx: z.number().int().positive(),
  calibrationPriorFramePx: Calibration.nullable(), // FRAME pixels
  trackSettings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).nullable(),
});
export type CaptureInfo = z.infer<typeof CaptureInfo>;

export const ExifMeta = z.object({
  captureLocal: LocalDateTime.nullable(),
  captureOffset: Offset.nullable(),
  captureUtc: UtcIso.nullable(),
  gpsPresent: z.boolean(),
  gps: z.object({ lat: z.number(), lon: z.number(), altM: z.number().nullable() }).nullable(),
  gpsImgDirection: z.number().nullable(),
  make: z.string().nullable(),
  model: z.string().nullable(),
  lens: z.string().nullable(),
  brightnessValue: z.number().nullable(),
  iso: z.number().nullable(),
  exposureTimeSec: z.number().nullable(),
  fNumber: z.number().nullable(),
  flashRaw: z.number().int().nullable(),
  flashFired: z.boolean().nullable(),
  whiteBalance: z.enum(['auto', 'manual']).nullable(),
  widthPx: z.number().int().nullable(),
  heightPx: z.number().int().nullable(),
});
export type ExifMeta = z.infer<typeof ExifMeta>;

export const CaptureTime = z.object({
  local: LocalDateTime.nullable(),
  offset: Offset.nullable(),
  utc: UtcIso.nullable(),
  source: z.enum(['exif', 'client-clock', 'import-time']),
});
export type CaptureTime = z.infer<typeof CaptureTime>;

export const ImageStats = z.object({
  meanLuma: z.number(),
  brightMeanR: z.number(),
  brightMeanG: z.number(),
  brightMeanB: z.number(),
});
export type ImageStats = z.infer<typeof ImageStats>;

export const LightingSuggestion = z.object({
  label: Lighting,
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string()),
});
export type LightingSuggestion = z.infer<typeof LightingSuggestion>;

export const Categorization = z.object({
  template: TemplateId.nullable(),
  position: Position.nullable(),
  roundsProne: z.number().int().min(1).max(50).nullable(),
  roundsStanding: z.number().int().min(1).max(50).nullable(),
  // REV-67: a sighting target's role. null = not chosen; `sightingRoles` infers it by order.
  sightingRole: z.enum(['sight-in', 'confirm']).nullable().optional(),
});
export type Categorization = z.infer<typeof Categorization>;

export const TargetPhoto = z.object({
  schemaVersion: z.literal(1),
  id: Id,
  sessionId: Id,
  origin: PhotoOrigin,
  originalFormat: z.enum(['jpeg', 'png', 'heic']),
  originalFilename: z.string().max(255).nullable(),
  importedAt: UtcIso,
  capture: CaptureInfo.nullable(),
  exif: ExifMeta.nullable(),
  captureTime: CaptureTime,
  working: z.object({
    widthPx: z.number().int(),
    heightPx: z.number().int(),
    scaleFromOriginal: z.number().positive(),
  }),
  imageStats: ImageStats.nullable(),
  lightingSuggestion: LightingSuggestion,
  lighting: Lighting,
  lightingConfirmed: z.boolean(),
  // REV-79: absent or null = not chosen; the metadata screen then offers the season the capture date falls in.
  season: Season.nullable().optional(),
  categorization: Categorization,
  notes: z.string().max(1000).nullable(),
  status: PhotoStatus, // computed by photoStatus (analysis-pipeline §4); never set by UI code
  reasons: z.array(Reason),
});
export type TargetPhoto = z.infer<typeof TargetPhoto>;
