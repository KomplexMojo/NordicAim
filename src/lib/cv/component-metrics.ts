// M16 (REV-27, REV-32). One place that turns a binary hole mask into measured connected components,
// shared by the global segmentation (`holes.ts`) and the region scan (`holes-region.ts`), so both
// methods are compared on exactly the same numbers in `pnpm cv:eval`.
//
// Pure over OpenCV Mats; no DOM.

import type { CvMat, OpenCv } from './opencv';

/** `fitEllipse` needs at least this many contour points (same rule as `anchor.ts`). */
const MIN_CONTOUR_POINTS = 5;

export interface ComponentMetrics {
  /** Centroid in the mask's own pixels. */
  x: number;
  y: number;
  areaPx: number;
  perimeterPx: number;
  /** `4π·area / perimeter²`, 1 for a perfect disc (M11 step 5). */
  circularity: number;
  /** major/minor of the fitted ellipse, 1 for a circle. REV-27's shape test. */
  elongation: number;
  /** Filled fraction of the fitted ellipse; how much of its own outline the component fills. */
  fill: number;
  /** Maximum inscribed radius — the distance-transform peak — in mask px. REV-27's stroke test. */
  strokeRadiusPx: number;
  /** True when the component touches the mask's border, i.e. it may be cut off. */
  touchesEdge: boolean;
}

interface ContourProps {
  perimeterPx: number;
  elongation: number;
  ellipseAreaPx: number;
}

/** Perimeter, elongation and fitted-ellipse area per label, from the external contours. */
function contourProps(cv: OpenCv, mask: CvMat, labels: CvMat, keep: Uint8Array): ContourProps[] {
  const props: ContourProps[] = Array.from({ length: keep.length }, () => ({
    perimeterPx: 0,
    elongation: 1,
    ellipseAreaPx: 0,
  }));
  const labelData = labels.data32S as Int32Array;
  const cols = mask.cols as number;

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  try {
    // CHAIN_APPROX_NONE: every boundary pixel, so `arcLength` measures the real outline.
    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE);
    for (let i = 0; i < (contours.size() as number); i += 1) {
      const contour = contours.get(i);
      try {
        const points = contour.data32S as Int32Array;
        const x = points[0];
        const y = points[1];
        if (x === undefined || y === undefined) continue;
        const label = labelData[y * cols + x] as number;
        if (label <= 0 || label >= keep.length || keep[label] !== 1) continue;

        const entry = props[label] as ContourProps;
        const perimeter = cv.arcLength(contour, true) as number;
        if (perimeter <= entry.perimeterPx) continue;
        entry.perimeterPx = perimeter;

        if ((contour.rows as number) >= MIN_CONTOUR_POINTS) {
          const rect = cv.fitEllipse(contour);
          const width = rect.size.width as number;
          const height = rect.size.height as number;
          const major = Math.max(width, height);
          const minor = Math.min(width, height);
          entry.elongation = minor > 0 ? major / minor : 1;
          entry.ellipseAreaPx = (Math.PI * width * height) / 4;
        }
      } finally {
        contour.delete();
      }
    }
  } finally {
    contours.delete();
    hierarchy.delete();
  }
  return props;
}

/** Distance-transform peak per label: the radius of the largest disc that fits inside the component. */
function strokeRadii(cv: OpenCv, mask: CvMat, labels: CvMat, keep: Uint8Array): Float64Array {
  const peaks = new Float64Array(keep.length);
  const dist = new cv.Mat();
  try {
    cv.distanceTransform(mask, dist, cv.DIST_L2, 3);
    const distData = dist.data32F as Float32Array;
    const labelData = labels.data32S as Int32Array;
    for (let i = 0; i < labelData.length; i += 1) {
      const label = labelData[i] as number;
      if (label <= 0 || label >= keep.length || keep[label] !== 1) continue;
      const value = distData[i] as number;
      if (value > (peaks[label] as number)) peaks[label] = value;
    }
  } finally {
    dist.delete();
  }
  return peaks;
}

/**
 * Every connected component of `mask` of at least `minAreaPx` pixels, measured. Components below the
 * area gate are dropped before any contour, ellipse or distance-transform work is done for them
 * (M11 step 5's gate, and the reason the region scan can afford to run per tile).
 */
export function measureComponents(cv: OpenCv, mask: CvMat, minAreaPx: number): ComponentMetrics[] {
  const labels = new cv.Mat();
  const stats = new cv.Mat();
  const centroids = new cv.Mat();
  try {
    const labelCount = cv.connectedComponentsWithStats(mask, labels, stats, centroids) as number;
    const statsData = stats.data32S as Int32Array;
    const centroidData = centroids.data64F as Float64Array;
    const areaIndex = cv.CC_STAT_AREA as number;

    const keep = new Uint8Array(labelCount);
    let kept = 0;
    for (let label = 1; label < labelCount; label += 1) {
      if ((statsData[label * 5 + areaIndex] as number) < minAreaPx) continue;
      keep[label] = 1;
      kept += 1;
    }
    if (kept === 0) return [];

    const props = contourProps(cv, mask, labels, keep);
    const peaks = strokeRadii(cv, mask, labels, keep);
    const cols = mask.cols as number;
    const rows = mask.rows as number;

    const out: ComponentMetrics[] = [];
    for (let label = 1; label < labelCount; label += 1) {
      if (keep[label] !== 1) continue;
      const areaPx = statsData[label * 5 + areaIndex] as number;
      const left = statsData[label * 5 + (cv.CC_STAT_LEFT as number)] as number;
      const top = statsData[label * 5 + (cv.CC_STAT_TOP as number)] as number;
      const width = statsData[label * 5 + (cv.CC_STAT_WIDTH as number)] as number;
      const height = statsData[label * 5 + (cv.CC_STAT_HEIGHT as number)] as number;
      const entry = props[label] as ContourProps;
      const perimeterPx = entry.perimeterPx;

      out.push({
        x: centroidData[label * 2] as number,
        y: centroidData[label * 2 + 1] as number,
        areaPx,
        perimeterPx,
        circularity: perimeterPx > 0 ? (4 * Math.PI * areaPx) / (perimeterPx * perimeterPx) : 0,
        elongation: entry.elongation,
        // No fitted ellipse (a component whose contour has < 5 points) means nothing to compare
        // against, so `fill` reports 1 rather than inventing a shape.
        fill: entry.ellipseAreaPx > 0 ? areaPx / entry.ellipseAreaPx : 1,
        strokeRadiusPx: peaks[label] as number,
        touchesEdge: left === 0 || top === 0 || left + width >= cols || top + height >= rows,
      });
    }
    return out;
  } finally {
    labels.delete();
    stats.delete();
    centroids.delete();
  }
}
