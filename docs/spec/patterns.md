# Patterns screen (REV-64, issue #19)

Where every recorded shot from every session lands, per kind of target, over a long period. View-only. Reads stored
analyses; reads no photo; nothing leaves the phone.

## 1. Views (owner decisions 2026-09-20, recommendations of issue #19 accepted)

| View id | Label | Which targets |
|---|---|---|
| `sight-in` | Sight in | sighting targets whose effective role is `sight-in` |
| `confirm` | Confirm | sighting targets whose effective role is `confirm` |
| `precision-prone` | Precision prone | every precision **unit** whose `position` is `prone` |
| `precision-standing` | Precision standing | every precision **unit** whose `position` is `standing` |

A `both` precision target contributes its prone units to one view and its standing units to the other. The role is the owner's choice (`categorization.sightingRole`, REV-67) or, when not chosen, inferred by
`sightingRoles`: the oldest unset target is Sight in (unless one is explicitly Sight in), every other unset one is Confirm.

## 2. Which targets count

Included: `photo.status === 'analyzed'`, `analysis.computed !== null`, and `analysis.pipeline.alignment.method` is `cv` or
`manual` (a measured or owner-confirmed alignment; an unconfirmed overlay guess would place shots wrongly). Everything else
is **left out** and counted; the screen says `N targets left out`. Assumed misses have no position and are not drawn.
Shots are the located **units** of `computed.result.all.units`, in mm from the target centre.

## 3. Date range

By `session.sessionDate` (`YYYY-MM-DD`): **30 days**, **90 days**, **All time** (default). "Days" count back from today (the
service supplies today; `patterns/` never reads the clock). The dots and the summary change together.

## 4. Summary (per view, over the shown points)

`shots`, `targets`, `sessions`; the mean point of impact (mm and MOA via `mpiOffset`, at 50 m); the group ellipse
(`groupEllipse`); and extreme spread. Precision views: the share of shots per ring (10 … 0) under the scoring rule in force
(the units already carry it) and the average ring. Sighting views: the share landing in the target's hit zone
(`unit.zone` is `clean` or `hit`). Fewer than **10** shots shows the numbers but says `Patterns need more shots` and draws
no ellipse. No conclusions are invented.

## 5. Drawing (`render/patterns.ts`, pure)

A 1200 px square SVG, no page background, of the printed target (the detail diagram's target drawing) with the **same outer diameter in all four views** (halo radius 525 px). One shared zoom-out
(`patternsSizeFactor`, from every recorded shot, not the date range) makes it small enough that the farthest shot of any view is on
the paper (floor 0.5×), so **every** shot shows (strays included) and the size never changes between views or ranges. Each shot is an 8 px-radius dot, red-orange `#FF3B1F` at opacity 0.6 with a thin white edge (bright enough to see on a phone,
on both the black disc and the white rings), so overlap deepens. The mean point of impact marker is drawn; the ellipse only when the summary allows it. Above 5 000
points the dots are drawn as one path per 500 (still SVG; a canvas fallback is not needed at this size).

## 6. Screen

`#/patterns`, reached from Home (a **Patterns** link, not a fourth tab: REV-47 stands). A view switch (four buttons), a range
switch (three), the drawing, the summary, and the left-out count. The drawing can be zoomed. Empty and thin states are
plain sentences. Not shareable in v1 (share rule unchanged).
