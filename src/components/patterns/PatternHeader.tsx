import { Crosshair, PersonStanding, Star, Target as TargetIcon } from 'lucide-react';

import { CardAction, CardHeader, CardTitle } from '@/components/ui/card';
import { PATTERN_VIEW_LABEL, type PatternView } from '@/lib/patterns/collect';
import { patternsScorePercent, type PatternSummary } from '@/lib/patterns/summarize';

/** One star, partly filled to `percent` by clipping a solid copy over a faint outline copy. */
function ScoreStar({ percent }: { percent: number | null }) {
  if (percent === null) return null;
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <div className="flex items-center gap-1.5" data-testid="patterns-score" aria-label={`Score ${pct} percent`}>
      <div className="relative size-5 shrink-0" aria-hidden="true">
        <Star className="absolute inset-0 size-5 text-muted-foreground/30" />
        <div className="absolute inset-0 overflow-hidden" style={{ width: `${pct}%` }}>
          <Star className="size-5 text-primary" fill="currentColor" />
        </div>
      </div>
      <span className="text-sm font-medium tabular-nums">{pct}%</span>
    </div>
  );
}

interface PatternHeaderProps {
  view: PatternView;
  kind: 'precision' | 'sighting';
  summary: PatternSummary;
}

/**
 * REV-121: the Patterns drawing's own header, styled like one target card's (an icon for how it is
 * scored, an icon for the position, a star) — an aggregate of every shot shown, not one target's ten.
 * Sight in and confirm mix prone and standing across sessions, so they show no position icon; the two
 * precision views are each a fixed position, so they do.
 */
export function PatternHeader({ view, kind, summary }: PatternHeaderProps) {
  const TypeIcon = kind === 'precision' ? TargetIcon : Crosshair;
  const position = view === 'precision-prone' ? 'prone' : view === 'precision-standing' ? 'standing' : null;
  const percent = patternsScorePercent(summary, kind);

  return (
    <CardHeader data-testid="patterns-header">
      <CardTitle className="flex items-center gap-2">
        <TypeIcon
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
          data-testid="patterns-type-icon"
        />
        {position !== null && (
          <PersonStanding
            className={`size-4 shrink-0 text-muted-foreground ${position === 'prone' ? '-rotate-90' : ''}`}
            aria-hidden="true"
            data-testid="patterns-position-icon"
            data-position={position}
          />
        )}
        <span>{PATTERN_VIEW_LABEL[view]}</span>
      </CardTitle>
      <CardAction>
        <ScoreStar percent={percent} />
      </CardAction>
    </CardHeader>
  );
}
