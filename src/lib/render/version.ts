// rendering-composite.md §6 (REV-58). Which version of the per-target diagram renderer this build draws — and,
// since both are written by the same Stage B pass, the stored `characteristics`/potential issues too (owner,
// 2026-09-30).
//
// The per-photo `full` and `cell` diagrams (and `computed.result.<subset>.characteristics`) are written when a
// photo is scored, so a change here does not reach a session that was scored before it. At app start the version
// stored in settings is compared with this one and, when behind, every finished analysis is scored again once
// (`refreshStaleDiagrams`).
//
// Bump it whenever a per-target diagram's output changes, or `characterize-result.ts`'s / `characteristics.ts`'s:
//   12 — owner, 2026-10-01: an elongated group that is none of the named strings reads "elongated (…)", not
//        "round" (`characteristics.ts`'s `shape`).
//   11 — owner, 2026-10-01: the outside-the-zone share reads the real biathlon zones (45 mm prone, 115 mm
//        standing) on every template, with the scoring rule's touch (`hitsZone`), not ring 8 or the black disc.
//   10 — owner, 2026-09-30: precision's "miss" zone (`discRadiusMm`) is ring 8's radius (21.2 mm) for prone,
//        standing in for the prone-specific zone the precision target has none of its own; standing still reads
//        the full black disc.
//   9 — owner, 2026-09-30: sighting's "miss" zone (`discRadiusMm`) is the shot's own position's zone (22.5 mm
//       prone, 57.5 mm standing), not always the standing zone — see `characterize-result.ts`.
//   8 — REV-137: the group ellipse is a brighter blue on a dark halo, and wider.
//   6 — REV-86: a precision cell's top-left mark is a standing or prone silhouette.
//   5 — REV-81/82: plain star below 70, the scoring-rule icon under the star, dots in the recorded backing colour.
//   4 — REV-80: the precision diagram's score star.
//   3 — REV-79: a sighting diagram's top-left mark is the sight-in or confirm symbol.
//   2 — REV-60: the target screen also shows accuracy (stored results gain `accuracyRmseMm`).
//   1 — REV-58: one fixed cell scale (no zoom-out), `+N off view`, and a detail diagram that shows every shot.
export const DIAGRAM_RENDERER_VERSION = 12;
