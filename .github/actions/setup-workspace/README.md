# setup-workspace

Composite GitHub Action that prepares the Yarn workspace for CI jobs.

## Inputs

- `node-version` (required): Node.js version used in cache keys.
- `use-cache` (optional, default: `"true"`): enables or disables Yarn cache restore/save.

## What It Does

1. Generates `.yarnrc.yml` from `.yarnrc.dist.yml` and disables global cache.
2. Restores/saves Yarn PnP cache when `use-cache` is enabled.
3. Installs dependencies with `yarn install`.

## Usage

```yaml
- uses: ./.github/actions/setup-workspace
  with:
    node-version: 24.x
```
