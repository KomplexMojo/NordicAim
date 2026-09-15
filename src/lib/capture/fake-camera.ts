// capture-overlay.md §6. Dev/test only: import dynamically inside `import.meta.env.VITE_FAKE_CAMERA === '1'`
// so it is tree-shaken from the Pages build.

import { containTransform } from './overlay';

export type FakeCameraName = 'sighting' | 'precision';

export const FAKE_FRAME = { w: 1080, h: 1920 } as const;
const FPS = 15;

export function parseFakeCameraName(value: string | null): FakeCameraName | null {
  return value === 'sighting' || value === 'precision' ? value : null;
}

/** Draws `dev-fixtures/<name>.jpg` contain-fit into a 1080 × 1920 canvas and returns `canvas.captureStream(15)`. */
export async function startFakeCamera(name: FakeCameraName): Promise<MediaStream> {
  const img = new Image();
  img.src = `${import.meta.env.BASE_URL}dev-fixtures/${name}.jpg`;
  await img.decode();

  const canvas = document.createElement('canvas');
  canvas.width = FAKE_FRAME.w;
  canvas.height = FAKE_FRAME.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');

  const t = containTransform(FAKE_FRAME, { w: img.naturalWidth, h: img.naturalHeight });
  const draw = () => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, FAKE_FRAME.w, FAKE_FRAME.h);
    ctx.drawImage(img, t.ox, t.oy, img.naturalWidth * t.k, img.naturalHeight * t.k);
  };
  draw();

  const stream = canvas.captureStream(FPS);
  // A static canvas only emits frames when repainted; keep repainting until the track is stopped.
  const timer = setInterval(() => {
    const track = stream.getVideoTracks()[0];
    if (!track || track.readyState === 'ended') {
      clearInterval(timer);
      return;
    }
    draw();
  }, 1000 / FPS);
  return stream;
}
