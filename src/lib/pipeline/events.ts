// analysis-pipeline §5: the runner (and services, in the meantime) broadcast `pipeline-changed` so screens can
// re-read live data without polling. `sessionId` is always present; `photoId` only when the change was scoped to
// one photo.

export interface PipelineChangedDetail {
  sessionId: string;
  photoId?: string;
}

const target = new EventTarget();
const EVENT = 'pipeline-changed';

export function emitPipelineChanged(detail: PipelineChangedDetail): void {
  target.dispatchEvent(new CustomEvent<PipelineChangedDetail>(EVENT, { detail }));
}

/** Returns an unsubscribe function. */
export function onPipelineChanged(cb: (detail: PipelineChangedDetail) => void): () => void {
  function handler(e: Event): void {
    cb((e as CustomEvent<PipelineChangedDetail>).detail);
  }
  target.addEventListener(EVENT, handler);
  return () => target.removeEventListener(EVENT, handler);
}
