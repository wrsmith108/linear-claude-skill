#!/usr/bin/env sh
# Shared runner: tries dist/ build first, falls back to tsx.
# Usage: sh scripts/run.sh <script-name> [args...]
name="$1"; shift
[ -f "dist/${name}.js" ] && exec node "dist/${name}.js" "$@"
echo "[WARN] dist/ not built, using tsx (slower). Run: npm run build" >&2
exec npx tsx "scripts/${name}.ts" "$@"
