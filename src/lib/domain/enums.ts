import { z } from 'zod';

export const TemplateId = z.enum(['sighting', 'precision']);
export type TemplateId = z.infer<typeof TemplateId>;

export const Position = z.enum(['prone', 'standing', 'both']);
export type Position = z.infer<typeof Position>;

export const ShotPosition = z.enum(['prone', 'standing']);
export type ShotPosition = z.infer<typeof ShotPosition>;

export const Lighting = z.enum(['daylight', 'night', 'artificial', 'mixed', 'unknown']);
export type Lighting = z.infer<typeof Lighting>;

// backing-sheet.md §3 (REV-38): `backing-card` is a photo of the backing card, never a target.
export const PhotoOrigin = z.enum(['camera-overlay', 'camera-native', 'import', 'backing-card']);
export type PhotoOrigin = z.infer<typeof PhotoOrigin>;

export const PhotoStatus = z.enum(['needs-metadata', 'processing', 'ready', 'analyzed', 'needs-attention', 'failed']);
export type PhotoStatus = z.infer<typeof PhotoStatus>;

export const Reason = z.enum([
  'target-not-found',
  'no-shots-found',
  'too-many-shots',
  'extra-candidates-dropped',
  'rounds-unaccounted',
  'alignment-uncertain',
  'image-blurry',
  'template-mismatch',
  'backing-colour-not-found',
  // REV-39 (M20): declared rounds are fact (analysis-pipeline §4).
  'too-many-holes',
  'double-punch-assumed',
  'rounds-scored-as-miss',
]);
export type Reason = z.infer<typeof Reason>;

export const Warning = z.enum([
  'extra-candidates-dropped',
  // REV-39 (M20): reconciliation of the found holes against the declared rounds.
  'too-many-holes',
  'double-punch-assumed',
  'rounds-scored-as-miss',
  'backing-colour-not-found',
  'alignment-uncertain',
  'image-blurry',
  'template-mismatch',
]);
export type Warning = z.infer<typeof Warning>;

export const StageState = z.enum(['pending', 'running', 'done', 'error']);
export type StageState = z.infer<typeof StageState>;
