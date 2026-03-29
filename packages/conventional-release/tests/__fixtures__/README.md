# Release Integration Fixtures

Fixtures are grouped by use case:

- `case-sync/*` for synchronized release flow examples.
- `case-config/*` for repository configuration and precedence examples.
- `case-hybrid/*` for hybrid scope and partitioned release flow examples.

Each fixture directory contains:

- `scenario.json` with ordered commit steps,
- patch slices under `patches/*.patch`, applied sequentially before each commit.
