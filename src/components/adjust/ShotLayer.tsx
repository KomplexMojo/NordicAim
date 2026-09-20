import type { Shot } from '@/lib/domain/analysis';
import type { Calibration } from '@/lib/domain/photo';
import { mmToPx } from '@/lib/geometry/transform';
import { TAG_RADIUS_CSS, tagOffsetCss } from '@/lib/ui/tag-offset';

/** M13 Pitfalls: "Hit radius for shots: 22 CSS px at the current zoom". */
export const SHOT_HIT_RADIUS_CSS = 22;

interface ShotLayerProps {
  shots: Shot[];
  calibration: Calibration;
  selectedId: string | null;
  /** CSS px per image px, so strokes and the hit target keep their on-screen size at any zoom. */
  scale: number;
  holeDiameterMm: number;
  /** `result.all.mpi`, drawn as a cross (M13 step 1). */
  mpiMm: { xMm: number; yMm: number } | null;
  /** Shots only accept taps in the Shots mode; the alignment handles own the pointer otherwise. */
  interactive: boolean;
  /** REV-96: the part of the image on screen, in image px, so the grab tag can flip to stay visible. */
  visible?: { x0: number; y0: number; x1: number; y1: number } | null;
}

/** M13 step 1: the shots and the MPI, drawn in image px over the working photo. */
export function ShotLayer({
  shots,
  calibration,
  selectedId,
  scale,
  holeDiameterMm,
  mpiMm,
  interactive,
  visible,
}: ShotLayerProps) {
  const pxPerMm = calibration.radiusPx / (calibration.anchorDiameterMm / 2);
  const holeRadius = (holeDiameterMm / 2) * pxPerMm;
  const hitRadius = SHOT_HIT_RADIUS_CSS / scale;
  const mpi = mpiMm === null ? null : mmToPx(mpiMm, calibration);
  const crossArm = 14 / scale;

  return (
    <g data-testid="shot-layer">
      {mpi !== null && (
        <g data-testid="mpi-marker" stroke="#F97316" strokeWidth={2 / scale}>
          <line x1={mpi.x - crossArm} y1={mpi.y} x2={mpi.x + crossArm} y2={mpi.y} />
          <line x1={mpi.x} y1={mpi.y - crossArm} x2={mpi.x} y2={mpi.y + crossArm} />
        </g>
      )}
      {shots.map((shot) => {
        const p = mmToPx(shot, calibration);
        const selected = shot.id === selectedId;
        return (
          <g key={shot.id} data-testid="shot" data-shot-id={shot.id} data-selected={selected ? 'true' : 'false'}>
            <circle
              cx={p.x}
              cy={p.y}
              r={holeRadius}
              fill="rgba(255,255,255,0.18)"
              stroke={selected ? '#FACC15' : '#22D3EE'}
              strokeWidth={(selected ? 3 : 2) / scale}
            />
            <circle cx={p.x} cy={p.y} r={1.5 / scale} fill={selected ? '#FACC15' : '#22D3EE'} />
            {shot.multiplicity > 1 && (
              <text
                x={p.x + holeRadius + 4 / scale}
                y={p.y - holeRadius}
                fontSize={16 / scale}
                fill="#FACC15"
                stroke="#0B1220"
                strokeWidth={0.5 / scale}
                paintOrder="stroke"
              >
                {`x${shot.multiplicity}`}
              </text>
            )}
            {interactive && (
              <circle cx={p.x} cy={p.y} r={hitRadius} fill="transparent" style={{ pointerEvents: 'auto' }} />
            )}
            {interactive && selected && (() => {
              // REV-96: a grab tag on a leader line, so the finger is clear of the hole being placed.
              const [dx, dy] = tagOffsetCss(p, scale, visible);
              const tx = p.x + dx / scale;
              const ty = p.y + dy / scale;
              const tr = TAG_RADIUS_CSS / scale;
              const len = Math.hypot(tx - p.x, ty - p.y);
              const ux = (tx - p.x) / len;
              const uy = (ty - p.y) / len;
              return (
                <g data-testid="shot-tag" data-tag-for={shot.id}>
                  <line
                    x1={p.x + ux * holeRadius}
                    y1={p.y + uy * holeRadius}
                    x2={tx - ux * tr}
                    y2={ty - uy * tr}
                    stroke="#FACC15"
                    strokeWidth={2 / scale}
                  />
                  <circle cx={tx} cy={ty} r={tr} fill="#FACC15" stroke="#0B1220" strokeWidth={1.5 / scale} style={{ pointerEvents: 'auto' }} />
                  <g stroke="#0B1220" strokeWidth={2 / scale} strokeLinecap="round">
                    <line x1={tx - tr * 0.45} y1={ty} x2={tx + tr * 0.45} y2={ty} />
                    <line x1={tx} y1={ty - tr * 0.45} x2={tx} y2={ty + tr * 0.45} />
                  </g>
                </g>
              );
            })()}
          </g>
        );
      })}
    </g>
  );
}
