import type { Size, FitTransform } from '@/lib/capture/overlay';
import type { Shot } from '@/lib/domain/analysis';
import type { Calibration } from '@/lib/domain/photo';
import { polylineAttr, type templateRingPolylines } from '@/lib/geometry/rings';

import { ShotLayer } from './ShotLayer';
import { SuggestionLayer, type ScreenSuggestion } from './SuggestionLayer';

interface StageLayersProps {
  image: Size;
  base: FitTransform;
  imageUrl: string | null;
  diagram: { svg: string; clipPath: string; opacity: number; boundaryFraction: number; showHandle: boolean } | null;
  rings: ReturnType<typeof templateRingPolylines>;
  scale: number;
  suggestions: ScreenSuggestion[];
  calibration: Calibration;
  holeDiameterMm: number;
  mode: 'shots' | 'alignment';
  shots: Shot[];
  selectedShotId: string | null;
  mpiMm: { xMm: number; yMm: number } | null;
  visible: { x0: number; y0: number; x1: number; y1: number } | null;
  anchorEdge: { x: number; y: number };
  handleRadius: number;
}

/**
 * M13 step 1, REV-78/95/119: what the Adjust stage draws, in the photo's own pixels — the photo, the diagram overlay and its wipe
 * handle, the reference rings, the suggestions, shots and MPI, and the alignment handles. Pure drawing; `ImageStage` owns the
 * zoom, pan and gestures. Split out of `ImageStage.tsx` (issue #24).
 */
export function StageLayers({
  image,
  base,
  imageUrl,
  diagram,
  rings,
  scale,
  suggestions,
  calibration,
  holeDiameterMm,
  mode,
  shots,
  selectedShotId,
  mpiMm,
  visible,
  anchorEdge,
  handleRadius,
}: StageLayersProps) {
  // Aligning needs the rings in full view, so the slider governs them only while placing shots.
  const blended = diagram != null && mode === 'shots';
  const markersHidden = blended && (diagram.opacity <= 0.02 || diagram.boundaryFraction <= 0.001);
  return (
    <div
      className="absolute"
      style={{ left: base.ox, top: base.oy, width: image.w * base.k, height: image.h * base.k }}
    >
      {imageUrl !== null && (
        <img
          src={imageUrl}
          alt="The photo of this target"
          className="block size-full"
          data-testid="compare-photo"
          draggable={false}
        />
      )}
      {diagram != null && (
        <>
          <div
            className="pointer-events-none absolute inset-0 [&>svg]:size-full"
            data-testid="compare-overlay"
            data-clip-path={diagram.clipPath}
            data-opacity={diagram.opacity}
            style={{ clipPath: diagram.clipPath, opacity: diagram.opacity }}
            dangerouslySetInnerHTML={{ __html: diagram.svg }}
          />
          {diagram.showHandle && (
            <div
              className="pointer-events-none absolute inset-y-0 w-[2px] bg-white/80"
              data-testid="compare-handle"
              style={{ left: `${diagram.boundaryFraction * 100}%` }}
            />
          )}
        </>
      )}
      {/* REV-95: the reference rings follow the Diagram ↔ Photo slider like the diagram layer does; the shot markers and the
          alignment handles below are editing controls and always stay. */}
      <svg
        viewBox={`0 0 ${image.w} ${image.h}`}
        className="pointer-events-none absolute inset-0 size-full"
        data-testid="stage-rings"
        data-clip-path={blended ? diagram.clipPath : 'none'}
        data-opacity={blended ? diagram.opacity : 1}
        style={blended ? { clipPath: diagram.clipPath, opacity: diagram.opacity } : undefined}
      >
        {rings.map((ring) => (
          <polygon
            key={`${ring.style}-${ring.diameterMm}`}
            data-testid="ring-polyline"
            data-diameter-mm={ring.diameterMm}
            points={polylineAttr(ring.points)}
            fill="none"
            stroke={ring.style === 'anchor' ? '#FFFFFF' : '#67E8F9'}
            strokeWidth={(ring.style === 'anchor' ? 2.5 : 1.5) / scale}
            strokeDasharray={ring.style === 'guide' ? `${6 / scale} ${6 / scale}` : undefined}
            opacity={0.85}
          />
        ))}
      </svg>
      <svg
        viewBox={`0 0 ${image.w} ${image.h}`}
        className="absolute inset-0 size-full"
        // REV-119: the shot markers, the MPI and the suggestions follow the sliders too, so sliding to the bare photo shows the
        // holes with nothing drawn on them. When nothing of them is showing they cannot be hit either (a tap then adds a shot).
        style={{
          pointerEvents: 'none',
          ...(blended ? { clipPath: diagram.clipPath, opacity: diagram.opacity, visibility: markersHidden ? 'hidden' : 'visible' } : {}),
        }}
        data-testid="stage-overlay"
        data-clip-path={blended ? diagram.clipPath : 'none'}
        data-opacity={blended ? diagram.opacity : 1}
      >
        {/* M21 step 2: under the shots, so a real shot always wins the tap. */}
        <SuggestionLayer
          suggestions={suggestions}
          calibration={calibration}
          scale={scale}
          holeDiameterMm={holeDiameterMm}
          interactive={mode === 'shots'}
        />
        <ShotLayer
          shots={shots}
          calibration={calibration}
          selectedId={selectedShotId}
          scale={scale}
          holeDiameterMm={holeDiameterMm}
          mpiMm={mpiMm}
          interactive={mode === 'shots'}
          visible={visible}
        />
      </svg>
      <svg viewBox={`0 0 ${image.w} ${image.h}`} className="absolute inset-0 size-full" style={{ pointerEvents: 'none' }} data-testid="stage-handles">
        {mode === 'alignment' && (
          <g data-testid="alignment-handles">
            <circle
              data-handle="centre"
              cx={calibration.cx}
              cy={calibration.cy}
              r={handleRadius}
              fill="rgba(250,204,21,0.25)"
              stroke="#FACC15"
              strokeWidth={2 / scale}
              style={{ pointerEvents: 'auto' }}
            />
            <circle
              data-handle="radius"
              cx={anchorEdge.x}
              cy={anchorEdge.y}
              r={handleRadius}
              fill="rgba(250,204,21,0.25)"
              stroke="#FACC15"
              strokeWidth={2 / scale}
              style={{ pointerEvents: 'auto' }}
            />
          </g>
        )}
      </svg>
    </div>
  );
}
