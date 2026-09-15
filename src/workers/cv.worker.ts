import * as Comlink from 'comlink';

import { loadOpenCv } from '@/lib/cv/opencv';

Comlink.expose({
  async ping() {
    const t = performance.now();
    const cv = await loadOpenCv();
    return { loadedMs: performance.now() - t, hasMat: typeof cv.Mat === 'function' };
  },
});
