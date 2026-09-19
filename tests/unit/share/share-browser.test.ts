import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { shareArtifact } from '@/lib/share/share-browser';

// rendering-composite.md §7. This suite runs in vitest's `node` environment (no DOM), so `document`,
// `navigator` and `URL.createObjectURL` are stubbed to the minimum `shareArtifact` touches.

function pngBlob(): Blob {
  return new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });
}

interface FakeAnchor {
  href: string;
  download: string;
  click: () => void;
  remove: () => void;
}

function stubDom(): { anchor: FakeAnchor; appended: FakeAnchor[] } {
  const appended: FakeAnchor[] = [];
  const anchor: FakeAnchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };

  vi.stubGlobal('document', {
    createElement: vi.fn((tag: string) => {
      if (tag !== 'a') throw new Error(`unexpected element: ${tag}`);
      return anchor;
    }),
    body: {
      appendChild: vi.fn((el: FakeAnchor) => appended.push(el)),
    },
  });
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:fake-url'),
    revokeObjectURL: vi.fn(),
  });
  return { anchor, appended };
}

describe('share/share-browser shareArtifact (rendering-composite.md §7)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('web-share: uses navigator.share when canShare accepts the file', async () => {
    stubDom();
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { canShare: () => true, share });

    const outcome = await shareArtifact(pngBlob(), 'range-day-shooting-analysis.png', 'Shooting analysis — Range day');

    expect(outcome).toBe('web-share');
    expect(share).toHaveBeenCalledTimes(1);
    const call = share.mock.calls[0]![0] as { files: File[]; title: string };
    expect(call.files[0]?.name).toBe('range-day-shooting-analysis.png');
    expect(call.title).toBe('Shooting analysis — Range day');
  });

  it('cancelled: navigator.share rejecting with AbortError resolves "cancelled", not an error', async () => {
    stubDom();
    const abortError = new DOMException('cancelled', 'AbortError');
    vi.stubGlobal('navigator', { canShare: () => true, share: vi.fn().mockRejectedValue(abortError) });

    const outcome = await shareArtifact(pngBlob(), 'x.png', 'x');
    expect(outcome).toBe('cancelled');
  });

  it('re-throws a non-AbortError failure from navigator.share', async () => {
    stubDom();
    vi.stubGlobal('navigator', { canShare: () => true, share: vi.fn().mockRejectedValue(new Error('boom')) });

    await expect(shareArtifact(pngBlob(), 'x.png', 'x')).rejects.toThrow('boom');
  });

  it('download: falls back to a temporary <a download> when canShare is unavailable', async () => {
    const { anchor, appended } = stubDom();
    vi.stubGlobal('navigator', {}); // no canShare at all

    const outcome = await shareArtifact(pngBlob(), 'range-day-shooting-analysis.png', 'Shooting analysis');

    expect(outcome).toBe('download');
    expect(anchor.download).toBe('range-day-shooting-analysis.png');
    expect(anchor.href).toBe('blob:fake-url');
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(anchor.remove).toHaveBeenCalledTimes(1);
    expect(appended).toHaveLength(1);

    // The object URL is revoked after 60s, not immediately.
    const revoke = (globalThis.URL as unknown as { revokeObjectURL: ReturnType<typeof vi.fn> }).revokeObjectURL;
    expect(revoke).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(revoke).toHaveBeenCalledWith('blob:fake-url');
  });

  it('download: falls back when canShare says no to this file', async () => {
    stubDom();
    vi.stubGlobal('navigator', { canShare: () => false, share: vi.fn() });

    const outcome = await shareArtifact(pngBlob(), 'x.png', 'x');
    expect(outcome).toBe('download');
  });
});
