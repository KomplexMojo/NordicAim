import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Calibration } from '@/lib/domain/photo';

/** data-model §3: `axisRatio` is (0.3, 1]; M13 step 2 narrows the Adjust slider to 0.70-1.00. */
export const MIN_AXIS_RATIO = 0.7;
export const MAX_AXIS_RATIO = 1;
/** data-model §3: `angleDeg` is [0, 180); the slider stops at 179. */
export const MAX_ANGLE_DEG = 179;

interface AlignmentControlsProps {
  calibration: Calibration;
  onChange(calibration: Calibration): void;
}

function NumberField({
  id,
  label,
  value,
  step,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  step: number;
  onChange(value: number): void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        data-testid={id}
        className="h-11"
        type="number"
        inputMode="decimal"
        step={step}
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </div>
  );
}

/** M13 step 2 (Alignment): numeric cx/cy/radiusPx, plus the axis ratio and angle the ellipse needs. */
export function AlignmentControls({ calibration, onChange }: AlignmentControlsProps) {
  return (
    <div className="flex flex-col gap-3" data-testid="alignment-controls">
      <div className="grid grid-cols-3 gap-2">
        <NumberField
          id="cal-cx"
          label="Centre x (px)"
          value={calibration.cx}
          step={1}
          onChange={(cx) => onChange({ ...calibration, cx })}
        />
        <NumberField
          id="cal-cy"
          label="Centre y (px)"
          value={calibration.cy}
          step={1}
          onChange={(cy) => onChange({ ...calibration, cy })}
        />
        <NumberField
          id="cal-radius"
          label="Radius (px)"
          value={calibration.radiusPx}
          step={1}
          onChange={(radiusPx) => onChange({ ...calibration, radiusPx: Math.max(1, radiusPx) })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="cal-axis-ratio">Axis ratio {calibration.axisRatio.toFixed(2)}</Label>
        <input
          id="cal-axis-ratio"
          data-testid="cal-axis-ratio"
          className="h-11 w-full"
          type="range"
          min={MIN_AXIS_RATIO}
          max={MAX_AXIS_RATIO}
          step={0.01}
          value={calibration.axisRatio}
          onChange={(e) => onChange({ ...calibration, axisRatio: Number(e.target.value) })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="cal-angle">Angle {Math.round(calibration.angleDeg)}°</Label>
        <input
          id="cal-angle"
          data-testid="cal-angle"
          className="h-11 w-full"
          type="range"
          min={0}
          max={MAX_ANGLE_DEG}
          step={1}
          value={calibration.angleDeg}
          onChange={(e) => onChange({ ...calibration, angleDeg: Number(e.target.value) })}
        />
      </div>

      <p className="text-sm text-muted-foreground">
        Drag the yellow centre handle to move the target, and the handle on the ring edge to resize it.
      </p>
    </div>
  );
}
