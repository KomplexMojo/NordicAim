import { getCvClient } from '@/workers/cv-client';

import type { DiagnosticResult } from './summarize';

async function safeCheck(
  id: string,
  label: string,
  run: () => Promise<{ status: 'pass' | 'fail' | 'n/a'; detail: string }>,
): Promise<DiagnosticResult> {
  try {
    const { status, detail } = await run();
    return { id, label, status, detail };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { id, label, status: 'fail', detail: message };
  }
}

async function checkSecureContext(): Promise<DiagnosticResult> {
  return safeCheck('secure-context', 'Secure context', async () => ({
    status: window.isSecureContext ? 'pass' : 'fail',
    detail: `isSecureContext=${window.isSecureContext}`,
  }));
}

async function checkCameraApi(): Promise<DiagnosticResult> {
  return safeCheck('camera-api', 'Camera API', async () => {
    const has = !!navigator.mediaDevices?.getUserMedia;
    return { status: has ? 'pass' : 'fail', detail: `getUserMedia=${has}` };
  });
}

async function checkShareFiles(): Promise<DiagnosticResult> {
  return safeCheck('share-files', 'Share files', async () => {
    if (!navigator.canShare) return { status: 'n/a', detail: 'canShare unavailable' };
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const pngFile = new File([bytes], 'diag.png', { type: 'image/png' });
    const ok = navigator.canShare({ files: [pngFile] });
    return { status: ok ? 'pass' : 'fail', detail: `canShare(files)=${ok}` };
  });
}

async function checkStoragePersist(): Promise<DiagnosticResult> {
  return safeCheck('storage-persist', 'Storage persist', async () => {
    if (!navigator.storage?.persist) return { status: 'n/a', detail: 'persist unavailable' };
    const persisted = await navigator.storage.persist();
    return { status: persisted ? 'pass' : 'fail', detail: `persisted=${persisted}` };
  });
}

async function checkStorageEstimate(): Promise<DiagnosticResult> {
  return safeCheck('storage-estimate', 'Storage estimate', async () => {
    if (!navigator.storage?.estimate) return { status: 'n/a', detail: 'estimate unavailable' };
    const { usage, quota } = await navigator.storage.estimate();
    const usageMb = ((usage ?? 0) / (1024 * 1024)).toFixed(1);
    const quotaMb = ((quota ?? 0) / (1024 * 1024)).toFixed(1);
    return { status: 'pass', detail: `usage=${usageMb}MB quota=${quotaMb}MB` };
  });
}

async function checkWakeLock(): Promise<DiagnosticResult> {
  return safeCheck('wake-lock', 'Wake lock', async () => {
    const has = 'wakeLock' in navigator;
    return { status: has ? 'pass' : 'fail', detail: `wakeLock=${has}` };
  });
}

async function checkOffscreenCanvas(): Promise<DiagnosticResult> {
  return safeCheck('offscreen-canvas', 'OffscreenCanvas', async () => {
    const has = typeof OffscreenCanvas !== 'undefined';
    return { status: has ? 'pass' : 'fail', detail: `OffscreenCanvas=${has}` };
  });
}

async function checkIndexedDb(): Promise<DiagnosticResult> {
  return safeCheck('indexeddb', 'IndexedDB', async () => {
    const dbName = 'asa-diagnostics';
    const payload = new ArrayBuffer(1024 * 1024);

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('store');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('open failed'));
    });

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('store', 'readwrite');
      tx.objectStore('store').put(payload, 'key');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('put failed'));
    });

    const got = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction('store', 'readonly');
      const req = tx.objectStore('store').get('key');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('get failed'));
    });

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('store', 'readwrite');
      tx.objectStore('store').delete('key');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('delete failed'));
    });

    db.close();
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(dbName);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error('deleteDatabase failed'));
      req.onblocked = () => resolve();
    });

    const ok = got instanceof ArrayBuffer && got.byteLength === payload.byteLength;
    return { status: ok ? 'pass' : 'fail', detail: `roundtrip 1MB ArrayBuffer ok=${ok}` };
  });
}

async function checkCvWorker(): Promise<DiagnosticResult> {
  return safeCheck('cv-worker', 'OpenCV worker', async () => {
    const client = getCvClient();
    const { loadedMs, hasMat } = await client.ping();
    return {
      status: hasMat ? 'pass' : 'fail',
      detail: `hasMat=${hasMat} loadedMs=${loadedMs.toFixed(1)}`,
    };
  });
}

function rasterizeViaImage(src: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('no 2d context'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      try {
        resolve(ctx.getImageData(50, 50, 1, 1));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = src;
  });
}

async function checkSvgRaster(): Promise<DiagnosticResult> {
  return safeCheck('svg-raster', 'SVG rasterisation', async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">' +
      '<circle cx="50" cy="50" r="50" fill="red"/></svg>';

    let imageData: ImageData;
    let path: string;
    try {
      const blobUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      try {
        imageData = await rasterizeViaImage(blobUrl);
        path = 'object-url';
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    } catch {
      const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      imageData = await rasterizeViaImage(dataUrl);
      path = 'data-url';
    }

    const [r, g, b] = imageData.data;
    const isRed = r === 255 && g === 0 && b === 0;
    return { status: isRed ? 'pass' : 'fail', detail: `path=${path} rgb=${r},${g},${b}` };
  });
}

async function checkHeicDecode(): Promise<DiagnosticResult> {
  return safeCheck('heic-decode', 'HEIC decode', async () => {
    const width = await new Promise<number>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img.naturalWidth);
      img.onerror = () => reject(new Error('heic image failed to load'));
      img.src = 'diagnostics/tiny-sighting.heic';
    });
    const ok = width === 300;
    return { status: ok ? 'pass' : 'fail', detail: `naturalWidth=${width}` };
  });
}

async function checkStandalone(): Promise<DiagnosticResult> {
  return safeCheck('standalone', 'Standalone display', async () => {
    const nav = navigator as Navigator & { standalone?: boolean };
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true;
    return { status: standalone ? 'pass' : 'n/a', detail: `standalone=${standalone}` };
  });
}

async function checkUserAgent(): Promise<DiagnosticResult> {
  return safeCheck('user-agent', 'User agent', async () => ({
    status: 'n/a',
    detail: navigator.userAgent,
  }));
}

export async function runDiagnostics(): Promise<DiagnosticResult[]> {
  return Promise.all([
    checkSecureContext(),
    checkCameraApi(),
    checkShareFiles(),
    checkStoragePersist(),
    checkStorageEstimate(),
    checkWakeLock(),
    checkOffscreenCanvas(),
    checkIndexedDb(),
    checkCvWorker(),
    checkSvgRaster(),
    checkHeicDecode(),
    checkStandalone(),
    checkUserAgent(),
  ]);
}
