import * as Comlink from 'comlink';

export interface CvWorkerApi {
  ping(): Promise<{ loadedMs: number; hasMat: boolean }>;
}

let client: Comlink.Remote<CvWorkerApi> | undefined;

export function getCvClient(): Comlink.Remote<CvWorkerApi> {
  client ??= Comlink.wrap<CvWorkerApi>(
    new Worker(new URL('./cv.worker.ts', import.meta.url), { type: 'module' }),
  );
  return client;
}
