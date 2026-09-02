#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

# Lerna 8 + npm workspaces. The @drax/* packages are installed from the
# public npm registry as ordinary dependencies (not workspace members),
# so no local build step is needed — they ship pre-compiled to dist/.
# This script used to call `npm run build -w @drax/...`, which fails
# because @drax/* are not workspace members. See SKILL.md pitfalls.

echo "Installing root deps..."
npm install

echo "Installing package deps..."
npm install --workspaces --include-workspace-root

echo "Done. Copy packages/containerhub-back/.env.example to .env and edit."
echo "Then:"
echo "  npm run dev:back    # http://localhost:9998"
echo "  npm run dev:front   # http://localhost:5173"
