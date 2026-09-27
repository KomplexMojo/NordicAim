import { useState } from 'react';
import { toast } from 'sonner';

import { useServices } from '@/lib/app/services';
import type { TemplateId } from '@/lib/domain/enums';
import type { AppSettings } from '@/lib/domain/settings';
import {
  prepareTemplateReference,
  REFERENCE_REFUSED_MESSAGE,
  saveTemplateReference,
  type PreparedReference,
} from '@/lib/services/template-reference';
import { getCvClient } from '@/workers/cv-client';

export interface ReferenceMaker {
  busy: boolean;
  /** §3 steps 2 and 4: why the last photo was refused; nothing was stored. */
  refused: string | null;
  /** §3 step 5: a reference with holes, waiting for *Use anyway* or a retake. */
  pending: PreparedReference | null;
  /** Resolves true once a reference was stored. */
  make(blob: Blob): Promise<boolean>;
  useAnyway(): Promise<boolean>;
  discard(): void;
}

/** template-reference.md §3–§4: photo → checked reference → stored, with the holes warning in between. */
export function useReferenceMaker(template: TemplateId, holeDiameterMm: number, onChanged: (s: AppSettings) => void): ReferenceMaker {
  const { ctx, imageTools } = useServices();
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [pending, setPending] = useState<PreparedReference | null>(null);

  async function save(prepared: PreparedReference): Promise<boolean> {
    const { settings, rerun } = await saveTemplateReference(ctx, prepared);
    onChanged(settings);
    setPending(null);
    toast.success(rerun > 0 ? `Sheet saved. Re-analyzing ${rerun} ${rerun === 1 ? 'target' : 'targets'}.` : 'Sheet saved.');
    return true;
  }

  async function run(work: () => Promise<boolean>): Promise<boolean> {
    setBusy(true);
    try {
      return await work();
    } catch (err) {
      toast.error(`Could not use that photo: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return {
    busy,
    refused,
    pending,
    make: (blob) =>
      run(async () => {
        setRefused(null);
        setPending(null);
        const result = await prepareTemplateReference(blob, template, holeDiameterMm, { imageTools, cv: getCvClient() });
        if (result.status === 'refused') {
          setRefused(REFERENCE_REFUSED_MESSAGE);
          return false;
        }
        if (result.prepared.holesFound > 0) {
          setPending(result.prepared);
          return false;
        }
        return save(result.prepared);
      }),
    useAnyway: () => run(async () => (pending === null ? false : save(pending))),
    discard: () => setPending(null),
  };
}
