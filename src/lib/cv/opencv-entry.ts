// Static ESM entry for the CommonJS OpenCV.js build.
//
// Why this file exists: `await import('@techstark/opencv-js')` in production (Vite 8 / rolldown) compiles to
// `import(chunk).then(e => interop(e.default))`. The interop helper wraps OpenCV's exported Promise in an object whose
// prototype is Promise.prototype. Returning that object from the `.then` callback makes the engine call
// Promise.prototype.then on a non-Promise receiver ("|this| is not a Promise" on iOS Safari, "incompatible receiver" in
// Chromium). A static import performs the interop synchronously, and exposing the value through a plain function means
// it is never adopted as a thenable. `loadOpenCv()` unwraps it safely.
import * as opencvModule from '@techstark/opencv-js';

export function getOpenCvExport(): unknown {
  return opencvModule;
}
