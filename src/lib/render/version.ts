// rendering-composite.md §6 (REV-58). Which version of the per-target diagram renderer this build draws.
//
// The per-photo `full` and `cell` diagrams are written when a photo is scored, so a renderer change does not
// reach a session that was scored before it. At app start the version stored in settings is compared with this
// one and, when behind, every finished analysis is scored again once (`refreshStaleDiagrams`).
//
// Bump it whenever a per-target diagram's output changes:
//   1 — REV-58: one fixed cell scale (no zoom-out), `+N off view`, and a detail diagram that shows every shot.
export const DIAGRAM_RENDERER_VERSION = 1;
