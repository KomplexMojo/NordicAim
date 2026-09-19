// rendering-composite.md §6. The `CompositeArtifact` type (a branded `ArtifactMeta` plus the
// `sessionId` it belongs to — the brand exists so a plain `ArtifactMeta` can never be passed to
// `loadArtifact`/`shareArtifact` by accident) and the two errors `composite/build.ts` throws.
// `artifactBrand` is a `declare const` (type-only): the brand is applied with `as CompositeArtifact`,
// and that cast happens ONLY inside `src/lib/composite/build.ts`.

declare const artifactBrand: unique symbol;

export interface CompositeArtifact {
  readonly [artifactBrand]: true;
  id: string;
  sessionId: string;
  widthPx: number;
  heightPx: number;
  sha256: string;
  createdAt: string;
  /** rendering-composite.md §6: which renderer drew it; 0 for artifacts stored before the stamp existed. */
  rendererVersion: number;
}

/**
 * §5 height vectors / §6 step 1: thrown by `compositeHeight` (0 rows) and by `buildComposite` when
 * `selectDefaultSlots` returns no candidates at all.
 */
export class EmptyCompositeError extends Error {
  constructor(sessionId?: string) {
    super(sessionId === undefined ? 'No analyzed targets to build a summary image' : `No analyzed targets to build a summary image for session ${sessionId}`);
    this.name = 'EmptyCompositeError';
  }
}

/** §6: thrown by `loadArtifact` for an unknown id or a sha256 mismatch (tampered/corrupt bytes). */
export class ArtifactNotFoundError extends Error {
  constructor(sessionId: string, artifactId: string) {
    super(`Artifact not found: ${artifactId} (session ${sessionId})`);
    this.name = 'ArtifactNotFoundError';
  }
}
