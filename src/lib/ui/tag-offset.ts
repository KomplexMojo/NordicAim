// REV-96: where a shot's grab tag sits so the finger is clear of the hole and the tag stays on screen. Pure.

/** Tag centre offsets from the marker, in CSS px: up and to the side first, then the other corners. */
const TAG_OFFSETS: ReadonlyArray<[number, number]> = [
  [40, -46],
  [-40, -46],
  [40, 46],
  [-40, 46],
];
export const TAG_RADIUS_CSS = 17;

/** The first offset whose tag stays on screen (with a margin); the first one when none does. */
export function tagOffsetCss(
  p: { x: number; y: number },
  scale: number,
  visible: { x0: number; y0: number; x1: number; y1: number } | null | undefined,
): [number, number] {
  if (visible == null) return TAG_OFFSETS[0]!;
  const m = (TAG_RADIUS_CSS + 4) / scale;
  const fits = ([dx, dy]: [number, number]) => {
    const x = p.x + dx / scale;
    const y = p.y + dy / scale;
    return x - m >= visible.x0 && x + m <= visible.x1 && y - m >= visible.y0 && y + m <= visible.y1;
  };
  return TAG_OFFSETS.find(fits) ?? TAG_OFFSETS[0]!;
}
