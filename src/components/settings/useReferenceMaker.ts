import { useState } from 'react';
import { toast } from 'sonner';

import { useServices } from '@/lib/app/services';
import type { TemplateId } from '@/lib/domain/enums';
import type { AppSettings } from '@/lib/domain/settings';
import { prepareTemplateReference, REFERENCE_REFUSED_MESSAGE, saveTemplateReference } from '@/lib/services/template-reference';
import { getCvClient } from '@/workers/cv-client';

export interface ReferenceMaker {
  busy: boolean;
  /** §3: why the last photo was refused; nothing was stored. */
  refused: string | null;
  /** Resolves true once a reference was stored. */
  make(blob: Blob): Promise<boolean>;
}

/** template-reference.md §3–§4: photo → checked reference → stored, or refused with the reason. */
export function useReferenceMaker(template: TemplateId, holeDiameterMm: number, onChanged: (s: AppSettings) => void): ReferenceMaker {
  const { ctx, imageTools } = useServices();
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  async function make(blob: Blob): Promise<boolean> {
    setBusy(true);
    setRefused(null);
    try {
      const result = await prepareTemplateReference(blob, template, holeDiameterMm, { imageTools, cv: getCvClient() });
      if (result.status === 'refused') {
        setRefused(REFERENCE_REFUSED_MESSAGE[result.reason]);
        return false;
      }
      const { settings, rerun } = await saveTemplateReference(ctx, result.prepared);
      onChanged(settings);
      toast.success(rerun > 0 ? `Sheet saved. Re-analyzing ${rerun} ${rerun === 1 ? 'target' : 'targets'}.` : 'Sheet saved.');
      return true;
    } catch (err) {
      toast.error(`Could not use that photo: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, refused, make };
}
