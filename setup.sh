#!/usr/bin/env bash
# Deck Studio, first-time setup. Run from the folder you cloned:  ./setup.sh
# Installs dependencies, then starts the setup wizard (scripts/setup-wizard.ts).
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22 or newer is required."
  echo "  macOS:  brew install node@22     (or download from https://nodejs.org)"
  echo "  Linux:  https://nodejs.org/en/download"
  exit 1
fi

major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$major" -lt 22 ]; then
  echo "Found Node.js $(node -v); Deck Studio needs 22 or newer: https://nodejs.org"
  exit 1
fi

# pnpm: use it if installed, otherwise the copy that ships with Node (corepack), otherwise npx.
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
if command -v pnpm >/dev/null 2>&1; then
  PNPM=(pnpm)
elif command -v corepack >/dev/null 2>&1; then
  PNPM=(corepack pnpm)
else
  PNPM=(npx --yes pnpm@10.28.2)
fi

echo "Installing dependencies (a few minutes the first time)…"
"${PNPM[@]}" install --frozen-lockfile

exec "${PNPM[@]}" exec tsx scripts/setup-wizard.ts "$@"
