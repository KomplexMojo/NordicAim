// rendering-composite.md §1. Diagram colour tokens. The UI theme reuses these as CSS variables
// (a later milestone's concern); here they are consumed directly by the SVG renderers.

export const PALETTE = {
  page: '#F7FAFD',
  panel: '#EAF2F8',
  panelBorder: '#A9CFE3',
  haloFill: '#DCEBF5',
  accent: '#4B94C3',
  accentText: '#2F6E99',
  textPrimary: '#1F2630',
  textSecondary: '#5B6775',
  discSighting: '#36404D',
  discPrecision: '#1C1F24',
  ringOnDark: '#FFFFFF',
  ringOnLight: '#2A2F36',
  guideOnDark: '#CFE6F3',
  shotProne: '#E8604C',
  shotStanding: '#8A5CF6',
  mpi: '#C8452F',
  // REV-137 (issue #70): a brighter blue, drawn over `ellipseHalo`, so the group ellipse reads on the black disc and white paper alike.
  ellipse: '#3AA8F8',
  ellipseHalo: '#0E2A40',
  header: '#1F2630',
  // REV-148: a goal met (the seal, the band's ✓) and missed (the band's ✗).
  goalMet: '#1E8E4F',
  goalMissed: '#B83A2E',
} as const;
