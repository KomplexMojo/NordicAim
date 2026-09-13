# M01: Scaffold and tooling

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| — | low | M | scaffold |

## Goal
A Next.js app skeleton with every tool, native dependency, and quality gate working, so later milestones
only add features.

## Read first
- `/AGENTS.md` (all)
- `docs/PLAN.md` §3 (decisions D1–D5, D8, D13)
- `docs/spec/access-deployment.md` §5 (headers), §6 (env vars)

## In scope
Next.js + TS strict + Tailwind + shadcn/ui; Vitest; Playwright; ESLint; pnpm scripts; runtime deps installed
and proven to load; `/api/health`; privacy check script; CI; `.env.example`; placeholder landing page.

## Out of scope
Auth (M05), any domain logic, the real UI design (M18), Docker (M19).

## Files
`package.json`, `.npmrc`, `.nvmrc`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`,
`playwright.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`,
`src/app/api/health/route.ts`, `src/lib/cv/opencv.ts`, `src/types/heic-convert.d.ts`,
`scripts/check-privacy.mjs`, `.github/workflows/ci.yml`, `.env.example`, `tests/unit/smoke.test.ts`,
`tests/e2e/smoke.spec.ts`, `README.md` (commands section).

## Steps
1. Scaffold into a temp dir (the repo root isn't empty):
   `pnpm dlx create-next-app@latest /tmp/asa-scaffold --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --yes`.
   Copy everything except `.git`, `README.md`, and `.gitignore` into the repo root. Merge any new
   `.gitignore` lines into the existing one without removing existing lines.
2. `.npmrc`: `save-exact=true`. `.nvmrc`: `22`. In `package.json` set `"packageManager": "pnpm@10.33.0"` and
   `"engines": { "node": ">=22" }`. Remove `^` and `~` from existing versions.
3. `tsconfig.json`: `"strict": true`, `"noUncheckedIndexedAccess": true`.
4. Install runtime deps: `zod sharp heic-convert exif-reader @techstark/opencv-js @resvg/resvg-js`.
   Dev deps: `vitest @vitest/coverage-v8 vite-tsconfig-paths @playwright/test tsx @types/node`.
   Run `pnpm exec playwright install chromium`.
5. `next.config.ts`: `output: 'standalone'`,
   `serverExternalPackages: ['sharp', '@resvg/resvg-js', '@techstark/opencv-js', 'heic-convert']`, and
   `headers()` exactly as in access-deployment §5.
6. shadcn: `pnpm dlx shadcn@latest init` (defaults), then add `button card input label select dialog tabs badge sonner separator checkbox radio-group slider scroll-area sheet toggle-group`.
7. Scripts:
   ```json
   "dev": "next dev -H 127.0.0.1 -p 3874",
   "build": "next build",
   "start": "next start -H 127.0.0.1 -p 3874",
   "typecheck": "tsc --noEmit",
   "lint": "eslint .",
   "test": "vitest run",
   "test:e2e": "playwright test",
   "check:privacy": "node scripts/check-privacy.mjs",
   "check": "pnpm typecheck && pnpm lint && pnpm test && pnpm check:privacy"
   ```
8. `vitest.config.ts`: node environment, `include: ['tests/unit/**/*.test.ts']`, `vite-tsconfig-paths` plugin.
9. `playwright.config.ts`: `webServer: { command: 'pnpm dev', url: 'http://127.0.0.1:3874/api/health', reuseExistingServer: !process.env.CI, env: { ASA_WORKSPACE_DIR: <tmp dir created in config> } }`, `use.baseURL 'http://127.0.0.1:3874'`, projects: chromium and `Pixel 7` device emulation.
10. `src/lib/cv/opencv.ts`, a lazy singleton:
    ```ts
    let p: Promise<any> | undefined;
    export function loadOpenCv(): Promise<any> {
      p ??= (async () => {
        const mod: any = await import('@techstark/opencv-js');
        let cv = mod.default ?? mod;
        if (typeof cv.then === 'function') cv = await cv;
        else if (!cv.Mat) await new Promise<void>(r => { cv.onRuntimeInitialized = () => r(); });
        return cv;
      })();
      return p;
    }
    ```
11. `src/app/api/health/route.ts` (`runtime = 'nodejs'`, `dynamic = 'force-dynamic'`): dynamically import
    `sharp`, `@resvg/resvg-js`, `exif-reader`, `heic-convert`, and `loadOpenCv()`. Return
    `{ ok: true, libs: { sharp: true, resvg: true, exifReader: true, heicConvert: true, opencv: typeof cv.Mat === 'function' } }`.
    On failure return 500 with the failing lib name.
12. `src/types/heic-convert.d.ts`: declare the module's default function
    `(opts: { buffer: Buffer | ArrayBuffer; format: 'JPEG' | 'PNG'; quality?: number }) => Promise<ArrayBuffer>`.
13. `scripts/check-privacy.mjs`:
    - Fail if `git ls-files fixtures/private` prints anything.
    - For every tracked or staged file (`git ls-files -co --exclude-standard`) ending in
      `.jpg .jpeg .png .heic .heif .tif .tiff`, not under `node_modules`: read with sharp `metadata()`. If
      `exif` exists, parse with `exif-reader`; fail if a GPS latitude exists (check `GPSInfo ?? gps`).
    - Print `privacy check passed (<n> images)`; exit 1 with the offending paths otherwise.
14. `src/app/page.tsx`: a full-bleed placeholder with an `<h1>` of **Biathlete Harness** and the subtitle
    "advanced-shooting-analysis". Put palette tokens from spec/rendering-composite.md §1 into `globals.css` as
    CSS variables (`--asa-page`, `--asa-panel`, … one per token).
15. `.env.example` with all vars from access-deployment §6, empty values.
16. `.github/workflows/ci.yml`: on push/PR, ubuntu-latest, Node 22, `pnpm/action-setup`,
    `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm build`.
17. README: add a "Development" section with the commands table from AGENTS.md.

## Tests
- `tests/unit/smoke.test.ts`: `expect(1 + 1).toBe(2)`, plus import `sharp` and assert `typeof sharp === 'function'`.
- `tests/e2e/smoke.spec.ts`: `/` shows heading "Biathlete Harness"; `GET /api/health` returns
  `ok: true` with all libs true.

## Acceptance
```bash
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm test:e2e
```
Also: `curl -s http://127.0.0.1:3874/api/health` while `pnpm dev` runs shows every lib `true`.

## Pitfalls
- Never bind `0.0.0.0`. Don't add `-H 0.0.0.0` to "test on phone"; M08 uses Tailscale serve instead.
- Next 16 removed `next lint`; use `eslint .`.
- If opencv import hangs in dev, confirm it's listed in `serverExternalPackages`.
- Don't commit `fixtures/private/` (already gitignored). Run `git status` before committing.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
