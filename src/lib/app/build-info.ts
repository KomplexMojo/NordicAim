// M22 (REV-47): what Settings → About shows, so a tester can say which build they are on.

export const APP_NAME = 'Nordic Aim';

/** The short git SHA Vite embeds at build time (vite.config.ts), or 'dev' when it has none. */
export const BUILD_SHA: string = import.meta.env.VITE_BUILD_SHA ?? 'dev';
