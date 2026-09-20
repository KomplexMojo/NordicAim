// REV-100 (docs/spec/provenance.md §2): the canonical payload a stamp covers. Pure and deterministic: the same data in any order gives
// the same string, and changing any single value changes it.

export interface ProvenanceTarget {
  /** Where the target sits on the image, e.g. `sighting-1`, `precision-2`. */
  slot: string;
  kind: string;
  photoId: string;
  /** SHA-256 (hex) of the original photo's bytes, or null when the original is not stored. */
  photoSha256: string | null;
  captureUtc: string | null;
  make: string | null;
  model: string | null;
  scores: { gauge: number; centre: number; visible: number };
  /** The alignment and shots together are the target's "paper signature". */
  alignment: { cx: number; cy: number; radiusPx: number } | null;
  shots: Array<{ xMm: number; yMm: number; multiplicity: number }>;
}

export interface ProvenanceInput {
  name: string;
  club: string;
  sessionDate: string;
  scoringRule: string;
  visibleHoleDiameterMm: number;
  release: string;
  createdAt: string;
  targets: ProvenanceTarget[];
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  const r = Math.round(value * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function buildPayload(input: ProvenanceInput): string {
  const targets = [...input.targets]
    .sort((a, b) => byText(a.slot, b.slot) || byText(a.photoId, b.photoId))
    .map((t) => ({
      slot: t.slot,
      kind: t.kind,
      photoId: t.photoId,
      photoSha256: t.photoSha256,
      captureUtc: t.captureUtc,
      make: t.make,
      model: t.model,
      scores: { gauge: t.scores.gauge, centre: t.scores.centre, visible: t.scores.visible },
      alignment: t.alignment === null ? null : { cx: round(t.alignment.cx, 1), cy: round(t.alignment.cy, 1), radiusPx: round(t.alignment.radiusPx, 1) },
      shots: t.shots
        .map((s) => ({ x: round(s.xMm, 2), y: round(s.yMm, 2), n: s.multiplicity }))
        .sort((a, b) => a.x - b.x || a.y - b.y || a.n - b.n),
    }));
  return JSON.stringify({
    v: 1,
    name: input.name,
    club: input.club,
    sessionDate: input.sessionDate,
    scoringRule: input.scoringRule,
    visibleHoleDiameterMm: round(input.visibleHoleDiameterMm, 2),
    release: input.release,
    createdAt: input.createdAt,
    targets,
  });
}
