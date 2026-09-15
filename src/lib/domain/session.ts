import { z } from 'zod';

import { LocalDate, Id, UtcIso } from './primitives';

export const ArtifactMeta = z.object({
  id: Id,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  widthPx: z.number().int(),
  heightPx: z.number().int(),
  createdAt: UtcIso,
});
export type ArtifactMeta = z.infer<typeof ArtifactMeta>;

export const ShareRecord = z.object({
  id: Id,
  artifactId: Id,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: UtcIso,
  method: z.enum(['web-share', 'download']),
});
export type ShareRecord = z.infer<typeof ShareRecord>;

export const BiathlonSession = z.object({
  schemaVersion: z.literal(1),
  id: Id,
  name: z.string().trim().min(1).max(80),
  sessionDate: LocalDate,
  createdAt: UtcIso,
  updatedAt: UtcIso,
  photoIds: z.array(Id), // capture/import order
  analyzeRequestedAt: UtcIso.nullable(), // set by "Analyze"; enables Stage B (analysis-pipeline §5)
  artifacts: z.array(ArtifactMeta), // newest last; at most 3 kept
  shares: z.array(ShareRecord),
  notes: z.string().max(2000),
});
export type BiathlonSession = z.infer<typeof BiathlonSession>;
