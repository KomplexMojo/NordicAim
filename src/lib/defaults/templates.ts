import type { TemplateId } from '../domain/enums';

export const SIGHTING_TEMPLATE = {
  id: 'sighting',
  label: 'Sighting / Zeroing',
  sheetTitle: 'Caledonia Nordic Ski Club – Biathlon (sighting-in sheet)',
  anchor: { kind: 'dark-disc', diameterMm: 115 },
  zones: {
    prone: { solidDiameterMm: 45, guideDiameterMm: 40 },
    standing: { solidDiameterMm: 115, guideDiameterMm: 110 },
  },
  unscoredCircles: [{ diameterMm: 15, note: 'unlabelled inner aiming circle; approximate, measure in M09' }],
  haloDiameterMm: 125, // decorative light-blue halo used by the renderer
  referenceImage: 'docs/reference/IMG_5057-sighting.jpg',
} as const;

export const PRECISION_TEMPLATE = {
  id: 'precision',
  label: 'Precision — Olympic 50m Rifle',
  sheetTitle: 'Olympic 50 Meter Rifle Target – Single shot Test (10 shots)',
  anchor: { kind: 'dark-disc', diameterMm: 112.4 }, // black aiming mark
  innerTenDiameterMm: 5.0, // "Inner Circle" – scores 10, counted as X
  ringDiameterMm: { 10: 10.4, 9: 26.4, 8: 42.4, 7: 58.4, 6: 74.4, 5: 90.4, 4: 106.4, 3: 122.4, 2: 138.4, 1: 154.4 },
  blackDiameterMm: 112.4,
  haloDiameterMm: 165.4,
  scoringKey: ['Inner Circle = 10', '1st Ring = 10', '2nd Ring = 9'],
  referenceImage: 'docs/reference/IMG_5132-precision.jpg',
} as const;

const TEMPLATES = {
  sighting: SIGHTING_TEMPLATE,
  precision: PRECISION_TEMPLATE,
} as const;

export function getTemplate(id: TemplateId) {
  return TEMPLATES[id];
}

/** Ring radius in mm for precision ring n (10…1): ringDiameterMm[n] / 2. */
export function ringRadiusMm(n: keyof typeof PRECISION_TEMPLATE.ringDiameterMm): number {
  return PRECISION_TEMPLATE.ringDiameterMm[n] / 2;
}
