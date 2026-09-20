# Shooting-issue overlays (REV-74)

Regions on the target that a coaching fault usually puts shots in, drawn over a diagram by toggles. They are guides, not
diagnoses: nothing is inferred from the owner's shots.

- **Catalog** `src/lib/issues/catalog.ts`: `tight`, `scattered`, and the chart's a–p (fundamentals unsound; poor sight alignment;
  incorrect zero; change in prone position; change in wind; change in light; sling too loose / slipping / too tight; left
  elbow too far inside; right elbow sliding out; butt too low; poor natural alignment; trigger finger; poor trigger control;
  breath control and timing). Each has one or more regions: `circle {x,y,r}`, `ellipse {x,y,rx,ry,angleDeg}` (CCW from +x), or
  `ring {inner,outer}`, in **units of the black disc's radius** (1 = the disc's edge), +x right, +y up from the centre.
- **Unit**: precision 56.2 mm (black disc), sighting 57.5 mm (standing disc). One catalog fits both.
- **Drawing** `render/issue-overlay.ts` (pure): `renderIssueOverlays(ids, {cx, cy, s}, template)` → one `<g>`, each issue in its own
  colour (four, cycling), translucent fill, dashed edge, its letter at its first region; `injectIntoSvg` puts it just before the
  closing tag. The frame is the diagram's own: `diagramFullFrame(template, shots)` for the detail diagram (`fitScale` included),
  the Patterns drawing's centre and scale for Patterns. The stored diagram is never changed.
- **Control** `IssueOverlayPanel` (REV-76): a collapsible panel (`panelId: issues`, closed by default) of compact radio-style toggles
  (`role=checkbox`, `aria-checked`), each `short` (one or two words) with the full text as `title`/`aria-label` and, for touch, in a
  caption under them; **Clear all**. A phone shows one scrolling row above the diagram (44 px targets); `lg` and up a column beside
  it. Several may be on. Selection is per screen visit, not stored.
- **Where**: the target screen's full diagram and the Patterns drawing.
