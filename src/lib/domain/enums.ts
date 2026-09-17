import { z } from 'zod';

export const TemplateId = z.enum(['sighting', 'precision']);
export type TemplateId = z.infer<typeof TemplateId>;

export const Position = z.enum(['prone', 'standing', 'both']);
export type Position = z.infer<typeof Position>;

export const ShotPosition = z.enum(['prone', 'standing']);
export type ShotPosition = z.infer<typeof ShotPosition>;

export const Lighting = z.enum(['daylight', 'night', 'artificial', 'mixed', 'unknown']);
export type Lighting = z.infer<typeof Lighting>;

export const PhotoOrigin = z.enum(['camera-overlay', 'camera-native', 'import']);
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
]);
export type Reason = z.infer<typeof Reason>;

export const Warning = z.enum([
  'extra-candidates-dropped',
  'alignment-uncertain',
  'image-blurry',
  'template-mismatch',
]);
export type Warning = z.infer<typeof Warning>;

export const StageState = z.enum(['pending', 'running', 'done', 'error']);
export type StageState = z.infer<typeof StageState>;
