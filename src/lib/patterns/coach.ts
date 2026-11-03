// patterns.md §7 (REV-163): the numbers behind the Patterns coach image. Per view, over the shots the screen shows: the
// summary (§4), the observed patterns of the whole set as one group (REV-88), how a typical single target's group compares
// with all the shots together, and how many targets showed each potential issue. Pure: no clock, no storage.

import { characterize, ISSUE_IDS, type Characteristics, type Handedness } from '../scoring/characteristics';
import { angular, extremeSpread } from '../scoring/groups';

import { PATTERN_VIEWS, type PatternPoint, type PatternView } from './collect';
import { summarizePatterns, type PatternSummary } from './summarize';

const DISTANCE_MM = 50_000;

export interface PatternsCoachIssue {
  id: string;
  label: string;
  /** Targets in the range whose own shots show it. */
  targets: number;
  /** Whether all the shots together, as one group (the screen's Observed patterns), show it. */
  wholeSet: boolean;
}

export interface PatternsCoachView {
  view: PatternView;
  kind: 'precision' | 'sighting';
  points: PatternPoint[];
  summary: PatternSummary;
  /** The whole set as one group, as the screen's Observed patterns panel works it out. */
  characteristics: Characteristics;
  /** Targets with enough shots to be tested for issues (`THRESHOLDS.minShots`): what the issue counts are out of. */
  targetsTested: number;
  /** The median of each target's own group size (extreme spread, MOA at 50 m), over targets with two distinct shots. */
  typicalTargetMoa: number | null;
  /** Targets with a group size, the ones `typicalTargetMoa` is the median of. */
  targetsSized: number;
  /** Every issue seen on a target or on the whole set: most targets first; ties in rule order (`ISSUE_IDS`). */
  issues: PatternsCoachIssue[];
}

export interface PatternsCoachOptions {
  handedness: Handedness;
  holeDiameterMm: number;
}

export function viewKind(view: PatternView): 'precision' | 'sighting' {
  return view.startsWith('precision') ? 'precision' : 'sighting';
}

/** The position the issue rules and the hit zone read for a view, as on the Patterns screen (sighting reads prone). */
export function viewPosition(view: PatternView): 'prone' | 'standing' {
  return view === 'precision-standing' ? 'standing' : 'prone';
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** §7: one view's numbers. `points` are already filtered (season, then range). */
export function patternsCoachView(view: PatternView, points: PatternPoint[], options: PatternsCoachOptions): PatternsCoachView {
  const kind = viewKind(view);
  const position = viewPosition(view);
  const characterizeOptions = { handedness: options.handedness, position, holeDiameterMm: options.holeDiameterMm };
  const summary = summarizePatterns(points, kind);
  const characteristics = characterize(points, characterizeOptions);

  const byTarget = new Map<string, PatternPoint[]>();
  for (const p of points) byTarget.set(p.photoId, [...(byTarget.get(p.photoId) ?? []), p]);

  const sizes: number[] = [];
  let targetsTested = 0;
  // How many targets show each issue.
  const seen = new Map<string, PatternsCoachIssue>();
  for (const shots of byTarget.values()) {
    const moa = angular(extremeSpread(shots), DISTANCE_MM)?.moa;
    if (moa !== undefined) sizes.push(moa);
    const own = characterize(shots, characterizeOptions);
    if (!own.enough) continue;
    targetsTested += 1;
    for (const issue of own.issues) {
      const entry = seen.get(issue.id) ?? { id: issue.id, label: issue.label, targets: 0, wholeSet: false };
      entry.targets += 1;
      seen.set(issue.id, entry);
    }
  }
  for (const issue of characteristics.issues) {
    const entry = seen.get(issue.id) ?? { id: issue.id, label: issue.label, targets: 0, wholeSet: false };
    entry.wholeSet = true;
    seen.set(issue.id, entry);
  }
  const rank = (id: string) => {
    const i = (ISSUE_IDS as readonly string[]).indexOf(id);
    return i === -1 ? ISSUE_IDS.length : i;
  };
  // Most targets first; ties (and the whole set's own, at 0 targets) in rule order.
  const issues = [...seen.values()].sort((a, b) => b.targets - a.targets || rank(a.id) - rank(b.id));

  return {
    view,
    kind,
    points,
    summary,
    characteristics,
    targetsTested,
    typicalTargetMoa: median(sizes),
    targetsSized: sizes.length,
    issues,
  };
}

/** §7: every view, in the Analysis coach image's order. */
export function patternsCoach(pointsByView: Record<PatternView, PatternPoint[]>, options: PatternsCoachOptions): PatternsCoachView[] {
  return PATTERN_VIEWS.map((view) => patternsCoachView(view, pointsByView[view], options));
}
