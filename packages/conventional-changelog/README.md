# @modulify/conventional-changelog

[🌐 Translations](./docs/INDEX.md)

Generate a changelog from your git history using conventional commits.
Groups entries by sections you define and skips commits reverted later.
Customizable with Nunjucks templates.

- Repository: https://github.com/modulify/conventional
- Spec: https://www.conventionalcommits.org/en/v1.0.0/

## Installation

- npm: `npm i @modulify/conventional-changelog`
- yarn: `yarn add @modulify/conventional-changelog`
- pnpm: `pnpm add @modulify/conventional-changelog`

## Quick start

```ts
import { createWrite } from '@modulify/conventional-changelog'

const write = createWrite({
  types: [
    { type: 'feat', section: 'Features' },
    { type: 'fix', section: 'Bug Fixes' },
  ],
})

const content = await write('1.0.0')
console.log(content)
```

You can also write directly to a file, and it will prepend with a header:

```ts
const write = createWrite({
  file: 'CHANGELOG.md',
  header: '# My Changelog',
})

await write('1.1.0')
```

## Public API

### createWrite

Factory function that creates a changelog writer.

```ts
createWrite(options?: ChangelogOptions): (version?: string) => Promise<string>
```

#### ChangelogOptions

- `cwd?: string` — Working directory for git commands.
- `git?: Client` — Custom `@modulify/conventional-git` client.
- `types?: CommitType[]` — Custom type-to-section mapping.
- `header?: string` — Static header for the changelog file (default: `# Changelog`).
- `context?: RenderContext` — Additional context for the template (host, owner, repository, etc).
- `render?: RenderFunction` — Custom render function.
- `file?: string` — Optional file path to write/prepend the changelog to.
- `output?: Writable` — Optional Node.js Writable stream to write the changelog to.

### createRender

Creates a render function based on Nunjucks templates.

```ts
createRender(templatesPaths?: string | string[]): RenderFunction
```

You can provide custom paths to your own `.njk` templates to override the default ones (`changelog.md.njk`, `commit.md.njk`, `header.md.njk`, `section.md.njk`).

### createEnvironment

Creates a Nunjucks environment with pre-configured filters (`forge`, `shorten`).

Behavior highlights:

- Groups commits into sections according to `types`.
- Skips commits that were later reverted; revert-of-revert chains are handled.
- Automatically detects repository URL from git remote to generate links for commits and issues (supports GitHub).
- When `file` is provided, it prepends the new version to the existing file content, keeping the header at the top.
