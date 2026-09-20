// REV-66 (issue #22): every acronym and measure the app shows, with the formula where there is a calculation and what it
// measures where the name alone is unclear. Pure data, shown in Settings → Glossary.

import { PRECISION_TEMPLATE } from './defaults/templates';

export interface GlossaryEntry {
  term: string;
  /** What the letters stand for, when they stand for something. */
  stands: string | null;
  /** What it means or measures, in plain words. */
  means: string;
  /** The calculation, when there is one. */
  formula: string | null;
  /** REV-91: the scoring-rule mark shown beside the term (the same one under a precision score star). */
  icon?: 'gauge' | 'centre' | 'visible';
}

const TEN = PRECISION_TEMPLATE.innerTenDiameterMm;

export const GLOSSARY: ReadonlyArray<GlossaryEntry> = [
  {
    term: 'MOA',
    stands: 'minutes of angle',
    means:
      'How wide something looks from the shooter, as an angle: 1 MOA is 1/60 of a degree, about 14.5 mm at 50 m. It lets group sizes and sight corrections be compared at any distance. A smaller MOA means a tighter group.',
    formula: 'angle = 2 × atan(size ÷ (2 × distance)); MOA = angle in degrees × 60. Distance is 50 m (50 000 mm).',
  },
  {
    term: 'MRAD',
    stands: 'milliradians',
    means:
      'The same idea as MOA in different units: 1 MRAD is 1/1000 of a radian, exactly 50 mm at 50 m. Many scopes click in MRAD.',
    formula: 'MRAD = angle in radians × 1000, with the angle worked out as for MOA. 1 MOA ≈ 0.291 MRAD.',
  },
  {
    term: 'MPI',
    stands: 'mean point of impact',
    means: 'The centre of the group: where the shots land on average. Its distance from the bullseye is how far the sights are off.',
    formula: 'MPI = (average of all x, average of all y), in mm from the target centre.',
  },
  {
    term: 'MPI offset',
    stands: null,
    means:
      'How far the MPI is from the bullseye, split into across (R right, L left) and up-down (U up, D down), in mm and MOA. Move the sights the opposite way to correct it.',
    formula: 'offset (mm) = MPI x and MPI y; MOA = atan(offset ÷ 50 000 mm) in degrees × 60.',
  },
  {
    term: 'ES',
    stands: 'extreme spread',
    means: 'The group size: the greatest distance between any two shots in the group. It ignores where the group sits on the target.',
    formula: 'ES = largest distance between any pair of shots, √((x₁ − x₂)² + (y₁ − y₂)²).',
  },
  {
    term: 'Precision',
    stands: null,
    means: 'How tightly the shots cluster around their own centre, wherever that is. Low is good. A tight group in the wrong place is precise but not accurate.',
    formula: 'Mean of each shot’s distance from the group centre (the MPI); shown as “mean radius”.',
  },
  {
    term: 'Accuracy',
    stands: null,
    means: 'How close the shots are to the bullseye overall, counting both the group’s spread and its offset. Low is good.',
    formula: 'Square root of the average of each shot’s squared distance from the bullseye (0, 0).',
  },
  {
    term: 'RMS',
    stands: 'root mean square',
    means: 'A way of averaging distances that counts far shots more heavily than near ones. It is how Accuracy is calculated.',
    formula: 'RMS = √( (d₁² + d₂² + … + dₙ²) ÷ n ), where d is a shot’s distance from the bullseye.',
  },
  {
    term: 'Group ellipse',
    stands: null,
    means: 'An oval drawn around the group showing where about 95% of similar shots should fall. Long and thin means the group is stretched in one direction. Shown from 3 shots.',
    formula: 'Covariance ellipse of the shot positions, drawn at 2 standard deviations, centred on the MPI.',
  },
  {
    term: 'X',
    stands: null,
    means: `The precision target’s inner ten, the dashed ring in the middle (${TEN} mm across). An X is a 10 whose hole touches it; X counts break ties between equal scores.`,
    formula: null,
  },
  {
    term: 'LR',
    stands: 'long rifle',
    means: 'The .22 LR cartridge biathlon uses. Its bullet makes a 5.6 mm hole, which is the default Hole diameter in Settings.',
    formula: null,
  },
  {
    term: 'mm',
    stands: 'millimetres',
    means: 'All target measurements are in mm from the target centre: right and up are positive.',
    formula: null,
  },
  {
    term: 'R / L / U / D',
    stands: 'right, left, up, down',
    means: 'The direction the group sits from the bullseye, as seen looking at the target.',
    formula: null,
  },
  {
    term: 'GPS',
    stands: 'global positioning system',
    means: 'The location a phone can record inside a photo. Photos keep it, so a backup file holds it too; keep backups private.',
    formula: null,
  },
  {
    term: 'EXIF',
    stands: 'exchangeable image file format',
    means: 'The extra data inside a photo: when it was taken, the camera, and the GPS location. The app reads the time from it.',
    formula: null,
  },
  {
    term: 'JSON',
    stands: 'JavaScript object notation',
    means: 'A plain-text data format. Backups and the Diagnostics data export are JSON files.',
    formula: null,
  },
  {
    term: 'PNG',
    stands: 'portable network graphics',
    means: 'The image format of the summary picture you share.',
    formula: null,
  },
  {
    term: 'HEIC',
    stands: 'high efficiency image container',
    means: 'The photo format iPhones use by default. The app converts these so it can analyse them.',
    formula: null,
  },
  {
    term: 'MB',
    stands: 'megabytes',
    means: 'File size. A backup is roughly the size of all your photos together.',
    formula: null,
  },
  {
    term: 'Official gauge touch',
    stands: null,
    icon: 'gauge',
    means:
      'The scoring rule that mirrors the official gauge: a shot scores the higher ring when the edge of its hole touches the ring line. The mark is a hole just touching the line from inside.',
    formula: 'the ring is credited when distance from the target centre − hole radius ≤ the ring radius, with the official gauge hole size.',
  },
  {
    term: 'Centre in ring',
    stands: null,
    icon: 'centre',
    means: 'The strictest rule: only the centre of the hole counts, so touching a line is not enough. The mark is a hole across the line with a dot at its centre.',
    formula: 'the ring is credited when distance from the target centre ≤ the ring radius.',
  },
  {
    term: 'Visible hole touch',
    stands: null,
    icon: 'visible',
    means: 'Like the official gauge, but with the smaller hole you can actually see on the paper (set in Settings → Scoring). The mark is a smaller hole touching the line.',
    formula: 'the ring is credited when distance from the target centre − visible hole radius ≤ the ring radius.',
  },
];
