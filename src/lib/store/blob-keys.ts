/** Blob keys (data-model §6). */

export function photoOriginalKey(photoId: string): string {
  return `photo:${photoId}:original`;
}
export function photoWorkingKey(photoId: string): string {
  return `photo:${photoId}:working`;
}
export function photoThumbKey(photoId: string): string {
  return `photo:${photoId}:thumb`;
}
export function photoPrefix(photoId: string): string {
  return `photo:${photoId}:`;
}

export function diagramFullSvgKey(photoId: string): string {
  return `diagram:${photoId}:full-svg`;
}
export function diagramFullPngKey(photoId: string): string {
  return `diagram:${photoId}:full-png`;
}
export function diagramCellSvgKey(photoId: string): string {
  return `diagram:${photoId}:cell-svg`;
}
export function diagramPrefix(photoId: string): string {
  return `diagram:${photoId}:`;
}

export function artifactPngKey(artifactId: string): string {
  return `artifact:${artifactId}:png`;
}
export function artifactJsonKey(artifactId: string): string {
  return `artifact:${artifactId}:json`;
}
export function artifactPrefix(artifactId: string): string {
  return `artifact:${artifactId}:`;
}

/** template-reference.md §4 (REV-121): the user's own reference sheet for a template, a JPEG. */
export function referenceImageKey(template: 'sighting' | 'precision'): string {
  return `reference:${template}:image`;
}
