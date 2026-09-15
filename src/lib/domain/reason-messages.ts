import type { TemplateId } from './enums';
import type { Reason } from './enums';

export interface ReasonMessageContext {
  missing?: number;
  hintTemplate?: TemplateId;
}

/** analysis-pipeline §4 message table. */
export function reasonMessage(reason: Reason, ctx: ReasonMessageContext = {}): string {
  switch (reason) {
    case 'target-not-found':
      return "Couldn't find the target in this photo. Use Adjust to line it up.";
    case 'no-shots-found':
      return 'No shots detected. Use Adjust to add them.';
    case 'too-many-shots':
      return 'More shots found than the rounds you entered. Check the rounds or adjust shots.';
    case 'rounds-unaccounted':
      return `${ctx.missing ?? 0} round(s) not found (often overlapping holes) — score shown as a range.`;
    case 'alignment-uncertain':
      return 'Used your on-screen alignment — check the rings line up.';
    case 'image-blurry':
      return 'This photo looks blurry, so results may be less accurate.';
    case 'template-mismatch':
      return `This looks like a ${ctx.hintTemplate ?? 'sighting/precision'} target — check the template.`;
  }
}
