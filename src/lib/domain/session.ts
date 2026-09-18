import { z } from 'zod';

import { BackingMode, BackingSheet, DEFAULT_BACKING_MODE } from './backing';
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

/** The fields every schema version shares. */
const sessionBase = {
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
};

/** data-model §2 as it shipped before REV-38. Only {@link upgradeSession} reads it. */
export const BiathlonSessionV1 = z.object({ schemaVersion: z.literal(1), ...sessionBase });
export type BiathlonSessionV1 = z.infer<typeof BiathlonSessionV1>;

export const BiathlonSession = z.object({
  schemaVersion: z.literal(2),
  ...sessionBase,
  // REV-38: the optional coloured backing for this session (backing-sheet.md §3).
  backingMode: BackingMode,
  backing: BackingSheet.nullable(),
});
export type BiathlonSession = z.infer<typeof BiathlonSession>;

/** backing-sheet.md §3, milestone step 1: schema version 1 -> 2 sets `backingMode: 'auto'`, `backing: null`. */
export function upgradeSession(raw: unknown): unknown {
  const v1 = BiathlonSessionV1.safeParse(raw);
  if (!v1.success) return raw;
  return { ...v1.data, schemaVersion: 2, backingMode: DEFAULT_BACKING_MODE, backing: null };
}
