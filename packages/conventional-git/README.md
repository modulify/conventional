# @modulify/conventional-git

[![codecov](https://codecov.io/gh/modulify/conventional/branch/main/graph/badge.svg?flag=conventional-git)](https://codecov.io/gh/modulify/conventional?flags[0]=conventional-git)

[🌐 Translations](./docs/INDEX.md)

Thin wrapper over git that adds conventional-commit parsing and semantic tag helpers.

- Repository: https://github.com/modulify/conventional
- Spec: https://www.conventionalcommits.org/en/v1.0.0/

## Installation

- npm: `npm i @modulify/conventional-git`
- yarn: `yarn add @modulify/conventional-git`
- pnpm: `pnpm add @modulify/conventional-git`

## Quick start

```
import { Client, packagePrefix } from '@modulify/conventional-git'

const git = new Client()

// Read parsed commits (async iterable)
for await (const c of git.commits()) {
  console.log(c.type, c.scope, c.subject)
}

// Get semver tags (async iterable)
for await (const t of git.tags({ clean: true })) {
  console.log('tag:', t)
}

// Get latest version from tags
console.log(await git.version())

// Work with package-scoped tags
const prefix = packagePrefix('my-package') // => 'my-package@'
for await (const t of git.tags({ prefix, clean: true })) {
  console.log('my-package version:', t)
}
```

## Public API

### Functions

- `packagePrefix(packageName?: string): string | RegExp`
  - Returns a prefix for package-specific semver tags. If no name is provided, returns a RegExp that matches any `<name>@` prefix.

### Client

Constructor:

```
new Client(options?: { cwd?: string; git?: GitClient })
```

Properties:
* `git` — access to the underlying low-level client.

Methods:

* `commits` – Returns async iterable of parsed conventional commits.
* `tags` – Streams semver tags. When `prefix` is provided, only tags with that prefix are considered.
  `skipUnstable` skips prereleases. With `clean: true`, the returned items are cleaned versions (e.g. `1.2.3`).
* `version` – Returns the latest semantic version (sorted with semver) or `null` when no semver tag is found.
* `url` – Returns the repository URL (from git remote). Default remote is `origin`.
