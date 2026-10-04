import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import type { BackTo } from '@/lib/app/nav';
import { targetPath, type TargetRef } from '@/lib/patterns/pick';
import { sessionTimeLabel } from '@/lib/sessions/list-view';

/** `YYYY-MM-DD` -> `Sep 21`. */
function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

interface TargetLinksProps {
  refs: Array<Omit<TargetRef, 'shots'> & { shots?: number }>;
  /** Where the target screen's back link returns to: this Patterns or Analysis view. */
  from: BackTo;
  onClose(): void;
  testId: string;
}

/**
 * Issue #72 (REV-140): the targets behind a tapped point, each with **Open target**. Shown under the chart or drawing rather
 * than jumping straight there, so a tap on a crowded chart never opens the wrong target.
 */
export function TargetLinks({ refs, from, onClose, testId }: TargetLinksProps) {
  const box = useRef<HTMLDivElement>(null);
  // On a phone the panel can open below the fold: bring it into view each time a tap fills it.
  useEffect(() => {
    box.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [refs]);
  // One compact row per target: its date and time (details under it, small), Open target, and a close cross at the top right.
  return (
    <div
      ref={box}
      className="flex items-start gap-1 rounded-md border bg-muted/40 py-1 pl-3 pr-1 text-sm"
      data-testid={testId}
      role="group"
      aria-label="Targets under this point"
    >
      {refs.length === 0 ? (
        <p className="flex min-h-11 flex-1 items-center text-muted-foreground">No shot there. Tap a dot to open its target.</p>
      ) : (
        <ul className="flex flex-1 flex-col divide-y">
          {refs.map((ref, i) => {
            const details = [
              refs.length > 1 ? `target ${i + 1}` : null,
              ref.shots !== undefined ? `${ref.shots} ${ref.shots === 1 ? 'shot' : 'shots'} here` : null,
            ].filter((d): d is string => d !== null);
            return (
              <li key={ref.photoId} className="flex min-h-11 items-center justify-between gap-2 py-1">
                <span className="flex flex-col leading-tight">
                  <span className="font-medium">
                    {shortDate(ref.sessionDate)} · {sessionTimeLabel({ createdAt: ref.sessionStamp })}
                  </span>
                  {details.length > 0 && <span className="text-xs text-muted-foreground">{details.join(' · ')}</span>}
                </span>
                <Button asChild variant="outline" className="h-11 shrink-0 px-3">
                  <Link to={targetPath(ref)} state={{ from }} data-testid={`${testId}-open`}>
                    Open target
                  </Link>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <Button
        variant="ghost"
        className="size-11 shrink-0 p-0 text-muted-foreground"
        onClick={onClose}
        aria-label="Close"
        data-testid={`${testId}-close`}
      >
        <X className="size-5" aria-hidden="true" />
      </Button>
    </div>
  );
}
