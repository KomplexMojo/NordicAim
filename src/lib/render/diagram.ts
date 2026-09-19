// rendering-composite.md §3. `renderDiagramSvg`, the single entry point dispatching to the per-template
// renderer for either variant.

import type { AnalysisResult, Shot } from '../domain/analysis';
import type { Lighting } from '../domain/enums';
import { renderBlankPrecisionCell, renderPrecisionDiagram } from './diagram-precision';
import { renderBlankSightingCell, renderSightingDiagram } from './diagram-sighting';

export interface DiagramInput {
  template: 'sighting' | 'precision';
  result: AnalysisResult;
  shots: Shot[];
  positionLabel: string; // "Prone" | "Standing" | "Prone + standing"
  captureLocal: string | null; // "2026-09-05T16:56:03"
  lighting: Lighting;
  holeDiameterMm: number;
  /**
   * rendering-composite.md §4 (REV-52): the `cell` variant's scale, when the caller sets it. The summary
   * image gives every cell the same one so its targets can be compared by eye; a standalone cell (a result
   * card's thumbnail) leaves it undefined and fits itself.
   */
  cellScaleOverride?: number;
}

export type DiagramVariant = 'full' | 'cell';

export function renderDiagramSvg(input: DiagramInput, variant: DiagramVariant, slotLabel?: string): string {
  return input.template === 'precision'
    ? renderPrecisionDiagram(input, variant, slotLabel)
    : renderSightingDiagram(input, variant, slotLabel);
}

/** rendering-composite.md §5 (REV-51): an empty slot's cell — the template alone, faded, captioned "No target". */
export function renderBlankCellSvg(template: 'sighting' | 'precision', slotLabel: string, scale?: number): string {
  return template === 'precision' ? renderBlankPrecisionCell(slotLabel, scale) : renderBlankSightingCell(slotLabel, scale);
}
