import { execSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const CSP = [
  "default-src 'self'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  // No 'unsafe-eval': OpenCV.js runs in a module Web Worker, which this page's meta CSP does not govern
  // (verified in WebKit and Chromium by tests/e2e-prod). See docs/spec/privacy-storage-hosting.md §3.
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function injectCsp(): Plugin {
  return {
    name: 'inject-csp',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle) return html;
        return html.replace(
          '<head>',
          `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
        );
      },
    },
  };
}

/**
 * M22 (Settings → About): the git SHA of this build, so a tester can say which build they are on. CI
 * (GitHub Pages) provides GITHUB_SHA; a local build asks git; anything else is 'dev'.
 */
function buildSha(): string {
  const fromCi = process.env.GITHUB_SHA;
  if (fromCi) return fromCi.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev';
  } catch {
    return 'dev';
  }
}

/** REV-101 (#43): `version.json` beside index.html, so a running app can tell whether a newer build is deployed (same-origin GET). */
function emitVersionFile(): Plugin {
  return {
    name: 'emit-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ sha: buildSha(), builtAt: new Date().toISOString() }) });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  define: { 'import.meta.env.VITE_BUILD_SHA': JSON.stringify(buildSha()) },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@fixtures': fileURLToPath(new URL('./fixtures/reference', import.meta.url)),
    },
  },
  server: { host: '127.0.0.1', port: 3874, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173 },
  worker: { format: 'es' },
  plugins: [
    react(),
    tailwindcss(),
    injectCsp(),
    emitVersionFile(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'NordicAim',
        short_name: 'NordicAim',
        description: 'Take a picture of your target, add metadata, and get biathlon-style shot analysis — entirely on your phone.',
        display: 'standalone',
        start_url: './',
        scope: './',
        background_color: '#F7FAFD',
        theme_color: '#1F2630',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,heic,wasm,json,webmanifest}'],
        // Never cached by the worker: the whole point is to ask the network what is deployed now.
        globIgnores: ['**/version.json'],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
      },
    }),
  ],
});
