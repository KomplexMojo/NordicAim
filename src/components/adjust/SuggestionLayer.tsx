import type { Calibration } from '@/lib/domain/photo';
import { mmToPx } from '@/lib/geometry/transform';

import { SHOT_HIT_RADIUS_CSS } from './ShotLayer';

/** One suggested hole on screen: its position in target mm and a key that is stable while it shows. */
export interface ScreenSuggestion {
  id: string;
  xMm: number;
  yMm: number;
}

interface SuggestionLayerProps {
  suggestions: ScreenSuggestion[];
  calibration: Calibration;
  /** CSS px per image px, so strokes and the hit target keep their on-screen size at any zoom. */
  scale: number;
  holeDiameterMm: number;
  /** Suggestions only accept taps in the Shots mode. */
  interactive: boolean;
}

/** Drawn a little larger than a hole, so the dashed ring sits around the mark rather than on it. */
const RING_FACTOR = 1.35;

/**
 * M21 step 2 (REV-40): the holes the app was unsure about, drawn in image px (`mmToPx`) as hollow
 * dashed rings — no fill, no centre dot, no number, a colour no shot uses — so nothing here reads as a
 * shot the app already counted. The stage turns a tap on one into a manual shot.
 */
export function SuggestionLayer({ suggestions, calibration, scale, holeDiameterMm, interactive }: SuggestionLayerProps) {
  if (suggestions.length === 0) return null;
  const pxPerMm = calibration.radiusPx / (calibration.anchorDiameterMm / 2);
  const ring = (holeDiameterMm / 2) * pxPerMm * RING_FACTOR;
  const hitRadius = SHOT_HIT_RADIUS_CSS / scale;
  const dash = 4 / scale;

  return (
    <g data-testid="suggestion-layer">
      {suggestions.map((suggestion) => {
        const p = mmToPx(suggestion, calibration);
        return (
          <g key={suggestion.id} data-testid="suggested-hole" data-suggestion-id={suggestion.id}>
            <title>Suggested hole — tap to count it</title>
            <circle
              cx={p.x}
              cy={p.y}
              r={ring}
              fill="none"
              stroke="#F0ABFC"
              strokeWidth={2 / scale}
              strokeDasharray={`${dash} ${dash}`}
            />
            {interactive && (
              <circle cx={p.x} cy={p.y} r={Math.max(hitRadius, ring)} fill="transparent" style={{ pointerEvents: 'auto' }} />
            )}
          </g>
        );
      })}
    </g>
  );
}
