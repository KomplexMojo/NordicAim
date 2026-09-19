import type { TemplateId } from './enums';
import type { Reason } from './enums';

export interface ReasonMessageContext {
  missing?: number;
  hintTemplate?: TemplateId;
  /** Declared rounds, for the `extra-candidates-dropped` message (M16 step 5). */
  declared?: number;
  /**
   * `too-many-holes` (M20): the clear holes found and the rounds declared, for the rejected subset.
   * `rejectedPosition` names that subset when the target holds both positions (M20 Pitfalls: "say
   * which position was rejected"); `rejectedDeclared` is that subset's own declared rounds.
   */
  holesFound?: number;
  rejectedDeclared?: number;
  rejectedPosition?: 'prone' | 'standing';
  /** `double-punch-assumed` (M20): holes given an inferred extra round. */
  doublePunches?: number;
  /** `rounds-scored-as-miss` (M20): declared rounds with no hole, scored as misses. */
  missesAssumed?: number;
}

const POSITION_WORD = { prone: 'Prone', standing: 'Standing' } as const;

/** analysis-pipeline §4 message table. */
export function reasonMessage(reason: Reason, ctx: ReasonMessageContext = {}): string {
  switch (reason) {
    case 'target-not-found':
      return "Couldn't find the target in this photo. Use Adjust to line it up.";
    case 'no-shots-found':
      return 'No shots detected. Use Adjust to add them.';
    case 'too-many-shots':
      return 'More shots found than the rounds you entered. Check the rounds or adjust shots.';
    case 'extra-candidates-dropped':
      return `Some detected marks were ignored because you fired ${ctx.declared ?? 0} rounds.`;
    case 'rounds-unaccounted':
      // REV-49 (M24, issue #8 point 5): M20 made the score definite, so "score shown as a range" is
      // stale. This reason now appears only for a result stored before M20 that has not been
      // re-analyzed (analysis-pipeline §4 rule 10); re-running the pipeline scores it as misses.
      return `${ctx.missing ?? 0} round(s) not found — re-analyze to score them as misses.`;
    case 'alignment-uncertain':
      return 'Used your on-screen alignment — check the rings line up.';
    case 'image-blurry':
      return 'This photo looks blurry, so results may be less accurate.';
    case 'template-mismatch':
      return `This looks like a ${ctx.hintTemplate ?? 'sighting/precision'} target — check the template.`;
    case 'backing-colour-not-found':
      return 'No backing colour showed through the holes, so standard detection was used. Check the backing card or lighting.';
    case 'too-many-holes': {
      const message =
        `Found ${ctx.holesFound ?? 0} clear holes but you entered ${ctx.rejectedDeclared ?? ctx.declared ?? 0} rounds. ` +
        'This may be the wrong target or the wrong round count.';
      return ctx.rejectedPosition === undefined ? message : `${POSITION_WORD[ctx.rejectedPosition]}: ${message}`;
    }
    case 'double-punch-assumed':
      return `${ctx.doublePunches ?? 0} hole(s) look like two shots through the same hole.`;
    case 'rounds-scored-as-miss':
      return `${ctx.missesAssumed ?? 0} round(s) weren't found and are scored as misses.`;
  }
}
