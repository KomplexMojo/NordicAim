// Re-runs `query` whenever it changes (via `deps`) and whenever a `pipeline-changed` event fires (analysis-pipeline
// §5), so screens stay current as the background pipeline (M10+) or another tab mutates the same records.

import { useEffect, useRef, useState, type DependencyList } from 'react';

import { onPipelineChanged } from '@/lib/pipeline/events';

export interface LiveQueryResult<T> {
  value: T | undefined;
  loading: boolean;
  error: unknown;
}

export function useLiveQuery<T>(query: () => Promise<T>, deps: DependencyList): LiveQueryResult<T> {
  const [state, setState] = useState<LiveQueryResult<T>>({ value: undefined, loading: true, error: null });

  // `query` is usually a fresh closure every render; keep the latest one in a ref (synced in its own effect, never
  // written during render) so the fetch effect below can depend only on the caller's `deps`.
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  });

  useEffect(() => {
    let cancelled = false;

    function run(): void {
      queryRef.current().then(
        (value) => {
          if (!cancelled) setState({ value, loading: false, error: null });
        },
        (error: unknown) => {
          if (!cancelled) setState((s) => ({ value: s.value, loading: false, error }));
        },
      );
    }

    run();
    const unsubscribe = onPipelineChanged(() => run());
    return () => {
      cancelled = true;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps is the caller's dependency list, not this hook's
  }, deps);

  return state;
}
