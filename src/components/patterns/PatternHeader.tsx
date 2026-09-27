import { Star } from 'lucide-react';

import { CardAction, CardHeader, CardTitle } from '@/components/ui/card';
import { PATTERN_VIEW_LABEL, type PatternView } from '@/lib/patterns/collect';
import { patternsScorePercent, type PatternSummary } from '@/lib/patterns/summarize';
import { renderPatternViewMark, VIEW_MARK_VIEWBOX } from '@/lib/render/diagram-marks';

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
 * REV-122: the Patterns drawing's own header, styled like one target card's — the view's mark and a star — an aggregate
 * of every shot shown, not one target's ten. The mark is the one a results card of that kind carries (issue #58): the
 * sight-in scatter, the confirm scope sight, or the prone / standing bar (REV-79, REV-86).
 */
export function PatternHeader({ view, kind, summary }: PatternHeaderProps) {
  const percent = patternsScorePercent(summary, kind);

  return (
    <CardHeader data-testid="patterns-header">
      <CardTitle className="flex items-center gap-2">
        <svg
          viewBox={VIEW_MARK_VIEWBOX}
          className="size-5 shrink-0"
          aria-hidden="true"
          data-testid="patterns-view-mark"
          data-view={view}
          dangerouslySetInnerHTML={{ __html: renderPatternViewMark(view) }}
        />
        <span>{PATTERN_VIEW_LABEL[view]}</span>
      </CardTitle>
      <CardAction>
        <ScoreStar percent={percent} />
      </CardAction>
    </CardHeader>
  );
}
