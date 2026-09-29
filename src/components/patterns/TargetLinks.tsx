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
  return (
    <div ref={box} className="flex flex-col gap-2 rounded-md border bg-muted/40 p-3 text-sm" data-testid={testId} role="group" aria-label="Targets under this point">
      {refs.length === 0 ? (
        <p className="text-muted-foreground">No shot there. Tap a dot to open its target.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {refs.map((ref, i) => (
            <li key={ref.photoId} className="flex items-center justify-between gap-2">
              <span>
                {shortDate(ref.sessionDate)} · {sessionTimeLabel({ createdAt: ref.sessionStamp })}
                {refs.length > 1 && <span className="text-muted-foreground"> · target {i + 1}</span>}
                {ref.shots !== undefined && (
                  <span className="text-muted-foreground">
                    {' '}
                    · {ref.shots} {ref.shots === 1 ? 'shot' : 'shots'} here
                  </span>
                )}
              </span>
              <Button asChild variant="outline" className="h-11 shrink-0">
                <Link to={targetPath(ref)} state={{ from }} data-testid={`${testId}-open`}>
                  Open target
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="ghost" className="h-11 self-end" onClick={onClose} data-testid={`${testId}-close`}>
        Close
      </Button>
    </div>
  );
}
