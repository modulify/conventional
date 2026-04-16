# Conventional commits toolkit

[🌐 Translations](./docs/INDEX.md#readme) • [📜 Code of Conduct](./CODE_OF_CONDUCT.md)

Monorepo with tools for analyzing git history and building a release core according to the [Conventional Commits specification](https://www.conventionalcommits.org/en/v1.0.0/).

[![Tests Status](https://github.com/modulify/conventional/actions/workflows/tests.yml/badge.svg)](https://github.com/modulify/conventional/actions)
[![codecov](https://codecov.io/gh/modulify/conventional/branch/main/graph/badge.svg)](https://codecov.io/gh/modulify/conventional)

## Packages

- [`@modulify/conventional-git`](./packages/conventional-git) [![npm version](https://img.shields.io/npm/v/%40modulify%2Fconventional-git?label=npm)](https://www.npmjs.com/package/@modulify/conventional-git) — Thin wrapper over git with conventional-commit parsing and semantic tag helpers.
- [`@modulify/conventional-bump`](./packages/conventional-bump) [![npm version](https://img.shields.io/npm/v/%40modulify%2Fconventional-bump?label=npm)](https://www.npmjs.com/package/@modulify/conventional-bump) — Semantic-release helper that recommends the next version (major/minor/patch).
- [`@modulify/conventional-changelog`](./packages/conventional-changelog) [![npm version](https://img.shields.io/npm/v/%40modulify%2Fconventional-changelog?label=npm)](https://www.npmjs.com/package/@modulify/conventional-changelog) — Generate a changelog from your git history using Nunjucks templates.
- [`@modulify/conventional-release`](./packages/conventional-release) [![npm version](https://img.shields.io/npm/v/%40modulify%2Fconventional-release?label=npm)](https://www.npmjs.com/package/@modulify/conventional-release) — Library-first release-core package with a config-driven CLI.

## High-level release flow

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

The `@modulify/conventional-release` package combines:
- version recommendation from `@modulify/conventional-bump`
- changelog writing from `@modulify/conventional-changelog`
- manifest updates
- release commit and tag creation

This package is intentionally a release core:
- it plans the release scope
- computes versions
- updates files
- creates the release commit and tags

It does not publish packages to npm and does not create hosted releases on GitHub or GitLab.
Those delivery steps are expected to live in higher-level tools built on top of this core.

It also ships the `conventional-release` binary, so a consumer project can use:

```json
{
  "scripts": {
    "release": "conventional-release",
    "release:dry": "conventional-release --dry"
  }
}
```

See the package README for the full API and CLI reference: [`@modulify/conventional-release`](./packages/conventional-release/README.md)

## Scope

`@modulify/conventional-release` is designed for repository-local release work:

- discovering affected packages
- grouping them into release slices
- computing versions from commit history
- updating manifests and changelog files
- finalizing the release with a commit and tags

It is not designed to be an all-in-one delivery pipeline.
If you need `npm publish`, GitHub Releases, GitLab Releases, or CI-specific deployment steps,
the intended approach is to add them in a separate orchestration layer on top of this project.

## Low-level composition

If you want to build your own release flow, the lower-level packages can still be used directly:

```ts
import { Client } from '@modulify/conventional-git'
import { ReleaseAdvisor } from '@modulify/conventional-bump'

import { createWrite } from '@modulify/conventional-changelog'

import semver from 'semver'

const git = new Client()
const advisor = new ReleaseAdvisor({ git })

const currentVersion = await git.version() ?? '0.0.0'
const recommendation = await advisor.advise({
  preMajor: semver.lt(currentVersion, '1.0.0')
})

if (recommendation) {
  const nextVersion = semver.inc(currentVersion, recommendation.type)
  const write = createWrite({ git, file: 'CHANGELOG.md' })

  await write(nextVersion)
  console.log(`Next release: ${nextVersion}`)
}
```

## Why this exists

The project did not start as an abstract experiment. It grew out of a practical need to work with deeply
nested workspace trees, including repositories with two or three levels of nesting, where most release tools
on the market still assume a flat or near-flat monorepo layout.

## Repository development

Local setup:

```bash
make .yarnrc.yml
yarn install
```

Useful commands:

```bash
make test
make test-coverage
make build
make typecheck
make eslint
```

Release preview for this repository:

```bash
yarn release:dry
```
