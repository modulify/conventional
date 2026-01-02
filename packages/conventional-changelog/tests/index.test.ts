import { ChangelogWriter } from '@/index'

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'

import { execSync } from 'node:child_process'

import {
  join,
  resolve,
} from 'node:path'

import { randomUUID } from 'node:crypto'

import fs from 'fs'

const __temporary = join(__dirname, 'tmp')

describe('ChangelogWriter', () => {
  let cwd: string

  const exec = (command: string) => execSync(command, {
    cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
  })

  const lastHash = () => exec('git rev-parse HEAD').trim()

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
    exec('git commit -m "feat: Added feature #1" --allow-empty --no-gpg-sign')
    exec('git commit -m "feat: Added feature #2" --allow-empty --no-gpg-sign')
    exec('git commit -m "fix: Fixed issue #3" --allow-empty --no-gpg-sign')

    const writer = new ChangelogWriter({
      cwd,
      types: [
        { type: 'feat', section: 'Features' },
        { type: 'fix', section: 'Bug fixes' },
      ],
    })

    expect(await writer.write()).toEqual(
      '### Features\n' +
      '\n' +
      '* Added feature #1\n' +
      '* Added feature #2\n' +
      '\n' +
      '### Bug fixes\n' +
      '\n' +
      '* Fixed issue #3\n' +
      '\n'
    )
  })

  it('ignores reverted commits when writing changelog', async () => {
    exec('git commit -m "feat: Added feature #A" --allow-empty --no-gpg-sign')
    exec('git commit -m "feat: Added feature #B" --allow-empty --no-gpg-sign')
    exec(`git commit -m 'Revert "feat: Added feature #A"' -m 'This reverts commit ${lastHash()}.' --allow-empty --no-gpg-sign`)

    const writer = new ChangelogWriter({
      cwd,
      types: [{ type: 'feat', section: 'Features' }],
    })

    expect(await writer.write()).toBe(
      '### Features\n' +
      '\n' +
      '* Added feature #B\n' +
      '\n'
    )
  })

  it('restores feature after revert of revert in changelog', async () => {
    exec('git commit -m "feat: Added feature #B" --allow-empty --no-gpg-sign')
    const featHash = lastHash()

    exec(`git commit -m 'Revert "feat: Added feature #B"' -m 'This reverts commit ${featHash}.' --allow-empty --no-gpg-sign`)
    const revertHash = lastHash()

    exec(`git commit -m 'Revert "Revert "feat: Added feature #B""' -m 'This reverts commit ${revertHash}.' --allow-empty --no-gpg-sign`)

    const types = [{ type: 'feat', section: 'Features' }]
    const writer = new ChangelogWriter({ cwd, types })
    const content = await writer.write()

    expect(content).toBe('### Features\n\n* Added feature #B\n\n')
  })

  it('handles multiple alternating reverts in changelog correctly', async () => {
    exec('git commit -m "feat: Added feature #C" --allow-empty --no-gpg-sign')
    const featHash = lastHash()

    exec(`git commit -m 'Revert "feat: Added feature #C"' -m 'This reverts commit ${featHash}.' --allow-empty --no-gpg-sign`)
    const revert1Hash = lastHash()

    exec(`git commit -m 'Revert "Revert "feat: Added feature #C""' -m 'This reverts commit ${revert1Hash}.' --allow-empty --no-gpg-sign`)
    const revert2Hash = lastHash()

    exec(`git commit --allow-empty --no-gpg-sign -m 'Revert "Revert "Revert "feat: Added feature #C"""' -m 'This reverts commit ${revert2Hash}.'`)

    const types = [{ type: 'feat', section: 'Features' }]
    const writer = new ChangelogWriter({ cwd, types })
    const content = await writer.write()

    expect(content).toBe('### Features\n\n\n')
  })
})
