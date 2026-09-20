import { z } from 'zod';

import { BackingMode, BackingSheet } from './backing';
import { LocalDate, Id, UtcIso } from './primitives';
import { DEFAULT_SCORING_RULE, ScoringRule } from './settings';

export const ArtifactMeta = z.object({
  id: Id,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  widthPx: z.number().int(),
  heightPx: z.number().int(),
  createdAt: UtcIso,
  /**
   * rendering-composite.md §6 (2026-09-19): which renderer drew it. Defaults to 0 so artifacts stored
   * before this read back; anything below the current version is rebuilt when the results screen opens.
   */
  rendererVersion: z.number().int().min(0).default(0),
  /** REV-59: the scoring rule the image was drawn under. Defaults to `gauge` for artifacts stored before it existed. */
  scoringRule: ScoringRule.default(DEFAULT_SCORING_RULE),
  /** REV-100: whose name, club and key the image carries (`athleteIdentity`), so a change in Settings marks it stale. */
  identity: z.string().default(''),
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

/**
 * data-model §2 as REV-38 (M19) left it: the session carried its own backing. Read only by the REV-48
 * migration (backing-sheet.md §3a), which lifts a measured backing into settings before dropping it.
 */
export const BiathlonSessionV2 = z.object({
  schemaVersion: z.literal(2),
  ...sessionBase,
  backingMode: BackingMode,
  backing: BackingSheet.nullable(),
});
export type BiathlonSessionV2 = z.infer<typeof BiathlonSessionV2>;

/** data-model §2. REV-48 (M22): schema 3, no backing fields — the backing is a Settings choice. */
export const BiathlonSession = z.object({
  schemaVersion: z.literal(3),
  ...sessionBase,
});
export type BiathlonSession = z.infer<typeof BiathlonSession>;

/**
 * backing-sheet.md §3a step 3: a schema-1 or schema-2 record becomes schema 3. Schema 2's
 * `backingMode` / `backing` are dropped here — lifting a measured backing into settings is the
 * store migration's job (`migrateBackingToSettings`), which runs before anything reads a session.
 * Anything else (including a current record) is returned unchanged for the schema to judge.
 */
export function repairSession(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object') return raw;
  const record = raw as Record<string, unknown>;
  // A blank name fails `min(1)`, which made the whole record unreadable and emptied the app (owner,
  // 2026-09-19: the metadata screen's auto-save stored "" while the name field was being retyped). The
  // record is otherwise perfectly good, so it gets the same default name `createSession` uses.
  if (typeof record.name === 'string' && record.name.trim() === '') {
    const date = typeof record.sessionDate === 'string' ? record.sessionDate : 'recovered';
    return { ...record, name: `Session ${date}` };
  }
  return raw;
}

export function upgradeSession(raw: unknown): unknown {
  const v1 = BiathlonSessionV1.safeParse(raw);
  if (v1.success) return { ...v1.data, schemaVersion: 3 };
  const v2 = BiathlonSessionV2.safeParse(raw);
  if (v2.success) {
    const { backingMode, backing, ...rest } = v2.data;
    void backingMode;
    void backing;
    return { ...rest, schemaVersion: 3 };
  }
  return raw;
}

/**
 * backing-sheet.md §3a step 2 (pure). When settings holds no backing yet, the most recently updated
 * schema-2 session whose backing has a measured colour gives settings its mode and backing, so nothing
 * the owner measured is lost. A backing already in settings is never replaced. The card photo id is
 * dropped: the card photo is not kept (REV-48). Returns null when there is nothing to lift.
 */
export function backingToLift(
  settingsBacking: BackingSheet | null,
  sessions: readonly BiathlonSessionV2[],
): { backingMode: BackingMode; backing: BackingSheet } | null {
  if (settingsBacking !== null) return null;
  let best: BiathlonSessionV2 | null = null;
  for (const session of sessions) {
    if (session.backing === null || session.backing.colour === null) continue;
    if (best === null || session.updatedAt > best.updatedAt) best = session;
  }
  if (best === null || best.backing === null) return null;
  return { backingMode: best.backingMode, backing: { ...best.backing, cardPhotoId: null } };
}
