# @modulify/conventional-changelog

Generate a changelog from your git history using conventional commits.
Groups entries by sections you define and skips commits that were reverted later.

- Repository: https://github.com/modulify/conventional
- Spec: https://www.conventionalcommits.org/en/v1.0.0/

## Installation

- npm: `npm i @modulify/conventional-changelog`
- yarn: `yarn add @modulify/conventional-changelog`
- pnpm: `pnpm add @modulify/conventional-changelog`

## Quick start

```
import { ChangelogWriter } from '@modulify/conventional-changelog'

const writer = new ChangelogWriter({
  types: [
    { type: 'feat', section: 'Features' },
    { type: 'fix', section: 'Bug Fixes' },
  ],
})

const content = await writer.write()
console.log(content)
```

You can also pass a Node.js Writable to stream the generated content:

```
import { createWriteStream } from 'node:fs'

const out = createWriteStream('CHANGELOG.md')
const writer = new ChangelogWriter({ output: out, types: [...] })
await writer.write()
```

## Public API

### ChangelogWriter

Constructor:

```
new ChangelogWriter(options?: ChangelogOptions)
```

Method:

```
write(): Promise<string>
```

Behavior highlights:
- Groups commits into sections according to `types`.
- Skips commits that were later reverted; revert-of-revert chains are handled so that original commits are restored.
- When `output` is provided, the same content is written to the stream and also returned as a string.
