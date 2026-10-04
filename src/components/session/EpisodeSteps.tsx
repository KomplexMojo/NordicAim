import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

const STEPS = ['Photograph', 'Confirm', 'Results'] as const;

/**
 * Issue #78 (REV-15's three steps): where this screen sits in a session — Photograph → Confirm → Results. Shown on the metadata
 * (step 2) and results (step 3) screens; capture stays full-screen without it. Steps before the current one read as done. Not
 * interactive: each screen keeps its own way back and forward.
 */
export function EpisodeSteps({ current }: { current: 2 | 3 }) {
  return (
    <ol className="flex items-center gap-1 text-xs" aria-label="Session steps" data-testid="episode-steps" data-current={current}>
      {STEPS.map((label, i) => {
        const step = i + 1;
        const done = step < current;
        const here = step === current;
        return (
          <li key={label} className="flex flex-1 items-center gap-1" aria-current={here ? 'step' : undefined} data-step={step} data-done={done}>
            <span
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold',
                here && 'border-primary bg-primary text-primary-foreground',
                done && 'border-primary text-primary',
                !here && !done && 'border-border text-muted-foreground',
              )}
              aria-hidden="true"
            >
              {done ? <Check className="size-3" /> : step}
            </span>
            <span className={cn(here ? 'font-semibold' : done ? 'text-foreground' : 'text-muted-foreground')}>
              {label}
              {done && <span className="sr-only"> (done)</span>}
            </span>
            {step < STEPS.length && <span className="mx-1 h-px flex-1 bg-border" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
