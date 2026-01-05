import type { RenderContext } from '@/render'

import { afterEach } from 'vitest'
import { beforeEach } from 'vitest'
import { createRender } from '@/render'
import { createWrite } from '@/write'
import { describe } from 'vitest'
import { execSync } from 'node:child_process'
import { expect } from 'vitest'
import { it } from 'vitest'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'

import fs from 'fs'

const __temporary = join(__dirname, 'tmp')

describe('write', () => {
  let cwd: string

  const exec = (command: string) => execSync(command, {
    cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
  })

  const lastHash = () => exec('git rev-parse HEAD').trim()
  const shorten = (hash: string, length: number) => hash.substring(0, length)

  beforeEach(() => {
    cwd = join(__temporary, randomUUID())

    fs.mkdirSync(cwd, { recursive: true })
    fs.mkdirSync(resolve(cwd, 'git-templates'))

    exec('git init --template=./git-templates --initial-branch=main')
    exec('git config user.name "Tester"')
    exec('git config user.email "tester.modulify@gmail.com"')
  })

  afterEach(() => {
    try {
      if (cwd) {
        fs.rmSync(cwd, { recursive: true })
      }

      if (!fs.readdirSync(__temporary).length) {
        fs.rmdirSync(__temporary)
      }
    } catch { /* empty */ }
  })

  it('should write changelog', async () => {
    exec('git commit -m "feat: Added feature 1" --allow-empty --no-gpg-sign')

    const hash1 = lastHash()

    exec('git commit -m "feat: Added feature 2" --allow-empty --no-gpg-sign')

    const hash2 = lastHash()

    exec('git commit -m "fix: Fixed issue 3" --allow-empty --no-gpg-sign')

    const hash3 = lastHash()

    const write = createWrite({
      cwd,
      types: [
        { type: 'feat', section: 'Features' },
        { type: 'fix', section: 'Bug fixes' },
      ],
      context: {
        linkReferences: false,
      },
    })

    expect(await write()).toEqual(
      '## 0.0.0\n' +
      '\n' +
      '### Features\n' +
      '\n' +
      '* Added feature 1 ' + shorten(hash1, 7) + '\n' +
      '* Added feature 2 ' + shorten(hash2, 7) + '\n' +
      '\n' +
      '### Bug fixes\n' +
      '\n' +
      '* Fixed issue 3 ' + shorten(hash3, 7)
    )
  })

  it('ignores reverted commits when writing changelog', async () => {
    exec('git commit -m "feat: Added feature #A" --allow-empty --no-gpg-sign')
    exec('git commit -m "feat: Added feature #B" --allow-empty --no-gpg-sign')

    const hash = lastHash()

    exec(`git commit -m 'Revert "feat: Added feature #A"' -m 'This reverts commit ${lastHash()}.' --allow-empty --no-gpg-sign`)

    const write = createWrite({
      cwd,
      types: [{ type: 'feat', section: 'Features' }],
      context: {
        linkReferences: false,
      },
    })

    expect(await write()).toBe(
      '## 0.0.0\n' +
      '\n' +
      '### Features\n' +
      '\n' +
      '* Added feature #B ' + shorten(hash, 7)
    )
  })

  it('restores feature after revert of revert in changelog', async () => {
    exec('git commit -m "feat: Added feature #B" --allow-empty --no-gpg-sign')
    const featHash = lastHash()

    exec(`git commit -m 'Revert "feat: Added feature #B"' -m 'This reverts commit ${featHash}.' --allow-empty --no-gpg-sign`)
    const revertHash = lastHash()

    exec(`git commit -m 'Revert "Revert "feat: Added feature #B""' -m 'This reverts commit ${revertHash}.' --allow-empty --no-gpg-sign`)

    const write = createWrite({
      cwd,
      types: [{ type: 'feat', section: 'Features' }],
      context: {
        linkReferences: false,
      },
    })

    expect(await write()).toBe(
      '## 0.0.0\n' +
      '\n' +
      '### Features\n' +
      '\n' +
      '* Added feature #B ' + shorten(featHash, 7)
    )
  })

  it('handles multiple alternating reverts in changelog correctly', async () => {
    exec('git commit -m "feat: Added feature #C" --allow-empty --no-gpg-sign')
    const featHash = lastHash()

    exec(`git commit -m 'Revert "feat: Added feature #C"' -m 'This reverts commit ${featHash}.' --allow-empty --no-gpg-sign`)
    const revert1Hash = lastHash()

    exec(`git commit -m 'Revert "Revert "feat: Added feature #C""' -m 'This reverts commit ${revert1Hash}.' --allow-empty --no-gpg-sign`)
    const revert2Hash = lastHash()

    exec(`git commit --allow-empty --no-gpg-sign -m 'Revert "Revert "Revert "feat: Added feature #C"""' -m 'This reverts commit ${revert2Hash}.'`)

    const write = createWrite({
      cwd,
      types: [{ type: 'feat', section: 'Features' }],
    })

    expect(await write()).toBe(
      '## 0.0.0\n' +
      '\n'
    )
  })

  it('writes to file and appends to existing content', async () => {
    const changelog = join(cwd, 'CHANGELOG.md')

    fs.writeFileSync(changelog, 'Old Content\n')

    exec('git commit -m "feat: New feature" --allow-empty --no-gpg-sign')

    const write = createWrite({
      cwd,
      types: [{ type: 'feat', section: 'Features' }],
      file: changelog,
    })

    const result = await write()

    expect(result).toContain('### Features')
    expect(result).toContain('* New feature')

    expect(fs.readFileSync(changelog, 'utf8')).toBe(
      '# Changelog\n' +
      '\n' +
      result + '\n' +
      '\n' +
      'Old Content\n' +
      '\n'
    )
  })

  it('handles static header correctly', async () => {
    const changelog = join(cwd, 'CHANGELOG.md')

    fs.writeFileSync(changelog, '# My Custom Changelog\n\nExisting entry\n')

    exec('git commit -m "feat: Newer feature" --allow-empty --no-gpg-sign')

    const write = createWrite({
      cwd,
      types: [{ type: 'feat', section: 'Features' }],
      header: '# My Custom Changelog',
      file: changelog,
    })

    const result = await write()
    const fileContent = fs.readFileSync(changelog, 'utf8')

    expect(fileContent).toBe(
      '# My Custom Changelog\n\n' +
      result + '\n\n' +
      'Existing entry\n\n'
    )
  })

  it('adds default header if not present', async () => {
    const changelog = join(cwd, 'CHANGELOG.md')

    fs.writeFileSync(changelog, 'Old Content Without Header\n')

    exec('git commit -m "feat: Feature without header" --allow-empty --no-gpg-sign')

    const write = createWrite({
      cwd,
      types: [{ type: 'feat', section: 'Features' }],
      file: changelog,
    })

    const result = await write()

    expect(fs.readFileSync(changelog, 'utf8')).toBe(
      '# Changelog\n\n' +
      result + '\n\n' +
      'Old Content Without Header\n\n'
    )
  })

  it('supports custom render function', async () => {
    exec('git commit -m "feat: Custom feature" --allow-empty --no-gpg-sign')

    const write = createWrite({
      cwd,
      types: [{ type: 'feat', section: 'Features' }],
      render: (ctx) => `CUSTOM: ${ctx.sections?.[0].commits[0].subject}`,
    })

    expect(await write()).toBe('CUSTOM: Custom feature')
  })

  it('supports partial override via createRender', async () => {
    exec('git commit -m "feat: Scoped feature" --allow-empty --no-gpg-sign')

    const render = createRender()

    const write = createWrite({
      cwd,
      types: [{ type: 'feat', section: 'Features' }],
      render: ({ sections = [] }: RenderContext) => sections.map((g) => {
        return `## ${g.title}\n` + g.commits.map((c) => render.commit(c)).join('\n')
      }).join('\n'),
    })

    const result = await write()

    expect(result).toContain('## Features')
    expect(result).toContain('* Scoped feature')
  })
})
