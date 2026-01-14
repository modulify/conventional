# Conventional commits toolkit

[🌐 Translations](./docs/INDEX.md#readme) • [📜 Code of Conduct](./CODE_OF_CONDUCT.md)

Tools for analyzing git history and creating new releases according to [conventional commits specification](https://www.conventionalcommits.org/en/v1.0.0/).

[![Tests Status](https://github.com/modulify/conventional/actions/workflows/tests.yml/badge.svg)](https://github.com/modulify/conventional/actions)
[![codecov](https://codecov.io/gh/modulify/conventional/branch/main/graph/badge.svg)](https://codecov.io/gh/modulify/conventional)

## Packages

- [`@modulify/conventional-git`](./packages/conventional-git) — Thin wrapper over git with conventional-commit parsing and semantic tag helpers.
- [`@modulify/conventional-bump`](./packages/conventional-bump) — Semantic-release helper that recommends the next version (major/minor/patch).
- [`@modulify/conventional-changelog`](./packages/conventional-changelog) — Generate a changelog from your git history using Nunjucks templates.

## Usage example

```ts
import { Client } from '@modulify/conventional-git'
import { ReleaseAdvisor } from '@modulify/conventional-bump'
import { createWrite } from '@modulify/conventional-changelog'
import semver from 'semver'

const git = new Client()
const advisor = new ReleaseAdvisor({ git })

// 1. Get current version and recommend next one
const currentVersion = await git.version() ?? '0.0.0'
const recommendation = await advisor.advise({
  preMajor: semver.lt(currentVersion, '1.0.0')
})

if (recommendation) {
  const nextVersion = semver.inc(currentVersion, recommendation.type)

  // 2. Generate and write changelog
  const write = createWrite({ git, file: 'CHANGELOG.md' })
  await write(nextVersion)

  // 3. You can now update package.json, commit and tag
  console.log(`Next release: ${nextVersion}`)
}
```
