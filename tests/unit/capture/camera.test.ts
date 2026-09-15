import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CameraError,
  FALLBACK_CONSTRAINTS,
  PRIMARY_CONSTRAINTS,
  cameraErrorCode,
  primitiveTrackSettings,
  startCamera,
  stopCamera,
} from '@/lib/capture/camera';
import { cameraErrorMessage, OVERLAY_LABELS } from '@/lib/capture/messages';
import { acquireWakeLock } from '@/lib/capture/wake-lock-browser';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('camera constraints (capture-overlay §2)', () => {
  it('first asks for the rear camera at 3840 × 2160 ideal', () => {
    expect(PRIMARY_CONSTRAINTS).toEqual({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
    });
  });

  it('falls back to facingMode environment only', () => {
    expect(FALLBACK_CONSTRAINTS).toEqual({ audio: false, video: { facingMode: 'environment' } });
  });
});

describe('cameraErrorCode', () => {
  it('maps an insecure context first', () => {
    expect(cameraErrorCode(new DOMException('x', 'NotAllowedError'), false)).toBe('insecure_context');
  });
  it('maps NotAllowedError, NotFoundError and anything else', () => {
    expect(cameraErrorCode(new DOMException('x', 'NotAllowedError'), true)).toBe('permission_denied');
    expect(cameraErrorCode(new DOMException('x', 'NotFoundError'), true)).toBe('no_camera');
    expect(cameraErrorCode(new DOMException('x', 'NotReadableError'), true)).toBe('camera_error');
    expect(cameraErrorCode('boom', true)).toBe('camera_error');
  });
  it('keeps the code of a CameraError', () => {
    expect(cameraErrorCode(new CameraError('no_camera'), true)).toBe('no_camera');
  });
});

describe('startCamera', () => {
  it('throws insecure_context without a secure context', async () => {
    vi.stubGlobal('isSecureContext', false);
    await expect(startCamera()).rejects.toMatchObject({ code: 'insecure_context' });
  });

  it('retries with the fallback constraints on OverconstrainedError', async () => {
    const stream = { id: 's' };
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(new DOMException('x', 'OverconstrainedError'))
      .mockResolvedValueOnce(stream);
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

    await expect(startCamera()).resolves.toBe(stream);
    expect(getUserMedia).toHaveBeenNthCalledWith(1, PRIMARY_CONSTRAINTS);
    expect(getUserMedia).toHaveBeenNthCalledWith(2, FALLBACK_CONSTRAINTS);
  });

  it('does not retry on NotAllowedError and maps it to permission_denied', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new DOMException('x', 'NotAllowedError'));
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

    await expect(startCamera()).rejects.toMatchObject({ code: 'permission_denied' });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });
});

describe('stopCamera', () => {
  it('stops every track', () => {
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
    stopCamera({ getTracks: () => tracks } as unknown as MediaStream);
    for (const t of tracks) expect(t.stop).toHaveBeenCalledTimes(1);
  });
});

describe('primitiveTrackSettings', () => {
  it('keeps only string, finite number, and boolean values', () => {
    expect(
      primitiveTrackSettings({
        deviceId: 'abc',
        width: 3840,
        height: 2160,
        frameRate: Number.NaN,
        torch: false,
        nested: { a: 1 },
        list: [1, 2],
        missing: undefined,
      }),
    ).toEqual({ deviceId: 'abc', width: 3840, height: 2160, torch: false });
  });
  it('returns null for no settings', () => {
    expect(primitiveTrackSettings(null)).toBeNull();
  });
});

describe('acquireWakeLock', () => {
  it('returns null when the API is missing', async () => {
    vi.stubGlobal('navigator', {});
    await expect(acquireWakeLock()).resolves.toBeNull();
  });
  it('returns null when the request fails', async () => {
    vi.stubGlobal('navigator', { wakeLock: { request: vi.fn().mockRejectedValue(new Error('denied')) } });
    await expect(acquireWakeLock()).resolves.toBeNull();
  });
  it('requests a screen lock and releases it', async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValue({ release });
    vi.stubGlobal('navigator', { wakeLock: { request } });
    const lock = await acquireWakeLock();
    expect(request).toHaveBeenCalledWith('screen');
    await lock?.release();
    expect(release).toHaveBeenCalledTimes(1);
  });
});

describe('messages', () => {
  it('uses the spec label chips (capture-overlay §1.3)', () => {
    expect(OVERLAY_LABELS.sighting).toBe('Align the dark disc with the thick circle');
    expect(OVERLAY_LABELS.precision).toBe('Align the black aiming mark with the thick circle');
  });
  it('has a message for every camera error', () => {
    for (const code of ['insecure_context', 'permission_denied', 'no_camera', 'camera_error'] as const) {
      expect(cameraErrorMessage(code).length).toBeGreaterThan(0);
    }
  });
});
