export type OpenCv = any;

let p: Promise<OpenCv> | undefined;

export function loadOpenCv(): Promise<OpenCv> {
  p ??= (async () => {
    const mod: any = await import('@techstark/opencv-js');
    let cv = mod.default ?? mod;
    if (typeof cv.then === 'function') cv = await cv;
    else if (!cv.Mat) await new Promise<void>((r) => { cv.onRuntimeInitialized = () => r(); });
    return cv;
  })();
  return p;
}
