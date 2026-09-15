import { describe, expect, it } from 'vitest';

import { isRealPromise, resolveOpenCv } from '@/lib/cv/opencv';

// Regression tests for the 2026-09-15 iPhone failure: production bundler interop wrapped OpenCV's exported Promise in an
// object inheriting from Promise.prototype, and awaiting it threw "|this| is not a Promise".

function Mat() {}

describe('isRealPromise', () => {
  it('accepts real promises and rejects Promise.prototype fakes', () => {
    expect(isRealPromise(Promise.resolve(1))).toBe(true);
    const fake = Object.create(Promise.prototype);
    expect(fake instanceof Promise).toBe(true);
    expect(isRealPromise(fake)).toBe(false);
    expect(isRealPromise({ then: () => undefined })).toBe(false);
  });
});

describe('resolveOpenCv', () => {
  it('unwraps the bundler interop fake promise via .default before awaiting', async () => {
    const real = Promise.resolve({ Mat });
    const fake = Object.create(Promise.prototype) as { default?: unknown };
    fake.default = real;
    const { cv } = await resolveOpenCv(fake);
    expect(cv.Mat).toBe(Mat);
  });

  it('handles a namespace with default = real promise', async () => {
    const { cv } = await resolveOpenCv({ default: Promise.resolve({ Mat }) });
    expect(cv.Mat).toBe(Mat);
  });

  it('returns an already-initialised module directly', async () => {
    const moduleObject = { Mat };
    const { cv } = await resolveOpenCv(moduleObject);
    expect(cv).toBe(moduleObject);
  });

  it('waits for onRuntimeInitialized when the module is not ready yet', async () => {
    const moduleObject: { Mat?: unknown; onRuntimeInitialized?: () => void } = {};
    setTimeout(() => {
      moduleObject.Mat = Mat;
      moduleObject.onRuntimeInitialized?.();
    }, 5);
    const { cv } = await resolveOpenCv(moduleObject);
    expect(cv.Mat).toBe(Mat);
  });

  it('throws for unusable exports', async () => {
    await expect(resolveOpenCv(undefined)).rejects.toThrow('could not be resolved');
  });
});
