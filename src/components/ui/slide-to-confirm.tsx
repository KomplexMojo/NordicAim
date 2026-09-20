import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

import { atEnd, SLIDE_HOLD_MS, slideFraction } from '@/lib/ui/slide';
import { cn } from '@/lib/utils';

interface SlideToConfirmProps {
  /** Runs once the handle has been slid to the trash and held there. */
  onConfirm(): void;
  disabled?: boolean;
  label: string;
}

const HANDLE_PX = 56;

/**
 * REV-75: confirm a destructive action by a deliberate gesture instead of typing. Put a finger on the handle, slide it to the
 * trash can at the far end and **hold** it there; letting go earlier, or sliding back, cancels. Keyboard and screen-reader
 * users hold Enter or Space on the handle for the same time. Nothing happens on a tap.
 */
export function SlideToConfirm({ onConfirm, disabled = false, label }: SlideToConfirmProps) {
  const track = useRef<HTMLDivElement>(null);
  const grab = useRef(0);
  const dragging = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fraction, setFraction] = useState(0);
  const [holding, setHolding] = useState(false);
  const [done, setDone] = useState(false);
  const [active, setActive] = useState(false);

  function stopHold() {
    if (holdTimer.current !== null) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setHolding(false);
  }

  function startHold() {
    if (holdTimer.current !== null || done) return;
    setHolding(true);
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      setHolding(false);
      setDone(true);
      onConfirm();
    }, SLIDE_HOLD_MS);
  }

  useEffect(() => () => stopHold(), []);

  function move(clientX: number) {
    const el = track.current;
    if (el === null || !dragging.current) return;
    const rect = el.getBoundingClientRect();
    const next = slideFraction(clientX, grab.current, rect.left, rect.width, HANDLE_PX);
    setFraction(next);
    if (atEnd(next)) startHold();
    else stopHold();
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (disabled || done) return;
    dragging.current = true;
    setActive(true);
    grab.current = e.clientX - e.currentTarget.getBoundingClientRect().left;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function release() {
    dragging.current = false;
    setActive(false);
    if (!done) {
      stopHold();
      setFraction(0);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (disabled || done || e.repeat || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    setFraction(1);
    startHold();
  }

  function onKeyUp(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    release();
  }

  const state = done ? 'done' : holding ? 'holding' : fraction > 0 ? 'sliding' : 'idle';
  return (
    <div
      ref={track}
      className={cn(
        'relative h-14 w-full select-none overflow-hidden rounded-full border border-destructive/50 bg-destructive/10',
        disabled && 'opacity-50',
      )}
      data-testid="slide-to-delete"
      data-state={state}
    >
      {/* The hold: fills across the track while the handle waits at the trash. */}
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-destructive/40"
        style={{ width: holding ? '100%' : `${fraction * 100}%`, transition: holding ? `width ${SLIDE_HOLD_MS}ms linear` : 'none' }}
        aria-hidden="true"
      />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center pl-12 pr-14 text-center text-sm font-medium text-destructive">
        {done ? 'Deleting…' : label}
      </span>
      <Trash2 className="pointer-events-none absolute right-4 top-1/2 size-6 -translate-y-1/2 text-destructive" aria-hidden="true" />
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={`${label}. With a keyboard, hold Enter or Space for one second.`}
        aria-disabled={disabled || done}
        data-testid="slide-handle"
        className="absolute top-1 flex size-12 touch-none cursor-grab items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow"
        style={{
          left: `calc(4px + ${fraction} * (100% - ${HANDLE_PX}px))`,
          transition: active ? 'none' : 'left 150ms ease-out',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => move(e.clientX)}
        onPointerUp={release}
        onPointerCancel={release}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
      >
        <span aria-hidden="true" className="text-lg">
          ›
        </span>
      </div>
    </div>
  );
}
