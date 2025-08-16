import { ChangelogWriter } from '@/index'
import { Writable } from 'node:stream'

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

    const types = [{ type: 'feat', section: 'Features' }, { type: 'fix', section: 'Bug fixes' }]
    const lines = [] as string[]
    const output = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(String(chunk))
        callback()
      },
    })

    const writer = new ChangelogWriter({ cwd, output, types })
    await writer.write()

    expect(lines).toEqual([
      '### Features\n\n' +
      '* Added feature #1\n' +
      '* Added feature #2\n' +
      '\n' +
      '### Bug fixes\n\n' +
      '* Fixed issue #3\n' +
      '\n',
    ])
  })
})
