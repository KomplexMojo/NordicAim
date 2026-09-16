// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the one allowed `any` (AGENTS.md: OpenCv handle)
export type OpenCv = any;

/** An OpenCV `Mat` handle. Same untyped handle as {@link OpenCv}; named so call sites read clearly. */
export type CvMat = OpenCv;

let p: Promise<{ cv: OpenCv }> | undefined;

/** True only for genuine Promise objects (not objects that merely inherit from Promise.prototype). */
export function isRealPromise(value: unknown): value is Promise<unknown> {
  if (!(value instanceof Promise)) return false;
  try {
    // Throws "incompatible receiver" / "|this| is not a Promise" for fakes created by bundler interop.
    Promise.prototype.then.call(value, undefined, () => undefined);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves whatever the OpenCV.js module export looks like after bundler interop into the ready `cv` object.
 * Order matters: unwrap `.default` BEFORE awaiting, and only await real Promises, because the interop wrapper is a
 * fake promise whose `then` throws. The result is wrapped in `{ cv }` so it is never adopted as a thenable.
 */
export async function resolveOpenCv(raw: unknown): Promise<{ cv: OpenCv }> {
  let x: OpenCv = raw;
  for (let step = 0; step < 6; step++) {
    if (x && typeof x.Mat === 'function') return { cv: x };
    if (x && typeof x === 'object' && 'default' in x && x.default && x.default !== x) {
      x = x.default;
      continue;
    }
    if (isRealPromise(x)) {
      x = await x;
      continue;
    }
    if (x && (typeof x === 'object' || typeof x === 'function')) {
      const moduleObject = x;
      await new Promise<void>((resolve) => {
        const previous = moduleObject.onRuntimeInitialized;
        moduleObject.onRuntimeInitialized = () => {
          if (typeof previous === 'function') previous();
          resolve();
        };
      });
      return { cv: moduleObject };
    }
    break;
  }
  throw new Error('OpenCV.js export could not be resolved to a cv object');
}

export function loadOpenCv(): Promise<OpenCv> {
  p ??= (async () => {
    const entry = await import('./opencv-entry');
    return resolveOpenCv(entry.getOpenCvExport());
  })();
  return p.then((result) => result.cv);
}
