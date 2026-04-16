# @modulify/conventional-release

[![npm version](https://img.shields.io/npm/v/%40modulify%2Fconventional-release?label=npm)](https://www.npmjs.com/package/@modulify/conventional-release)

Release-core package for conventional workflows.

This workspace combines:
- semantic version recommendation from `@modulify/conventional-bump`,
- changelog rendering and writing from `@modulify/conventional-changelog`,
- package manifest updates,
- release finalization with commit and tag creation.

The package is library-first. It exposes:
- `createScope()` to inspect what would be released,
- `run()` to apply the release flow,
- `conventional-release` as a config-driven CLI binary.

## Scope and non-goals

This package is intentionally focused on release-core responsibilities inside the repository:

- discover the release scope
- compute versions from commit history
- update manifests and changelog files
- finalize the release with a commit and tags

It does not try to be an all-in-one delivery tool.
In particular, `npm publish`, GitHub Releases, GitLab Releases, registry credentials, and deployment-specific CI steps are out of scope for this package.

The intended layering is:
- `@modulify/conventional-release` handles planning and repository-local release finalization
- higher-level tools can add publishing, hosting, or CI-specific orchestration on top

## Installation

```bash
yarn add -D @modulify/conventional-release
```

Other package managers:

```bash
npm install -D @modulify/conventional-release
pnpm add -D @modulify/conventional-release
bun add -d @modulify/conventional-release
```

## Mental model

The package works in two stages:

1. `createScope(options)` discovers the release scope for the repository.
It resolves packages, filters workspaces, detects affected packages, and produces ordered release slices.
2. `run(options)` resolves the same scope and applies side effects.
It updates manifests, writes the changelog, creates a commit, and creates tags.

That is the end of this package's responsibility boundary.
Delivery steps outside the repository, such as package publication or hosted release creation, should be implemented above this layer.

`Scope` is the declarative view of a release.
`Slice` is one execution unit inside that scope.

In `sync` mode there is usually one slice for the whole repository.
In `async` mode each affected package gets its own slice.
In `hybrid` mode packages can be split into named `partitions`.

## Quick start

```ts
import { run } from '@modulify/conventional-release'

const result = await run()

if (!result.changed) {
  console.log('No changes since last release')
} else {
  for (const slice of result.slices) {
    if (!slice.changed) continue

    console.log(slice.id, slice.nextVersion, slice.tag)
  }
}
```

## CLI

The package ships a `conventional-release` binary.

Typical usage:

```bash
conventional-release
conventional-release --dry
conventional-release --dry --verbose --tags
```

From a project script:

```json
{
  "scripts": {
    "release": "conventional-release",
    "release:dry": "conventional-release --dry"
  }
}
```

Without adding a local script:

```bash
npx @modulify/conventional-release --dry
npm exec conventional-release -- --dry
yarn dlx @modulify/conventional-release --dry
pnpm dlx @modulify/conventional-release --dry
bunx @modulify/conventional-release --dry
```

Useful flags:

- `--dry`: compute versions, files, and tags without write-side effects
- `--verbose`: show detailed per-slice progress output
- `--tags`: print generated tags in the final summary
- `--release-as <type>`: force `major`, `minor`, or `patch`
- `--prerelease <channel>`: use `alpha`, `beta`, or `rc`

The CLI reads the same repository configuration as the library API and wires a lifecycle reporter into `run()`.
It stops after repository-local release finalization and does not publish artifacts.

## Inspect before running

Use `createScope()` when you want a dry, deterministic view of the release shape:

```ts
import { createScope } from '@modulify/conventional-release'

const scope = await createScope({
  mode: 'hybrid',
})

console.log(scope.mode)
console.log(scope.packages.map((pkg) => pkg.path))
console.log(scope.slices.map((slice) => slice.id))
```

This is useful for:
- the built-in package CLI,
- custom CLIs,
- dashboards,
- approval flows,
- tests around release planning.

## Running a release

`run()` applies the release flow and returns per-slice results:

```ts
import { run } from '@modulify/conventional-release'

const result = await run({
  mode: 'sync',
  dry: true,
})

console.log(result.changed)
console.log(result.files)
console.log(result.slices)
```

When `dry: true` is used, the package still resolves versions, tags, and touched files, but skips write-side effects.

## Configuration sources

Configuration is resolved in this order:

1. `package.json` field `release`
2. `release.config.ts`, `release.config.mjs`, or `release.config.js`
3. inline options passed to `run()` or `createScope()`

Inline options always win.

Example `package.json`:

```json
{
  "name": "example-repo",
  "version": "1.0.0",
  "release": {
    "mode": "sync",
    "tagPrefix": "v"
  }
}
```

Example `release.config.ts`:

```ts
import type { Options } from '@modulify/conventional-release'

const config: Options = {
  mode: 'hybrid',
  partitions: {
    core: {
      mode: 'sync',
      workspaces: ['@scope/core-*'],
    },
    plugins: {
      mode: 'async',
      workspaces: ['packages/plugins/*'],
      tagPrefix: 'plugin-',
    },
  },
}

export default config
```

## Common options

The most important public options are:

- `mode`: release strategy, one of `sync`, `async`, or `hybrid`
- `releaseAs`: explicit semver bump override such as `major`, `minor`, or `patch`
- `prerelease`: prerelease channel, one of `alpha`, `beta`, or `rc`
- `fromTag`: explicit lower bound tag for advisory commit analysis
- `tagPrefix`: tag matcher used during advisory commit analysis
- `workspaces`: include and exclude filters for workspace discovery
- `partitions`: named hybrid slices for mixed release strategies
- `dependencyPolicy`: how internal dependency ranges are updated, one of `preserve`, `caret`, or `exact`
- `install`: whether install should run after manifest updates
- `tagName`, `tagMessage`, `commitMessage`: custom formatters for release output
- `changelogFile`: changelog output path relative to the repository root

Important:
- `tagPrefix` affects release discovery and commit analysis boundaries.
- `tagPrefix` does not format the new tag name by itself.
- To change produced tag names, use `tagName`.

## Single-package repository

```ts
import { run } from '@modulify/conventional-release'

await run({
  mode: 'sync',
  fromTag: 'v1.0.0',
})
```

This is the simplest setup and usually produces one slice:
- one next version,
- one commit,
- one tag.

By default, a changed `sync` slice produces a tag like `v1.2.3`.

## Monorepo with independent packages

```ts
import { run } from '@modulify/conventional-release'

await run({
  mode: 'async',
  workspaces: {
    include: ['packages/*'],
  },
})
```

This creates one slice per affected package.

By default, each changed async slice produces a tag like `package-name@1.2.3`.

## Monorepo with grouped release behavior

```ts
import { run } from '@modulify/conventional-release'

await run({
  mode: 'hybrid',
  partitions: {
    app: {
      mode: 'sync',
      workspaces: ['@scope/app', '@scope/web'],
    },
    plugins: {
      mode: 'async',
      workspaces: ['packages/plugins/*'],
    },
  },
})
```

This is useful when some packages must move in lockstep, while others can release independently.

By default, partition slices use tags like `partition-name@1.2.3`.

## Result shape

`run()` returns:

- `changed`: whether at least one slice changed version
- `files`: all files touched by changed slices
- `packages`: all packages in resolved scope
- `affected`: packages affected by the current working tree
- `slices`: ordered slice results with:
  - `id`
  - `kind`
  - `mode`
  - `packages`
  - `currentVersion`
  - `nextVersion`
  - `releaseType`
  - `tag`
  - `commitMessage`
  - `tagMessage`

Example:

```ts
const result = await run({ dry: true })

for (const slice of result.slices) {
  console.log({
    id: slice.id,
    changed: slice.changed,
    nextVersion: slice.nextVersion,
    tag: slice.tag,
  })
}
```

## Install behavior

After manifest updates the package can run the repository package manager install command.

`install` supports three forms:

- `false`: skip install entirely
- `true` or omitted: run install with default extra arguments for the detected package manager
- `string[]`: run install and append these extra arguments after the `install` subcommand

Example:

```ts
await run({
  install: ['--mode=skip-build'],
})
```

That becomes conceptually:

```bash
<package-manager> install --mode=skip-build
```

## Package manager detection

The package detects the package manager in this order:

1. `package.json#packageManager`
2. lockfiles in the repository root
3. fallback to `npm`

Recognized lockfiles:

- `yarn.lock`
- `pnpm-lock.yaml`
- `package-lock.json`
- `bun.lock`
- `bun.lockb`

Default install extras:

- `yarn`: `--no-immutable`
- `npm`: no extra args
- `pnpm`: no extra args
- `bun`: no extra args

## Tag and message customization

Custom formatters receive a `TagContext` object:

```ts
import { run } from '@modulify/conventional-release'

await run({
  tagName: ({ version, partition, packages }) => {
    const name = partition ?? packages[0]?.name ?? 'release'

    return `${name}@${version}`
  },
  commitMessage: ({ tag }) => `chore(release): ${tag}`,
  tagMessage: ({ tag }) => `chore(release): ${tag}`,
})
```

## Notes

- The package detects the package manager from `package.json#packageManager` or lockfiles.
- The default fallback package manager is `npm`.
- The package does not perform `git push`.
- CLI-style push hints belong in the CLI layer, not in the library result.
