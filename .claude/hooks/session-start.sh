#!/bin/bash
# SessionStart hook for Claude Code on the web: installs dependencies so `pnpm check` and the
# Chromium e2e tests run in a fresh cloud container. Does nothing on a local machine.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Run in the background so the session starts without waiting for the install. Commands that need
# node_modules can race it on the first turn; if one fails with missing modules, re-run `pnpm install`.
echo '{"async": true, "asyncTimeout": 300000}'

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# The container's preinstalled Chromium is older than the build the pinned Playwright expects.
# The Playwright configs read PLAYWRIGHT_CHROMIUM_PATH and launch this binary instead. WebKit is not
# available in the container, so run e2e with `--project=mobile-chromium` there. Set before the
# install so it is in place as early as possible.
if [ -x /opt/pw-browsers/chromium ] && [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium' >> "$CLAUDE_ENV_FILE"
fi

# `pnpm install` (not --frozen-lockfile) so a cached container only fetches what changed.
pnpm install
