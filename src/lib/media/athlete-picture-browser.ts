// REV-157 (issue #99): makes the athlete's picture from a photo — the centre square, scaled to 96 px and re-encoded as JPEG on
// a canvas, which drops every metadata segment (EXIF, and so any location). Quality steps down until it fits in 8 KB.

import { ATHLETE_PICTURE_SIZE, athletePictureDataUrl, athletePictureProblem, MAX_ATHLETE_PICTURE_BYTES } from '../domain/athlete-picture';
import { detectFormat } from './format';
import { loadImage, UnsupportedOnThisBrowserError } from './image-browser';

const QUALITIES = [0.85, 0.75, 0.65, 0.55, 0.45, 0.35];

function jpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob failed'))), 'image/jpeg', quality);
  });
}

/** The athlete picture for `photo` as a data URL; rejects with a message for the owner when it cannot be made. */
export async function makeAthletePicture(photo: Blob): Promise<string> {
  const format = detectFormat(new Uint8Array(await photo.slice(0, 64).arrayBuffer()));
  let img: HTMLImageElement;
  try {
    img = await loadImage(photo);
  } catch {
    if (format === 'heic') throw new UnsupportedOnThisBrowserError('heic');
    throw new Error("That photo can't be opened. Try another one.");
  }
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  if (side === 0) throw new Error("That photo can't be opened. Try another one.");
  const canvas = document.createElement('canvas');
  canvas.width = ATHLETE_PICTURE_SIZE;
  canvas.height = ATHLETE_PICTURE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.imageSmoothingQuality = 'high';
  // The centre square of the photo, filling the picture.
  ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, ATHLETE_PICTURE_SIZE, ATHLETE_PICTURE_SIZE);
  for (const quality of QUALITIES) {
    const blob = await jpeg(canvas, quality);
    if (blob.size > MAX_ATHLETE_PICTURE_BYTES) continue;
    const dataUrl = athletePictureDataUrl(new Uint8Array(await blob.arrayBuffer()));
    const problem = athletePictureProblem(dataUrl);
    if (problem !== null) throw new Error(`That picture can't be used: ${problem}.`);
    return dataUrl;
  }
  throw new Error("That photo is too detailed to make a small enough picture. Try a plainer one.");
}
