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
import { vi } from 'vitest'

import fs from 'fs'

const __temporary = join(__dirname, 'tmp')

describe('write', () => {
  let cwd: string
  type ChangelogOptions = NonNullable<Parameters<typeof createWrite>[0]>

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

  it('creates writer with default options', () => {
    expect(typeof createWrite()).toBe('function')
  })

  it('ignores reverted commits when writing changelog', async () => {
    exec('git commit -m "feat: Added feature #A" --allow-empty --no-gpg-sign')
    const hashA = lastHash()
    exec('git commit -m "feat: Added feature #B" --allow-empty --no-gpg-sign')

    const hashB = lastHash()

    exec(`git commit -m 'Revert "feat: Added feature #A"' -m 'This reverts commit ${hashA}.' --allow-empty --no-gpg-sign`)

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
      '* Added feature #B ' + shorten(hashB, 7)
    )
  })

  it('falls back to header matching when revert hash is unavailable', async () => {
    exec('git commit -m "feat: Added feature #A" --allow-empty --no-gpg-sign')
    exec('git commit -m "feat: Added feature #B" --allow-empty --no-gpg-sign')

    const hashB = lastHash()

    exec('git commit -m \'Revert "feat: Added feature #A"\' -m \'This reverts commit .\' --allow-empty --no-gpg-sign')

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
      '* Added feature #B ' + shorten(hashB, 7)
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

    expect(fs.readFileSync(changelog, 'utf8')).toBe(
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

  it('supports middleware-style render wrapper around createRender', async () => {
    exec('git commit -m "feat: Middleware feature" --allow-empty --no-gpg-sign')

    const base = createRender()

    const write = createWrite({
      cwd,
      types: [{ type: 'feat', section: 'Features' }],
      render: ({ version = '0.0.0', sections = [], highlights = [] }: RenderContext) => {
        const header = `<!-- middleware -->\n## ${version}`
        const body = sections.map((group) => base.section(group)).join('\n\n')
        const notes = highlights.length ? '\n\n' + base({
          version,
          sections: [],
          highlights,
        }) : ''

        return `${header}\n\n${body}${notes}`.trim()
      },
    })

    const result = await write('2.0.0')

    expect(result).toContain('<!-- middleware -->')
    expect(result).toContain('## 2.0.0')
    expect(result).toContain('### Features')
    expect(result).toContain('* Middleware feature')
  })

  it('supports output to Writable stream', async () => {
    exec('git commit -m "feat: Stream feature" --allow-empty --no-gpg-sign')

    let data = ''
    const stream = new (await import('node:stream')).Writable({
      write(chunk, encoding, callback) {
        data += chunk.toString()
        callback()
      },
    })

    const write = createWrite({
      cwd,
      types: [{ type: 'feat', section: 'Features' }],
      output: stream,
    })

    await write('1.0.0')
    expect(data).toContain('## 1.0.0')
    expect(data).toContain('* Stream feature')
  })

  it('handles empty commit types and missing sections', async () => {
    exec('git commit -m "feat: No section feature" --allow-empty --no-gpg-sign')

    const write = createWrite({
      cwd,
      types: [],
    })

    const result = await write()
    expect(result).toBe('## 0.0.0\n\n')
  })

  it('handles breaking changes and notes in changelog', async () => {
    exec('git commit -m "feat: Breaking feature\n\nBREAKING CHANGE: this is breaking" --allow-empty --no-gpg-sign')
    const hash = lastHash()

    const write = createWrite({
      cwd,
      types: [{ type: 'feat', section: 'Features' }],
    })

    const result = await write('1.0.0')
    expect(result).toContain('### ⚠ BREAKING CHANGE')
    expect(result).toContain('this is breaking')
    expect(result).toContain('([')
    expect(result).toContain(shorten(hash, 7))
  })

  it('handles non-existent file correctly', async () => {
    const changelog = join(cwd, 'NEW_CHANGELOG.md')
    exec('git commit -m "feat: New file feature" --allow-empty --no-gpg-sign')

    const write = createWrite({
      cwd,
      types: [{ type: 'feat', section: 'Features' }],
      file: changelog,
    })

    const result = await write()
    expect(fs.existsSync(changelog)).toBe(true)
    expect(fs.readFileSync(changelog, 'utf8')).toContain(result)
  })

  it('handles empty file correctly', async () => {
    const changelog = join(cwd, 'EMPTY_CHANGELOG.md')
    fs.writeFileSync(changelog, '')
    exec('git commit -m "feat: Empty file feature" --allow-empty --no-gpg-sign')

    const write = createWrite({
      cwd,
      types: [{ type: 'feat', section: 'Features' }],
      file: changelog,
    })

    const result = await write()
    expect(fs.readFileSync(changelog, 'utf8')).toBe('# Changelog\n\n' + result + '\n\n')
  })

  it('handles file with only spaces correctly', async () => {
    const changelog = join(cwd, 'SPACES_CHANGELOG.md')
    fs.writeFileSync(changelog, '   \n\n   ')
    exec('git commit -m "feat: Spaces file feature" --allow-empty --no-gpg-sign')

    const write = createWrite({
      cwd,
      types: [{ type: 'feat', section: 'Features' }],
      file: changelog,
    })

    const result = await write()
    expect(fs.readFileSync(changelog, 'utf8')).toBe('# Changelog\n\n' + result + '\n\n')
  })

  it('handles file without header correctly', async () => {
    const changelog = join(cwd, 'NO_HEADER_CHANGELOG.md')
    fs.writeFileSync(changelog, 'Some Content\n')
    exec('git commit -m "feat: No header feature" --allow-empty --no-gpg-sign')

    const write = createWrite({
      cwd,
      types: [{ type: 'feat', section: 'Features' }],
      file: changelog,
    })

    const result = await write()
    expect(fs.readFileSync(changelog, 'utf8')).toBe(
      '# Changelog\n\n' +
      result + '\n\n' +
      'Some Content\n\n'
    )
  })

  it('throws error on stream write failure', async () => {
    exec('git commit -m "feat: Commit for error test" --allow-empty --no-gpg-sign')

    const stream = new (await import('node:stream')).Writable({
      write(chunk, encoding, callback) {
        callback(new Error('Write failed'))
      },
    })
    stream.on('error', () => { /* ignore to avoid unhandled error in vitest */ })

    const write = createWrite({
      cwd,
      output: stream,
    })

    await expect(write()).rejects.toThrow('Write failed')
  })

  it('handles write error to a directory', async () => {
    const dir = join(cwd, 'some_dir')
    fs.mkdirSync(dir)
    exec('git commit -m "feat: Dir error test" --allow-empty --no-gpg-sign')

    const write = createWrite({
      cwd,
      file: dir,
    })

    await expect(write()).rejects.toThrow('EISDIR')
  })

  it('handles multiple breaking changes correctly', async () => {
    exec('git commit -m "feat: feat 1\n\nBREAKING CHANGE: breaking 1" --allow-empty --no-gpg-sign')
    exec('git commit -m "feat: feat 2\n\nBREAKING CHANGE: breaking 2" --allow-empty --no-gpg-sign')

    const write = createWrite({
      cwd,
      types: [{ type: 'feat', section: 'Features' }],
    })

    const result = await write()
    expect(result).toContain('### ⚠ BREAKING CHANGE')
    expect(result).toContain('breaking 1')
    expect(result).toContain('breaking 2')
  })

  it('resolves GitHub remote context for render', async () => {
    const render = vi.fn(() => 'Rendered changelog')

    const write = createWrite({
      git: {
        url: async () => 'https://github.com/modulify/conventional.git',
        commits: async function * () {},
      } as unknown as ChangelogOptions['git'],
      render,
    })

    await write('1.2.3')

    expect(render).toHaveBeenCalledWith(expect.objectContaining({
      version: '1.2.3',
      host: 'https://github.com',
      owner: 'modulify',
      repository: 'conventional',
    }))
  })

  it('resolves non-GitHub remote host for render', async () => {
    const render = vi.fn(() => 'Rendered changelog')

    const write = createWrite({
      git: {
        url: async () => 'git@gitlab.com:modulify/conventional.git',
        commits: async function * () {},
      } as unknown as ChangelogOptions['git'],
      render,
    })

    await write('1.2.3')

    expect(render).toHaveBeenCalledWith(expect.objectContaining({
      host: 'gitlab.com',
      owner: 'modulify',
      repository: 'conventional',
    }))
  })

  it('removes temporary file on write failure', async () => {
    const dir = join(cwd, 'failing-output')
    const tmp = dir + '.tmp'

    fs.mkdirSync(dir)
    fs.writeFileSync(tmp, 'stale temp file')
    exec('git commit -m "feat: Temp cleanup test" --allow-empty --no-gpg-sign')

    const write = createWrite({
      cwd,
      file: dir,
    })

    await expect(write()).rejects.toThrow('EISDIR')
    expect(fs.existsSync(tmp)).toBe(false)
  })
})
