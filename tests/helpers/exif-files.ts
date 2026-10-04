// Tiny JPEG, HEIC and PNG files carrying EXIF (orientation, capture time, and a GPS location), built in memory so no real
// location is ever committed. Only the metadata is real; the "image data" is a few placeholder bytes.

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
const be16 = (v: number) => [(v >> 8) & 0xff, v & 0xff];
const be32 = (v: number) => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];

export interface ExifContent {
  /** e.g. `2026:09:26 13:20:05` */
  dateTimeOriginal: string;
  orientation: number;
  /** Degrees, minutes, seconds north and east. */
  lat: [number, number, number];
  lon: [number, number, number];
}

export const SAMPLE_EXIF: ExifContent = { dateTimeOriginal: '2026:09:26 13:20:05', orientation: 6, lat: [51, 30, 12], lon: [7, 15, 30] };

/** A big-endian TIFF block: IFD0 (orientation, EXIF and GPS pointers), the EXIF IFD (capture time) and the GPS IFD. */
export function tiffWithGps(c: ExifContent = SAMPLE_EXIF): number[] {
  const entry = (tag: number, type: number, count: number, value: number[]) => [...be16(tag), ...be16(type), ...be32(count), ...value];
  const ifd0At = 8;
  const ifd0Size = 2 + 3 * 12 + 4;
  const exifAt = ifd0At + ifd0Size;
  const exifSize = 2 + 12 + 4;
  const dateAt = exifAt + exifSize;
  const gpsAt = dateAt + 20;
  const gpsSize = 2 + 4 * 12 + 4;
  const latAt = gpsAt + gpsSize;
  const lonAt = latAt + 24;
  const rational = (v: [number, number, number]) => v.flatMap((n) => [...be32(n), ...be32(1)]);
  return [
    ...ascii('MM'), ...be16(42), ...be32(ifd0At),
    ...be16(3),
    ...entry(0x0112, 3, 1, [...be16(c.orientation), 0, 0]),
    ...entry(0x8769, 4, 1, be32(exifAt)),
    ...entry(0x8825, 4, 1, be32(gpsAt)),
    ...be32(0),
    ...be16(1),
    ...entry(0x9003, 2, 20, be32(dateAt)),
    ...be32(0),
    ...ascii(c.dateTimeOriginal), 0,
    ...be16(4),
    ...entry(0x0001, 2, 2, [...ascii('N'), 0, 0, 0]),
    ...entry(0x0002, 5, 3, be32(latAt)),
    ...entry(0x0003, 2, 2, [...ascii('E'), 0, 0, 0]),
    ...entry(0x0004, 5, 3, be32(lonAt)),
    ...be32(0),
    ...rational(c.lat),
    ...rational(c.lon),
  ];
}

const segment = (marker: number, payload: number[]) => [0xff, marker, ...be16(payload.length + 2), ...payload];
const SCAN = [...segment(0xda, [1, 1, 0, 0, 0x3f, 0]), 0x12, 0x34, 0x56, 0xff, 0xd9];

export const XMP_WITH_LOCATION =
  '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF><rdf:Description exif:GPSLatitude="51,30.2N" photoshop:City="Lakeside">' +
  '<exif:GPSLongitude>7,15.5E</exif:GPSLongitude><dc:title>Range day</dc:title></rdf:Description></rdf:RDF></x:xmpmeta>';

/** A JPEG with EXIF (and optionally an XMP packet and an IPTC block). */
export function jpegWithGps(opts: { xmp?: string; iptc?: boolean } = {}): Uint8Array {
  const xmp = opts.xmp === undefined ? [] : segment(0xe1, [...ascii('http://ns.adobe.com/xap/1.0/'), 0, ...ascii(opts.xmp)]);
  const iptc = opts.iptc ? segment(0xed, [...ascii('Photoshop 3.0'), 0, ...ascii('8BIM'), 4, 4, 0, 0, ...ascii('Lakeside')]) : [];
  return new Uint8Array([0xff, 0xd8, ...segment(0xe1, [...ascii('Exif'), 0, 0, ...tiffWithGps()]), ...xmp, ...iptc, ...SCAN]);
}

const box = (type: string, body: number[]) => [...be32(body.length + 8), ...ascii(type), ...body];
const fullBox = (type: string, version: number, body: number[]) => box(type, [version, 0, 0, 0, ...body]);

/** A HEIC skeleton as an iPhone writes one: ftyp, a meta box naming an Exif item, and the item's bytes in mdat. */
export function heicWithGps(): Uint8Array {
  const exifPayload = [...be32(6), ...ascii('Exif'), 0, 0, ...tiffWithGps()];
  const ftyp = box('ftyp', [...ascii('heic'), ...be32(0), ...ascii('mif1'), ...ascii('heic')]);
  const hdlr = fullBox('hdlr', 0, [...be32(0), ...ascii('pict'), ...be32(0), ...be32(0), ...be32(0), 0]);
  const infe = fullBox('infe', 2, [...be16(1), ...be16(0), ...ascii('Exif'), 0]);
  const iinf = fullBox('iinf', 0, [...be16(1), ...infe]);
  // iloc v0: 4-byte offsets and lengths, no base offset; the offset is patched in once the layout is known.
  const ilocFor = (offset: number) => fullBox('iloc', 0, [0x44, 0x00, ...be16(1), ...be16(1), ...be16(0), ...be16(1), ...be32(offset), ...be32(exifPayload.length)]);
  const metaFor = (offset: number) => fullBox('meta', 0, [...hdlr, ...iinf, ...ilocFor(offset)]);
  const exifAt = ftyp.length + metaFor(0).length + 8;
  return new Uint8Array([...ftyp, ...metaFor(exifAt), ...box('mdat', exifPayload)]);
}

/** A PNG with an eXIf chunk (and its checksum) between IHDR and IEND. */
export function pngWithGps(): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const chunk = (type: string, data: number[]) => {
    const body = [...ascii(type), ...data];
    let c = 0xffffffff;
    for (const v of body) c = crcTable[(c ^ v) & 0xff]! ^ (c >>> 8);
    return [...be32(data.length), ...body, ...be32((c ^ 0xffffffff) >>> 0)];
  };
  const ihdr = chunk('IHDR', [...be32(1), ...be32(1), 8, 2, 0, 0, 0]);
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...ihdr, ...chunk('eXIf', tiffWithGps()), ...chunk('IEND', [])]);
}
