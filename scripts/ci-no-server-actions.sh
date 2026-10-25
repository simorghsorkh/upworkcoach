#!/usr/bin/env bash
# CI guard (F-19, SEC-A10): Server Actions are forbidden. Every mutation is a
# Route Handler registered in routes.manifest.ts. Fails if any source file in
# apps/ or packages/ contains a "use server" directive (any quote style).
# Test files are skipped (they may mention the string to assert on it).
set -euo pipefail

cd "$(dirname "$0")/.."

pattern="[\"'\`]use server[\"'\`]"

status=0
matches=$(grep -rnE "$pattern" apps packages \
  --include='*.ts' --include='*.tsx' --include='*.mts' --include='*.cts' \
  --include='*.js' --include='*.jsx' --include='*.mjs' --include='*.cjs' \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist \
  --exclude-dir=out --exclude-dir=coverage --exclude-dir=tests \
  --exclude='*.test.*' --exclude='*.spec.*') || status=$?

# grep: 0 = match found, 1 = no match, >1 = error (fail closed).
case "$status" in
  0)
    echo "Found \"use server\" (Server Actions are forbidden, see security.md SEC-A10):" >&2
    echo "$matches" >&2
    exit 1
    ;;
  1)
    echo "OK: no \"use server\" directives in apps/ or packages/."
    ;;
  *)
    echo "grep failed with status $status" >&2
    exit "$status"
    ;;
esac
