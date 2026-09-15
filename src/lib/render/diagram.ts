// rendering-composite.md §3. `renderDiagramSvg`, the single entry point dispatching to the per-template
// renderer for either variant.

import type { AnalysisResult, Shot } from '../domain/analysis';
import type { Lighting } from '../domain/enums';
import { renderPrecisionDiagram } from './diagram-precision';
import { renderSightingDiagram } from './diagram-sighting';

export interface DiagramInput {
  template: 'sighting' | 'precision';
  result: AnalysisResult;
  shots: Shot[];
  positionLabel: string; // "Prone" | "Standing" | "Prone + standing"
  captureLocal: string | null; // "2026-09-05T16:56:03"
  lighting: Lighting;
  holeDiameterMm: number;
}

export type DiagramVariant = 'full' | 'cell';

export function renderDiagramSvg(input: DiagramInput, variant: DiagramVariant, slotLabel?: string): string {
  return input.template === 'precision'
    ? renderPrecisionDiagram(input, variant, slotLabel)
    : renderSightingDiagram(input, variant, slotLabel);
}
