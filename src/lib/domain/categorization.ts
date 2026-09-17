import type { Position, TemplateId } from './enums';
import type { Categorization } from './photo';

export class IncompleteCategorizationError extends Error {
  constructor() {
    super('Categorization is incomplete');
    this.name = 'IncompleteCategorizationError';
  }
}

export function isCategorizationComplete(c: Categorization): boolean {
  if (c.template === null || c.position === null) return false;
  if ((c.position === 'prone' || c.position === 'both') && c.roundsProne === null) return false;
  if ((c.position === 'standing' || c.position === 'both') && c.roundsStanding === null) return false;
  return true;
}

/** geometry-scoring §7. Throws IncompleteCategorizationError if `c` is incomplete. */
export function declaredRounds(c: Categorization): number {
  if (!isCategorizationComplete(c)) throw new IncompleteCategorizationError();
  const position = c.position as Position;
  if (position === 'prone') return c.roundsProne as number;
  if (position === 'standing') return c.roundsStanding as number;
  return (c.roundsProne as number) + (c.roundsStanding as number);
}

/**
 * geometry-scoring §7, the same count without the throw: the declared rounds, or `null` while the
 * categorization is still incomplete. The `extra-candidates-dropped` message (analysis-pipeline §4)
 * names this number in the `ready` state, before `analysis.computed` exists to carry it.
 */
export function declaredRoundsOrNull(c: Categorization): number | null {
  return isCategorizationComplete(c) ? declaredRounds(c) : null;
}

export function defaultCategorization(template: TemplateId, position: Position): Categorization {
  if (position === 'prone') {
    return { template, position, roundsProne: 10, roundsStanding: null };
  }
  if (position === 'standing') {
    return { template, position, roundsProne: null, roundsStanding: 10 };
  }
  return { template, position, roundsProne: 5, roundsStanding: 5 };
}

export function emptyCategorization(): Categorization {
  return { template: null, position: null, roundsProne: null, roundsStanding: null };
}
