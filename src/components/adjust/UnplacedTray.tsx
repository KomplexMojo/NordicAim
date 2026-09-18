import { useRef, useState } from 'react';

interface UnplacedTrayProps {
  /** How many declared rounds have no hole yet (derived; never stored — M17 step 1). */
  count: number;
  /**
   * Called when a marker is let go. `client` is the viewport point the finger lifted at; the caller
   * decides whether that landed on the image and, if so, adds the shot there.
   */
  onPlace(client: { x: number; y: number }): void;
}

interface DragState {
  index: number;
  client: { x: number; y: number };
}

/** The marker's on-screen diameter; also the tap target, so it clears the 44 px minimum. */
const MARKER_PX = 44;

function Marker({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border-2 border-[#22D3EE] bg-white/20 text-sm font-semibold text-[#22D3EE] ${className ?? ''}`}
      style={{ width: MARKER_PX, height: MARKER_PX }}
    >
      {label}
    </span>
  );
}

/**
 * M17 step 1 (REV-29). One parked marker per round that was fired but has no hole on the diagram
 * yet, in a tray beside the target. Drag one onto the photo to place that shot; drag a placed shot
 * back here to remove it.
 *
 * The count is **derived** (`declaredRounds - identified units`) and never stored, so the tray
 * shrinks by itself as soon as the shot exists, and the pipeline has nothing here to overwrite
 * (analysis-pipeline §8). When nothing is unplaced the tray renders nothing at all.
 */
export function UnplacedTray({ count, onPlace }: UnplacedTrayProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragging = useRef<number | null>(null);

  if (count <= 0) return null;

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>, index: number) {
    e.preventDefault();
    dragging.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ index, client: { x: e.clientX, y: e.clientY } });
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (dragging.current !== e.pointerId) return;
    setDrag((current) => (current === null ? null : { ...current, client: { x: e.clientX, y: e.clientY } }));
  }

  function onPointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    if (dragging.current !== e.pointerId) return;
    dragging.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setDrag(null);
    onPlace({ x: e.clientX, y: e.clientY });
  }

  return (
    <div
      data-testid="unplaced-tray"
      data-unplaced-tray=""
      data-count={count}
      className="flex shrink-0 flex-col items-center gap-2 rounded-lg border border-dashed border-border p-1"
      aria-label={`${count} round(s) not placed yet`}
    >
      <span className="text-center text-[10px] leading-tight text-muted-foreground">Not placed</span>
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          data-testid="unplaced-marker"
          data-index={i}
          className="touch-none select-none"
          title={`Round ${i + 1}: drag onto the hole it made`}
          onPointerDown={(e) => onPointerDown(e, i)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <Marker label={String(i + 1)} />
        </button>
      ))}
      {drag !== null && (
        <span
          data-testid="unplaced-ghost"
          className="pointer-events-none fixed z-50"
          style={{ left: drag.client.x - MARKER_PX / 2, top: drag.client.y - MARKER_PX / 2 }}
        >
          <Marker label={String(drag.index + 1)} className="opacity-80 shadow-lg" />
        </span>
      )}
    </div>
  );
}
