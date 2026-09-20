// rendering-composite.md §6 (REV-58). Which version of the per-target diagram renderer this build draws.
//
// The per-photo `full` and `cell` diagrams are written when a photo is scored, so a renderer change does not
// reach a session that was scored before it. At app start the version stored in settings is compared with this
// one and, when behind, every finished analysis is scored again once (`refreshStaleDiagrams`).
//
// Bump it whenever a per-target diagram's output changes:
//   6 — REV-86: a precision cell's top-left mark is a standing or prone silhouette.
//   5 — REV-81/82: plain star below 70, the scoring-rule icon under the star, dots in the recorded backing colour.
//   4 — REV-80: the precision diagram's score star.
//   3 — REV-79: a sighting diagram's top-left mark is the sight-in or confirm symbol.
//   2 — REV-60: the target screen also shows accuracy (stored results gain `accuracyRmseMm`).
//   1 — REV-58: one fixed cell scale (no zoom-out), `+N off view`, and a detail diagram that shows every shot.
export const DIAGRAM_RENDERER_VERSION = 6;
