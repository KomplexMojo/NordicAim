#!/bin/bash
# SessionStart hook for Claude Code on the web: installs dependencies so `pnpm check` and the
# Chromium e2e tests run in a fresh cloud container. Does nothing on a local machine.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Run in the background so the session starts without waiting for the install. Commands that need
# node_modules can race it on the first turn; if one fails with missing modules, re-run `pnpm install`.
echo '{"async": true, "asyncTimeout": 900000}'

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

# The owner's photos, reviews and labels live in a separate private repo, cloned into the gitignored
# fixtures/private/ so `pnpm cv:eval`, `pnpm review:detection` and the tests that need them can run.
# The session only reaches it when that repo is attached to it; otherwise this skips and those tests skip
# themselves as before. Never fails the hook, and never prompts for credentials.
FIXTURES_REPO="${NORDICAIM_FIXTURES_REPO:-https://github.com/KomplexMojo/NordicAim-fixtures}"
FIXTURES_DIR=fixtures/private
export GIT_TERMINAL_PROMPT=0
if [ -d "$FIXTURES_DIR/.git" ]; then
  timeout 300 git -C "$FIXTURES_DIR" pull --ff-only --quiet >&2 \
    || echo "session-start: could not update $FIXTURES_DIR; using the copy already here" >&2
elif [ -e "$FIXTURES_DIR" ]; then
  echo "session-start: $FIXTURES_DIR exists but is not a clone of $FIXTURES_REPO; leaving it alone" >&2
elif timeout 600 git clone --depth 1 --quiet "$FIXTURES_REPO" "$FIXTURES_DIR" >&2; then
  echo "session-start: cloned private fixtures into $FIXTURES_DIR" >&2
else
  rm -rf "$FIXTURES_DIR"
  echo "session-start: private fixtures not reachable ($FIXTURES_REPO); tests that need them will skip" >&2
fi
