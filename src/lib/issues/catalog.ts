// REV-74: the shooting issues from the coaching chart, each as a region highlighted on the target. Pure data.
//
// Every region is in units of the black disc's radius (u = 1 is the disc's edge), +x right and +y up from the target centre, so
// one catalog fits both targets (the precision black disc is 56.2 mm radius, the sighting standing disc 57.5 mm).

export type IssueRegion =
  | { kind: 'circle'; x: number; y: number; r: number }
  /** `angleDeg` is counter-clockwise from +x in target space. */
  | { kind: 'ellipse'; x: number; y: number; rx: number; ry: number; angleDeg: number }
  /** A ring around the centre, from `inner` to `outer`. */
  | { kind: 'ring'; inner: number; outer: number };

export interface IssueOverlay {
  id: string;
  /** The chart's letter, drawn on the region; the two group shapes have none. */
  letter: string;
  label: string;
  regions: IssueRegion[];
}

const c = (x: number, y: number, r: number): IssueRegion => ({ kind: 'circle', x, y, r });
const e = (x: number, y: number, rx: number, ry: number, angleDeg = 0): IssueRegion => ({ kind: 'ellipse', x, y, rx, ry, angleDeg });

export const ISSUE_OVERLAYS: ReadonlyArray<IssueOverlay> = [
  { id: 'tight', letter: '', label: 'Tight group', regions: [c(0, 0, 0.12)] },
  { id: 'scattered', letter: '', label: 'Scattered group', regions: [c(0, 0, 0.65)] },
  {
    id: 'a',
    letter: 'a',
    label: 'Shooting fundamentals unsound, poor ammunition, worn barrel or loose bedding screws',
    regions: [c(0, 0, 0.12), { kind: 'ring', inner: 1.05, outer: 1.45 }],
  },
  { id: 'b', letter: 'b', label: 'Poor sight alignment', regions: [c(0.05, 0.1, 0.2), { kind: 'ring', inner: 1.05, outer: 1.4 }] },
  { id: 'c', letter: 'c', label: 'Incorrect zero', regions: [c(-0.34, 0.15, 0.14)] },
  { id: 'd', letter: 'd', label: 'Change in prone position', regions: [c(-0.32, 0, 0.16), c(0.25, 0, 0.13)] },
  { id: 'e', letter: 'e', label: 'Change in wind', regions: [c(0, 0, 0.13), c(0.65, -0.36, 0.16), e(0.32, -0.18, 0.5, 0.15, -30)] },
  { id: 'f', letter: 'f', label: 'Change in light', regions: [c(0, -0.32, 0.16)] },
  { id: 'g', letter: 'g', label: 'Prone sling too loose', regions: [e(0, -0.15, 0.2, 0.5)] },
  { id: 'h', letter: 'h', label: 'Prone sling slipping', regions: [e(0.15, -0.1, 0.13, 0.65)] },
  { id: 'i', letter: 'i', label: 'Left elbow too much inside (prone)', regions: [e(-0.6, 0.05, 0.75, 0.2, 0)] },
  { id: 'j', letter: 'j', label: 'Prone sling too tight', regions: [e(0.05, 0, 0.5, 0.15, 40)] },
  { id: 'k', letter: 'k', label: 'Right elbow sliding out (prone)', regions: [e(-0.35, 0.2, 0.55, 0.18, -50)] },
  { id: 'l', letter: 'l', label: 'Butt too low on shoulder', regions: [e(0, 0.9, 0.3, 0.2, 0)] },
  { id: 'm', letter: 'm', label: 'Poor natural alignment', regions: [e(-0.4, 0.15, 0.45, 0.25, 0)] },
  { id: 'n', letter: 'n', label: 'Trigger finger poorly aligned', regions: [e(0, 0.05, 0.3, 0.15, 45)] },
  { id: 'o', letter: 'o', label: 'Poor trigger control, flinching due to distraction', regions: [c(0, 0, 0.17), c(0.5, 0.55, 0.15)] },
  { id: 'p', letter: 'p', label: 'Inconsistent breath control (prone), poor timing as rifle comes on target (standing)', regions: [e(0, 0, 0.2, 1.35, 0)] },
];

export function issueById(id: string): IssueOverlay | undefined {
  return ISSUE_OVERLAYS.find((issue) => issue.id === id);
}
