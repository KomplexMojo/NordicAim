// rendering-composite.md §5-§6: the summary image's input types, renderer version and credit, its four fixed cell positions and
// their names, and the small text helpers. Split out of `composite.ts` (issue #24); pure.

import type { AnalysisResult, TargetAnalysis } from '@/lib/domain/analysis';
import type { Position } from '@/lib/domain/enums';
import type { TargetPhoto } from '@/lib/domain/photo';
import type { BiathlonSession } from '@/lib/domain/session';
import type { ScoringRule } from '@/lib/domain/settings';
import type { SessionGoalChecks } from '@/lib/goals/session';
import type { MetalBoutRow, WindBadge } from '@/lib/domain/coach-context-view';

export interface SlotData {
  photo: TargetPhoto;
  analysis: TargetAnalysis;
  /** The result under the scoring rule in force (`CompositeInput.scoring`). */
  result: AnalysisResult;
  /**
   * REV-59: the same shots scored under every rule, for the band's comparison. Optional: without it the band
   * names the rule but shows no comparison.
   */
  byRule?: Record<ScoringRule, AnalysisResult>;
}

export interface CompositeInput {
  session: BiathlonSession;
  slots: { sighting: [SlotData | null, SlotData | null]; precision: [SlotData | null, SlotData | null] };
  generatedAtLocal: string; // "2026-09-05 17:20"
  /** REV-69: the build (git short SHA) that drew the image; printed in the footer of every summary. */
  release: string;
  holeDiameterMm: number;
  /** REV-59: the scoring rule the results were computed under, and the visible-hole size it may use. */
  scoring: { rule: ScoringRule; visibleHoleDiameterMm: number };
  /**
   * §5's line 3 ("+<n> more target(s) in the app") needs the count of `analyzed` candidates beyond the
   * four slots — information `selectDefaultSlots` sees but a `CompositeInput` built from only the
   * selected slots cannot recover on its own. `composite/build.ts` computes it; see the milestone's
   * Open questions for this addition to the documented `CompositeInput` shape.
   */
  moreCount: number;
  /** REV-100: the athlete's identity line and, when a key is set, the stamp. Omitted when there is nothing to print. */
  provenance?: { name: string; club: string; stamp: string | null };
  /** REV-148: whether the session met the goals in effect when it was created (`sessionGoalChecks`); omitted for none. */
  goals?: SessionGoalChecks;
  /**
   * M29 (REV-159, coach-context-import.md §6): the session's attached 545 Coach context — the windage badge (null: none) and one
   * row per metal bout. Omitted when nothing is attached, and the image is then byte-identical to one drawn before M29.
   */
  coach?: { wind: WindBadge | null; metal: MetalBoutRow[] };
}

/**
 * rendering-composite.md §6: bumped whenever this renderer's output changes (REV-51 layout, REV-52 shared
 * scale, REV-53 position names, REV-54 the credit stamp, REV-58 one fixed scale, REV-59 the scoring method, REV-137 the brighter group ellipse). A stored artifact drawn by an older version is rebuilt when its session's
 * results screen is opened, so an app update is never invisible in the summary image.
 */
export const COMPOSITE_RENDERER_VERSION = 22; // 22: REV-159 545 Coach windage badge and metal rows; 21: REV-154 maple-leaf fall badge; 20: REV-148 goal seal and band rows

/** §5: the credit stamped on every shared image — the app, and who made it (owner, 2026-09-19). */
export const APP_NAME = 'NordicAim';
export const DEVELOPER_NAME = 'KomplexMojo';
/** REV-69: the footer writes the app's name as one word. */
export const FOOTER_APP_NAME = 'NordicAim';

export const WIDTH = 1440;
export const HEADER_HEIGHT = 120;
const MAX_LINE_CHARS = 110;

/** §5 (REV-51): one of the four fixed positions, its offset within the grid, and its drawn size. */
export interface CellPlacement {
  template: 'sighting' | 'precision';
  index: 0 | 1;
  x: number;
  y: number;
  size: number;
}

/**
 * §5 (REV-51, owner: "keep a blank template slot for each of the 4 targets"): always four positions —
 * sighting 1 and 2 on the top row, precision 1 and 2 below. An empty position shows its blank template,
 * so every summary has the same shape and a target is always found in the same place.
 */
export const COMPOSITE_CELLS: readonly CellPlacement[] = [
  { template: 'sighting', index: 0, x: 0, y: 0, size: 720 },
  { template: 'sighting', index: 1, x: 720, y: 0, size: 720 },
  { template: 'precision', index: 0, x: 0, y: 720, size: 720 },
  { template: 'precision', index: 1, x: 720, y: 720, size: 720 },
];
export const COMPOSITE_GRID_HEIGHT = 1440;

/**
 * §5 (REV-53). How a session actually runs, in the owner's words: "you sight in on one target and then you
 * confirm on a second target". So the two sighting positions are **Sight in** and **Confirm** rather than
 * "Sighting 1" and "Sighting 2"; the precision positions stay numbered. Slot 1 is the earlier target
 * (selection orders them chronologically), which is the one sighted in on.
 */
export function positionName(template: 'sighting' | 'precision', index: 0 | 1): string {
  if (template === 'sighting') return index === 0 ? 'Sight in' : 'Confirm';
  return index === 0 ? 'Precision prone' : 'Precision standing';
}

export function capitalize(value: string): string {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1);
}

export function truncate(value: string, max = MAX_LINE_CHARS): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/** §3's `DiagramInput.positionLabel` ("Prone" | "Standing"), duplicated here (not imported from `pipeline/stage-b.ts`) so this
 * pure render module stays free of the pipeline layer. */
export function fullPositionLabel(position: Position): string {
  return position === 'prone' ? 'Prone' : 'Standing';
}
