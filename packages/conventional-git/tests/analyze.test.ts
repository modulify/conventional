import type { Traverser } from '~types/traverse'

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

import {
  Client,
  traverse,
} from '@/index'

const __temporary = join(__dirname, 'tmp')

describe('traverse', () => {
  let cwd: string

  const exec = (command: string) => execSync(command, {
    cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
  }).trim()

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
    } catch { /* empty */
    }
  })

  it('traverses parsed commits through the top-level API', async () => {
    exec('git commit -m "feat: Added feature" --allow-empty --no-gpg-sign')
    exec('git commit -m "fix: Fixed issue" --allow-empty --no-gpg-sign')

    const events: string[] = []
    const seen: string[] = []
    const types: Traverser<string[]> = {
      name: 'types',
      onStart: ({ range }) => {
        events.push(`start:${range.to}`)
      },
      onCommit: (commit, context) => {
        seen.push(commit.type ?? 'unknown')
        events.push(`commit:${context.commits.total}`)
      },
      onComplete: ({ commits }) => {
        events.push(`complete:${commits.total}`)

        return seen
      },
    }
    const empty: Traverser = {
      name: 'empty',
    }

    const result = await traverse({
      cwd,
      traversers: [types, empty],
    })

    expect(result.range).toEqual({
      from: null,
      to: 'HEAD',
    })
    expect(result.commits).toEqual({ total: 2 })
    expect(events).toEqual([
      'start:HEAD',
      'commit:1',
      'commit:2',
      'complete:2',
    ])
    expect(Array.from(result.results.entries())).toEqual([
      ['types', ['fix', 'feat']],
      ['empty', undefined],
    ])
  })

  it('uses the latest prefixed tag as the lower analysis boundary', async () => {
    exec('git commit -m "chore: Initial commit" --allow-empty --no-gpg-sign')
    exec('git tag root@1.0.0')
    exec('git commit -m "fix: Fixed issue" --allow-empty --no-gpg-sign')

    const client = new Client({ cwd })
    const result = await client.traverse({
      tagPrefix: 'root@',
      traversers: [{
        name: 'subjects',
        onComplete: () => [],
        onCommit: (commit, context) => {
          expect(context.range.tagPrefix).toBe('root@')
          expect(commit.subject).toBe('Fixed issue')
        },
      }],
    })

    expect(result.range).toEqual({
      from: 'root@1.0.0',
      to: 'HEAD',
      tagPrefix: 'root@',
    })
    expect(result.commits).toEqual({ total: 1 })
  })

  it('prefers explicit fromTag and respects explicit toRef', async () => {
    exec('git commit -m "chore: Initial commit" --allow-empty --no-gpg-sign')
    exec('git tag root@1.0.0')
    exec('git commit -m "fix: Fixed issue" --allow-empty --no-gpg-sign')
    const target = exec('git rev-parse HEAD')
    exec('git tag root@1.1.0')
    exec('git commit -m "feat: Added feature" --allow-empty --no-gpg-sign')

    const result = await traverse({
      cwd,
      fromTag: 'root@1.0.0',
      tagPrefix: 'root@',
      toRef: target,
      traversers: [{
        name: 'types',
        onComplete: () => [],
        onCommit: (commit) => {
          expect(commit.type).toBe('fix')
        },
      }],
    })

    expect(result.range).toEqual({
      from: 'root@1.0.0',
      to: target,
      tagPrefix: 'root@',
    })
    expect(result.commits).toEqual({ total: 1 })
  })

  it('falls back to full history when custom git does not expose tags', async () => {
    const result = await traverse({
      git: {
        commits: async function * () {
          yield {
            hash: 'abc123',
            type: 'fix',
            scope: null,
            subject: 'Fixed issue',
            merge: null,
            revert: null,
            header: 'fix: Fixed issue',
            body: null,
            footer: null,
            notes: [],
            mentions: [],
            references: [],
            fields: {},
            meta: {},
          }
        },
      },
      traversers: [{
        name: 'types',
        onComplete: () => [],
      }],
    })

    expect(result.range).toEqual({
      from: null,
      to: 'HEAD',
    })
    expect(result.commits).toEqual({ total: 1 })
  })
})
