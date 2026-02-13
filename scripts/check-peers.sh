#!/usr/bin/env bash
set -euo pipefail

output="$(yarn explain peer-requirements)"
failed="$(printf '%s\n' "$output" | grep '✘' || true)"

if [ -n "$failed" ]; then
  printf '%s\n' "$failed"
  echo "Peer requirements check failed: unresolved peer requirements were found." >&2
  exit 1
fi

echo "Peer requirements check passed."
