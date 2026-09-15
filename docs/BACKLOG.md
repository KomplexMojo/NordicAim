# Backlog (post-MVP)

**Not part of the MVP.** Agents must not implement these without the owner's explicit go-ahead. When one is picked up,
write a milestone for it first. Earlier drafts exist in git history at commit `2868527` (paths noted below). Treat them
as starting points to re-validate, not as current spec.

| # | Item | What it adds | Why deferred | Earlier draft (`git show 2868527:<path>`) |
|---|---|---|---|---|
| B1 | **Backups & restore** | Export/import all data to Files or iCloud Drive, reminders, delete-all-data | Not in the 3-step MVP. **Risk:** without it, deleting the Home Screen app loses history (shared summary images in Photos survive). | `docs/spec/privacy-storage-hosting.md` §3–§4, `docs/milestones/M15-backup-storage.md` |
| B2 | Sequence player | Step or auto-play through a session's diagrams | Not in the MVP UX | `docs/milestones/M16-sequence-player.md` |
| B3 | Shooting harness / trends | Cross-session precision, hit rate, group size, MPI drift | Not in the MVP UX | `docs/milestones/M17-shooting-harness.md` |
| B4 | Keep/discard source photos | Delete original images while keeping results | Storage management, not core | `docs/milestones/M14-share-sources.md` (Sources panel) |
| B5 | Summary-image slot picker | Choose which targets fill the 4 slots when more than 4 were shot | MVP auto-selects the most recent 2 + 2 | `docs/milestones/M13-composite.md` |
| B6 | Extra sheet fields | Athlete name, wind, athlete condition (from the precision sheet) | MVP metadata is template, position, rounds, lighting, notes | `docs/spec/data-model.md` (`SheetFields`) |
| B7 | Capture extras | Torch toggle, tilt/level indicator | Nice-to-have | `docs/spec/capture-overlay.md` §2, §7 |
| B8 | Sight-correction hint | "Move group N mm left (≈ K clicks)" once the rear-sight click value is known | Needs owner's click value | `docs/spec/geometry-scoring.md` §6 (still present, marked post-MVP) |
| B9 | Pinned missing-round mode | Show only optimistic/pessimistic/averaged instead of the range | Not needed | `docs/milestones/M10-shot-editor.md` |
| B10 | Capacitor native shell | Install as a native app via Xcode; one-tap Save to Photos. **No Apple Health.** | Web app covers the MVP | `docs/milestones/M20-capacitor-shell.md`, `M22-native-photos-share.md` |
| B11 | Visual polish | Illustrated full-bleed landing, bottom nav, update prompt, full accessibility audit | MVP ships a clean, basic UI | `docs/milestones/M18-offline-polish.md` |
| B12 | **Group pattern recognition and coaching suggestions** | When a target shows an obvious group pattern (offset, vertical, horizontal or diagonal stringing, two clusters, stray shots, scatter), suggest likely causes and things to check, per position | Future requirement (owner, 2026-09-15). Needs coach validation of thresholds and cause mappings, plus new inputs (handedness; optional shot order) | Draft spec: `docs/spec/group-patterns.md` (source: Biathlon Canada Technical Coaching Manual, fig. 4.43; not stored in repo) |

## Explicitly out of scope (not backlog)

- Apple Health integration (REV-17)
- Garmin connection, login, or automatic upload (no supported API; attach manually)
- Strava
- Multi-user accounts
