// backup.md §2b (REV-126): the images a backup leaves out because each is made from another image in the same file,
// and how a restore makes them again. The tools are injected, so this module never touches the DOM itself.

import { detectFormat } from '@/lib/media/format';
import { DIAGRAM_FULL_SIZE } from '@/lib/pipeline/stage-b';
import type { RenderTools } from '@/lib/render/rasterize-browser';
import type { ImageTools } from '@/lib/services/ingest';
import type { StoredBlob } from '@/lib/store/db';

import type { VerifiedBackup } from './verify';

export interface RebuildEntry {
  /** The image left out of the file. */
  key: string;
  /** The image in the file it is made from. */
  from: string;
}

export interface RebuildTools {
  makeWorkingImages: ImageTools['makeWorkingImages'];
  svgToPng: RenderTools['svgToPng'];
}

const PHOTO_DERIVED = /^photo:(.+):(working|thumb)$/;
const DIAGRAM_PNG = /^diagram:(.+):full-png$/;

/** The key an image is rebuilt from, or null when it is not one a backup leaves out. */
export function rebuildSource(key: string): string | null {
  const photo = PHOTO_DERIVED.exec(key);
  if (photo) return `photo:${photo[1]}:original`;
  const diagram = DIAGRAM_PNG.exec(key);
  if (diagram) return `diagram:${diagram[1]}:full-svg`;
  return null;
}

/** A photo's working copy and thumbnail are left out when its original is in the file; a diagram's PNG when its SVG is. */
export function rebuildEntries(keys: readonly string[]): RebuildEntry[] {
  const present = new Set(keys);
  return keys.flatMap((key) => {
    const from = rebuildSource(key);
    return from !== null && present.has(from) ? [{ key, from }] : [];
  });
}

export class RebuildError extends Error {
  constructor(detail: string) {
    super(
      `This backup leaves out copies of the photos that are made again on restore, and this browser could not make them (${detail}). ` +
        'Restore it in Safari on the iPhone.',
    );
    this.name = 'RebuildError';
  }
}

function recordedWorkingSize(backup: VerifiedBackup, photoId: string): { widthPx: number; heightPx: number } | null {
  const rec = backup.file.records.photos.find((p) => (p as { id?: unknown } | null)?.id === photoId) as
    | { working?: { widthPx?: unknown; heightPx?: unknown } }
    | undefined;
  const w = rec?.working;
  return typeof w?.widthPx === 'number' && typeof w.heightPx === 'number' ? { widthPx: w.widthPx, heightPx: w.heightPx } : null;
}

async function stored(blob: Blob, createdAt: string, fallbackType: string): Promise<StoredBlob> {
  const bytes = await blob.arrayBuffer();
  return { bytes, contentType: blob.type === '' ? fallbackType : blob.type, sizeBytes: bytes.byteLength, createdAt };
}

/**
 * Makes each wanted image again from its source in the file. Everything happens before any transaction; any failure throws
 * a {@link RebuildError}, so a restore that cannot rebuild writes nothing. A working copy must come out at the size its photo
 * record says, or the stored alignment and hole positions would no longer line up with it.
 */
export async function rebuildBlobs(backup: VerifiedBackup, wanted: readonly RebuildEntry[], tools: RebuildTools): Promise<Map<string, StoredBlob>> {
  const out = new Map<string, StoredBlob>();
  const created = new Map(backup.file.blobs.map((b) => [b.key, { createdAt: b.createdAt, contentType: b.contentType }]));
  const bySource = new Map<string, string[]>();
  for (const { key, from } of wanted) bySource.set(from, [...(bySource.get(from) ?? []), key]);

  for (const [from, keys] of bySource) {
    const bytes = backup.bytes.get(from);
    const meta = created.get(from);
    if (bytes === undefined || meta === undefined) throw new RebuildError(`${from} is missing`);
    try {
      if (from.startsWith('photo:')) {
        const photoId = from.slice('photo:'.length, -':original'.length);
        const format = detectFormat(bytes);
        if (format === null) throw new Error('unknown image format');
        const made = await tools.makeWorkingImages(new Blob([bytes as BlobPart], { type: meta.contentType }), format);
        const want = recordedWorkingSize(backup, photoId);
        if (want !== null && (want.widthPx !== made.workingSize.widthPx || want.heightPx !== made.workingSize.heightPx)) {
          throw new Error(`a working copy came out ${made.workingSize.widthPx}×${made.workingSize.heightPx}, not ${want.widthPx}×${want.heightPx}`);
        }
        for (const key of keys) {
          out.set(key, await stored(key.endsWith(':working') ? made.working : made.thumb, meta.createdAt, 'image/jpeg'));
        }
      } else {
        const png = await tools.svgToPng(new TextDecoder().decode(bytes), DIAGRAM_FULL_SIZE.widthPx, DIAGRAM_FULL_SIZE.heightPx);
        for (const key of keys) out.set(key, await stored(png, meta.createdAt, 'image/png'));
      }
    } catch (err) {
      if (err instanceof RebuildError) throw err;
      throw new RebuildError(err instanceof Error ? err.message : String(err));
    }
  }
  return out;
}
