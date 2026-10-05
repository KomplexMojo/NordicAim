// coach-context-import.md §4-§5 (M29, REV-159): the 545 Coach export NordicAim reads, and the per-session record it keeps in the
// `coachContext` store. Additive context only: nothing here is ever merged into `BiathlonSession` or `TargetAnalysis`. Pure.

import { z } from 'zod';

import { Id, LocalDate, UtcIso } from './primitives';

export const COACH_CONTEXT_FORMAT = 'coach-context';
export const COACH_CONTEXT_FORMAT_VERSION = 1;

/**
 * §4 says `UtcIso`. The real 2026-09-28 sample's zero clicks are actually `2026-09-29T01:19:12.231+00:00` — a numeric
 * `+00:00` offset, not a literal `Z`, which `UtcIso` (`z.string().datetime()`, `offset: false` by default) refuses outright.
 * `{ offset: true }` accepts both forms and any fractional-second length, matching the sample's own mixed precision
 * (`.231`, `.748`, `.29`). A bare minute-precision `...T01:19Z` is also accepted defensively, though nothing seen so far
 * actually uses it.
 */
export const CoachUtc = z.union([
  z.string().datetime({ offset: true }),
  z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/),
]);

/** §4: confirmed by the 545 Coach developer (2026-10-05): lower-case internal names, `null` for a normal range session. */
export const CoachRace = z.enum(['sprint', 'individual', 'mass-start', 'pursuit']);
export type CoachRace = z.infer<typeof CoachRace>;

export const MetalContext = z.object({
  sessionDate: LocalDate,
  position: z.enum(['prone', 'standing']),
  /** Alpha..echo, left to right downrange (`conventions.discOrder`); `true` is a hit. */
  discHits: z.array(z.boolean()).length(5),
  comboGroup: z.string().nullable(),
  hitRate: z.number().min(0).max(1),
  /** Stored, never shown (§6 renders nothing for it yet). */
  targetZone: z.number().nullable(),
  /** Stored, never shown (§6 renders nothing for it yet). */
  race: CoachRace.nullable(),
});
export type MetalContext = z.infer<typeof MetalContext>;

export const ZeroAdjustment = z.object({
  /** When the click was logged. No `sessionDate`: matched by converting this to the phone's local date (§5 step 4). */
  at: CoachUtc,
  /** Net movement, + up / − down: NordicAim's own +y-up, no translation. */
  verticalClicks: z.number(),
  /** Net movement, + right / − left: NordicAim's own +x-right, no translation. */
  horizontalClicks: z.number(),
  note: z.string().nullable(),
});
export type ZeroAdjustment = z.infer<typeof ZeroAdjustment>;

export const WindContext = z.object({
  sessionDate: LocalDate,
  speedKph: z.number().nullable(),
  /**
   * A clock position the wind blows FROM, facing the target (`conventions.windDirection`). §4 types it `string`, but §7 says
   * its serialization (number or string) is unconfirmed, so both are read rather than refusing a real export over it.
   */
  direction: z.union([z.string(), z.number()]).nullable(),
  /** In the only (calm) export seen, the strength band itself (`"none"`). */
  note: z.string().nullable(),
});
export type WindContext = z.infer<typeof WindContext>;

export const CoachConventions = z.object({
  discOrder: z.string(),
  zeroClicks: z.string(),
  windDirection: z.string(),
  windStrength: z.string(),
});
export type CoachConventions = z.infer<typeof CoachConventions>;

export const CoachSource = z.object({ app: z.literal('545-coach'), appVersion: z.string(), exportedAt: CoachUtc });
export type CoachSource = z.infer<typeof CoachSource>;

/** §4: the whole export file. Unknown extra fields are ignored (zod strips them), so a newer export still reads. */
export const CoachContextFile = z.object({
  format: z.literal(COACH_CONTEXT_FORMAT),
  formatVersion: z.literal(COACH_CONTEXT_FORMAT_VERSION),
  source: CoachSource,
  athleteHint: z.string().nullable(),
  range: z.object({ from: LocalDate, to: LocalDate }),
  metalSessions: z.array(MetalContext),
  zeroAdjustments: z.array(ZeroAdjustment),
  windConditions: z.array(WindContext),
  conventions: CoachConventions,
});
export type CoachContextFile = z.infer<typeof CoachContextFile>;

