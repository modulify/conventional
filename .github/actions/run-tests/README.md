# run-tests

Composite GitHub Action that prepares the workspace and runs project tests.

## Inputs

- `node-version` (required): Node.js version used in cache keys.
- `test-command` (optional, default: `yarn test:coverage`): command used to run tests.

## What It Does

1. Runs `setup-workspace`.
2. Restores/saves package build outputs from `packages/*/dist`.
3. Builds packages on cache miss.
4. Runs the provided test command.

## Usage

```yaml
- uses: ./.github/actions/run-tests
  with:
    node-version: 24.x
    test-command: yarn test:coverage
```
