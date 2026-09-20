// rendering-composite.md §6 (REV-58). Brings stored per-target diagrams up to the current renderer.

import { DIAGRAM_RENDERER_VERSION } from '@/lib/render/version';
import { getSettings, putSettings } from '@/lib/store/settings-repo';

import type { ServiceContext } from './context';
import { rescoreAll, type RescoreReport } from './rescore';

/**
 * Called once at app start. When the version recorded in settings is behind `DIAGRAM_RENDERER_VERSION`, every
 * finished analysis goes back to Stage B (which redraws its diagrams and rebuilds the session summary), and the
 * recorded version is brought up to date. Shots and alignment are never touched.
 *
 * The version is written **after** the re-score has been queued: a failure part-way leaves the setting behind, so
 * the next launch tries again rather than never.
 */
export async function refreshStaleDiagrams(ctx: ServiceContext): Promise<RescoreReport | null> {
  const settings = await getSettings(ctx.db);
  if (settings.diagramRendererVersion >= DIAGRAM_RENDERER_VERSION) return null;

  const report = await rescoreAll(ctx);
  await putSettings(ctx.db, { ...settings, diagramRendererVersion: DIAGRAM_RENDERER_VERSION });
  return report;
}
