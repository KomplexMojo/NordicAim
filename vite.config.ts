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
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Nordic Aim',
        short_name: 'Nordic Aim',
        display: 'standalone',
        start_url: './',
        scope: './',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,heic,wasm,json,webmanifest}'],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
      },
    }),
  ],
});
