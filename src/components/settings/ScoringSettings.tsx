import { useState, type ReactNode } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DEFAULT_VISIBLE_HOLE_DIAMETER_MM,
  MAX_VISIBLE_HOLE_DIAMETER_MM,
  MIN_VISIBLE_HOLE_DIAMETER_MM,
  SCORING_RULE_LABEL,
  ScoringRule,
  isValidVisibleHoleDiameterMm,
} from '@/lib/domain/settings';

interface ScoringSettingsProps {
  scoringRule: ScoringRule;
  visibleHoleDiameterMm: number;
  onRuleChange(next: ScoringRule): void;
  onVisibleSizeChange(mm: number): void;
  /** The physical hole diameter control, shown between the rules and the visible size. */
  children?: ReactNode;
}

/** One line each: what the rule does, in words a shooter uses (REV-56). */
const RULES: ReadonlyArray<{ value: ScoringRule; label: string; blurb: string }> = [
  {
    value: 'gauge',
    label: SCORING_RULE_LABEL.gauge,
    blurb: 'A shot scores the higher ring if its whole hole touches the line, as the official gauge does.',
  },
  {
    value: 'centre',
    label: SCORING_RULE_LABEL.centre,
    blurb: 'Only the centre of the hole counts. Stricter: touching a line is not enough.',
  },
  {
    value: 'visible',
    label: SCORING_RULE_LABEL.visible,
    blurb: 'Like gauge, but using the smaller hole you can actually see on the paper.',
  },
];

/**
 * geometry-scoring.md §3 (REV-56): the Settings screen's **Scoring** section. The rule applies to every
 * session, **including past ones** — it changes how the same shots are read, so changing it re-scores
 * everything stored. Shots and alignment are never touched.
 */
export function ScoringSettings({ scoringRule, visibleHoleDiameterMm, onRuleChange, onVisibleSizeChange, children }: ScoringSettingsProps) {
  const [draft, setDraft] = useState<{ for: number; text: string }>({
    for: visibleHoleDiameterMm,
    text: String(visibleHoleDiameterMm),
  });
  // A stored value that changes underneath replaces the draft.
  const text = draft.for === visibleHoleDiameterMm ? draft.text : String(visibleHoleDiameterMm);
  const parsed = Number(text);
  const invalid = text.trim() === '' || !isValidVisibleHoleDiameterMm(parsed);

  function commit() {
    if (invalid || parsed === visibleHoleDiameterMm) return;
    onVisibleSizeChange(parsed);
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4" aria-labelledby="settings-scoring-title">
      <h2 id="settings-scoring-title" className="text-base font-semibold">
        Scoring and hole size
      </h2>

      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Scoring rule</legend>
        {RULES.map((rule) => {
          const id = `scoring-rule-${rule.value}`;
          return (
            <label
              key={rule.value}
              htmlFor={id}
              className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border p-3 has-[:checked]:border-primary"
            >
              <input
                id={id}
                type="radio"
                name="scoring-rule"
                value={rule.value}
                checked={scoringRule === rule.value}
                onChange={() => onRuleChange(rule.value)}
                data-testid={id}
                className="mt-1 size-4"
              />
              <span className="flex flex-col">
                <span className="text-sm font-medium">{rule.label}</span>
                <span className="text-xs text-muted-foreground">{rule.blurb}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {children}

      {scoringRule === 'visible' && (
        <div className="flex flex-col gap-1">
          <Label htmlFor="visible-hole-diameter">Visible hole size (mm)</Label>
          <Input
            id="visible-hole-diameter"
            data-testid="visible-hole-input"
            type="number"
            inputMode="decimal"
            min={MIN_VISIBLE_HOLE_DIAMETER_MM}
            max={MAX_VISIBLE_HOLE_DIAMETER_MM}
            step={0.1}
            className="h-11"
            aria-invalid={invalid}
            value={text}
            onChange={(e) => setDraft({ for: visibleHoleDiameterMm, text: e.currentTarget.value })}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
            }}
          />
          {invalid ? (
            <p className="text-xs text-destructive" role="alert" data-testid="visible-hole-error">
              Enter a size from {MIN_VISIBLE_HOLE_DIAMETER_MM} to {MAX_VISIBLE_HOLE_DIAMETER_MM} mm.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Provisional: {DEFAULT_VISIBLE_HOLE_DIAMETER_MM} mm is the smallest hole measured on real targets. Adjust it to
              what you see.
            </p>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground" data-testid="scoring-note">
        Applies to every session, including past ones. Your shots and alignment are never changed.
      </p>
    </section>
  );
}
