// Build-time constants Vite embeds (vite.config.ts `define`).
interface ImportMetaEnv {
  /** M22 (Settings → About): the short git SHA of this build, or 'dev'. */
  readonly VITE_BUILD_SHA?: string;
}
