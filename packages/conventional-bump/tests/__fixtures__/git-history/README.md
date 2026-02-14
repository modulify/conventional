# Git History Fixtures

This directory stores reusable git-history scenarios for integration tests.

Each fixture contains:

- `scenario.json` with ordered commit steps.
- patch files (`.patch`) that are applied with `git apply --index` before each commit.

This keeps scenarios close to real usage:

- commit history is replayed step-by-step,
- file changes are versioned as patch slices,
- no external patching dependencies are required.

If a future scenario requires tooling that cannot be reproduced with plain git
patches, keep partial snapshot slices in the fixture directory and replay them
in order. Full repository snapshots should be avoided.
