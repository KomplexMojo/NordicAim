// Node-only OpenCV loader for unit tests and `scripts/cv-eval.ts`.
//
// The app loads OpenCV with a static ESM import (`src/lib/cv/opencv-entry.ts`), which is what the
// browser bundle needs. Under vite-node that same import produces a module namespace carrying a `then`
// binding (the package's CommonJS export is a Promise), and awaiting it throws
// "Method Promise.prototype.then called on incompatible receiver [object Module]". `createRequire`
// hands back `module.exports` directly and side-steps the interop entirely; `resolveOpenCv` — the
// app's own resolver — then unwraps it exactly as it does on the phone.

import { createRequire } from 'node:module';

import { resolveOpenCv, type OpenCv } from '@/lib/cv/opencv';

const require = createRequire(import.meta.url);

let cached: Promise<OpenCv> | undefined;

export function loadOpenCvForTests(): Promise<OpenCv> {
  cached ??= resolveOpenCv(require('@techstark/opencv-js')).then((r) => r.cv);
  return cached;
}