/** 64 lower-case hex digits: sha256 over `fingerprintSource(kind, record)`. */
const Fingerprint = z.string().regex(/^[0-9a-f]{64}$/);

export const FingerprintedMetal = z.object({ fingerprint: Fingerprint, record: MetalContext });
export const FingerprintedZero = z.object({ fingerprint: Fingerprint, record: ZeroAdjustment });
export const FingerprintedWind = z.object({ fingerprint: Fingerprint, record: WindContext });
export type FingerprintedMetal = z.infer<typeof FingerprintedMetal>;
export type FingerprintedZero = z.infer<typeof FingerprintedZero>;
export type FingerprintedWind = z.infer<typeof FingerprintedWind>;

/**
 * §5 step 6: what the `coachContext` store holds for one session (keyPath `sessionId`). Each 545 Coach record is kept as read,
 * beside a fingerprint of its own fields alone; `sessionId` and `attachedAt` are NordicAim's and are never hashed.
 */
export const AttachedCoachContext = z.object({
  schemaVersion: z.literal(1),
  sessionId: Id,
  attachedAt: UtcIso,
  source: CoachSource,
  conventions: CoachConventions,
  metal: z.array(FingerprintedMetal),
  zero: z.array(FingerprintedZero),
  wind: z.array(FingerprintedWind),
});
export type AttachedCoachContext = z.infer<typeof AttachedCoachContext>;

export type CoachRecordKind = 'metal' | 'zero' | 'wind';

/** JSON with object keys sorted at every level, so the same record always serialises the same way. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

/**
 * The text a record's fingerprint hashes: its kind and its own §4 fields (as parsed, so unknown extra fields never count), and
 * nothing NordicAim assigns. The kind keeps a metal bout and a wind record from ever sharing a fingerprint.
 */
export function fingerprintSource(kind: CoachRecordKind, record: MetalContext | ZeroAdjustment | WindContext): string {
  return canonicalJson({ kind, record });
}

/** §5 step 3: why a picked file was refused. Nothing is written for any of them. */
export type CoachRefusal = 'not-json' | 'wrong-format' | 'wrong-version' | 'bad-shape';

export type CoachParseResult = { ok: true; file: CoachContextFile } | { ok: false; reason: CoachRefusal; problem: string };

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

/** §5 step 3: reads a picked file's text, refusing it (with the reason named) when it is not a 545 Coach export this app reads. */
export function parseCoachContextText(text: string): CoachParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not-json', problem: 'This file is not JSON, so it is not a 545 Coach export.' };
  }
  if (!isRecord(raw) || raw.format !== COACH_CONTEXT_FORMAT) {
    return { ok: false, reason: 'wrong-format', problem: 'This is not a 545 Coach export (its format is not "coach-context").' };
  }
  if (raw.formatVersion !== COACH_CONTEXT_FORMAT_VERSION) {
    return {
      ok: false,
      reason: 'wrong-version',
      problem: `This 545 Coach export is format version ${String(raw.formatVersion)}; this app reads version ${COACH_CONTEXT_FORMAT_VERSION}.`,
    };
  }
  const parsed = CoachContextFile.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first === undefined || first.path.length === 0 ? 'the file' : first.path.join('.');
    return { ok: false, reason: 'bad-shape', problem: `This 545 Coach export has a record this app cannot read (${where}: ${first?.message ?? 'invalid'}).` };
  }
  return { ok: true, file: parsed.data };
}

/** The records of one file that belong to one session (§5 step 4), in file order. */
export interface CoachMatch {
  metal: MetalContext[];
  zero: ZeroAdjustment[];
  wind: WindContext[];
}

/**
 * §5 step 4: every record for `sessionDate`. Metal and wind match on their own `sessionDate`; a zero click on the local date of its
 * `at`, which `localDateOf` gives (the phone's own timezone at attach time, spec §7).
 */
export function matchCoachContext(file: CoachContextFile, sessionDate: string, localDateOf: (utc: string) => string): CoachMatch {
  return {
    metal: file.metalSessions.filter((m) => m.sessionDate === sessionDate),
    zero: file.zeroAdjustments.filter((z) => localDateOf(z.at) === sessionDate),
    wind: file.windConditions.filter((w) => w.sessionDate === sessionDate),
  };
}

export function isEmptyMatch(match: CoachMatch): boolean {
  return match.metal.length === 0 && match.zero.length === 0 && match.wind.length === 0;
}
