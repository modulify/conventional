# @modulify/conventional-bump

[![codecov](https://codecov.io/gh/modulify/conventional/branch/main/graph/badge.svg?flag=conventional-bump)](https://codecov.io/gh/modulify/conventional?flags[0]=conventional-bump)

[🌐 Translations](./docs/INDEX.md)

Semantic-release helper that analyzes conventional commits and recommends the next version (major/minor/patch)
based on your git history.

- Repository: https://github.com/modulify/conventional
- Spec: https://www.conventionalcommits.org/en/v1.0.0/

## Installation

- npm: `npm i @modulify/conventional-bump`
- yarn: `yarn add @modulify/conventional-bump`
- pnpm: `pnpm add @modulify/conventional-bump`

## Quick start

```
import { ReleaseAdvisor } from '@modulify/conventional-bump'

const advisor = new ReleaseAdvisor()
const recommendation = await advisor.advise()

if (recommendation) {
  console.log(recommendation.type)   // 'major' | 'minor' | 'patch'
  console.log(recommendation.reason) // human–readable explanation
}
```

## Public API

### Types

- `type ReleaseType = 'major' | 'minor' | 'patch'`
- `type ReleaseRecommendation = { type: ReleaseType; reason: string }`
- `type CommitType = { type: string; section: string; hidden?: boolean }`

### Constants

- `DEFAULT_COMMIT_TYPES: CommitType[]`
  - Default mapping of commit types to sections and visibility (feat, fix, perf, revert are visible; others are hidden).

### ReleaseAdvisor

Creates an analyzer that reads commits from git and recommends the next semantic version.

Constructor:

```
new ReleaseAdvisor(options?: {
  cwd?: string;         // Working directory for git commands
  git?: Client;         // Custom @modulify/conventional-git client (for tests)
  parse?: ParseOptions; // Conventional commit parser options (@modulify/conventional-git)
  types?: CommitType[]; // Custom type-to-section mapping
})
```

Method:

```
advise(options?: {
  ignore?: (commit: Commit) => boolean; // Skip specific commits
  ignoreReverted?: boolean;             // Ignore commits that were later reverted (default: true)
  preMajor?: boolean;                   // If true, downgrade major→minor and minor→patch for <1.0.0
  strict?: boolean;                     // If true, return null when there are no meaningful changes
}): Promise<ReleaseRecommendation | null>
```

Behavior highlights:
- Breaking changes ("!" or notes) lead to `major` unless `preMajor` is enabled.
- New features (`feat`/`feature`) lead to `minor`.
- Otherwise, `patch` is recommended when there are other visible changes; with `strict: true` and no changes, returns `null`.
- With `ignoreReverted: true` the advisor cancels out commits that were reverted later, including revert-of-revert chains.

## Example: pre-1.0.0 workflow

```
const advisor = new ReleaseAdvisor()
const next = await advisor.advise({ preMajor: true })
console.log(next?.type) // 'minor' or 'patch' for <1.0.0 projects
```

## Example: strict mode

```
const next = await advisor.advise({ strict: true })
if (!next) {
  console.log('No release-worthy changes since last tag')
}
```
