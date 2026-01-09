import type { AsyncStream } from '@modulify/git-toolkit/dist/stream'

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { execSync } from 'node:child_process'

import {
  join,
  resolve,
} from 'node:path'

import { randomUUID } from 'node:crypto'

import fs from 'fs'
import semver from 'semver'

import { GitClient } from '@modulify/git-toolkit'

import { Client, packagePrefix } from '@/index'

const __temporary = join(__dirname, 'tmp')

const streamToArray = async <T>(stream: AsyncStream<T>): Promise<T[]> => {
  const result: T[] = []

  for await (const item of stream) {
    result.push(item)
  }

  return result
}

describe('packagePrefix', () => {
  it('should return default prefix when package name is not provided', () => {
    expect(packagePrefix()).toEqual(/^.+@/)
  })

  it('should return specific prefix when package name is provided', () => {
    expect(packagePrefix('my-pkg')).toBe('my-pkg@')
  })
})

describe('Client', () => {
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
    vi.restoreAllMocks()

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

  describe('constructor', () => {
    it('should create new GitClient if not provided', () => {
      const client = new Client()
      expect(client.git).toBeDefined()
    })

    it('should use provided GitClient instance', () => {
      const git = new GitClient()
      const client = new Client({ git })

      expect(client.git).toBe(git)
    })
  })

  describe('commits', () => {
    it('should return a stream of parsed commits', async () => {
      exec('git commit -m "feat: Added feature #1" --allow-empty --no-gpg-sign')
      exec('git commit -m "fix: Fixed issue #2" --allow-empty --no-gpg-sign')

      const client = new Client({ cwd })
      const commits = await streamToArray(client.commits())

      expect(commits).toHaveLength(2)
      expect(commits[0].subject).toBe('Fixed issue #2')
      expect(commits[0].type).toBe('fix')
      expect(commits[1].subject).toBe('Added feature #1')
      expect(commits[1].type).toBe('feat')
    })
  })

  describe('tags', () => {
    it('should return all tags by default', async () => {
      exec('git commit -m "initial" --allow-empty --no-gpg-sign')
      exec('git tag v1.0.0')
      exec('git tag v1.1.0')

      const client = new Client({ cwd })
      const tags = await streamToArray(client.tags())

      expect(tags).toContain('v1.0.0')
      expect(tags).toContain('v1.1.0')
    })

    it('should filter tags by string prefix', async () => {
      exec('git commit -m "initial" --allow-empty --no-gpg-sign')
      exec('git tag pkg-a@1.0.0')
      exec('git tag pkg-b@1.0.0')

      const client = new Client({ cwd })

      expect(await streamToArray(client.tags({ prefix: 'pkg-a@' }))).toEqual([
        'pkg-a@1.0.0',
      ])
    })

    it('should filter tags by RegExp prefix', async () => {
      exec('git commit -m "initial" --allow-empty --no-gpg-sign')
      exec('git tag pkg-a@1.0.0')
      exec('git tag pkg-b@1.0.0')

      const client = new Client({ cwd })

      expect(await streamToArray(client.tags({ prefix: /^pkg-b@/ }))).toEqual([
        'pkg-b@1.0.0',
      ])
    })

    it('should skip unstable versions when skipUnstable is true', async () => {
      exec('git commit -m "initial" --allow-empty --no-gpg-sign')
      exec('git tag 1.0.0')
      exec('git tag 1.1.0-beta.1')

      const client = new Client({ cwd })
      const tags = await streamToArray(client.tags({ skipUnstable: true }))

      expect(tags).toContain('1.0.0')
      expect(tags).not.toContain('1.1.0-beta.1')
    })

    it('should clean tags when clean is true', async () => {
      exec('git commit -m "initial" --allow-empty --no-gpg-sign')
      exec('git tag v1.0.0')
      exec('git tag pkg@1.1.0')

      const client = new Client({ cwd })

      expect(await streamToArray(client.tags({ clean: true }))).toContain('1.0.0')
      expect(await streamToArray(client.tags({ clean: true, prefix: 'pkg@' }))).toContain('1.1.0')
    })

    it('should ignore non-semver tags', async () => {
      exec('git commit -m "initial" --allow-empty --no-gpg-sign')
      exec('git tag not-a-version')
      exec('git tag 1.0.0')

      const client = new Client({ cwd })

      expect(await streamToArray(client.tags())).toEqual(['1.0.0'])
    })

    it('should ignore tags with prefix but invalid version part', async () => {
      exec('git commit -m "initial" --allow-empty --no-gpg-sign')
      exec('git tag pkg@invalid')
      exec('git tag pkg@1.0.0')

      const client = new Client({ cwd })

      expect(await streamToArray(client.tags({ prefix: 'pkg@' }))).toEqual([
        'pkg@1.0.0',
      ])
    })

    it('should clean tags even if prefix does not match but it is a valid semver', async () => {
      exec('git commit -m "initial" --allow-empty --no-gpg-sign')
      exec('git tag v1.0.0')

      const client = new Client({ cwd })

      expect(await streamToArray(client.tags({ clean: true, prefix: 'pkg@' }))).toContain('1.0.0')
    })

    it('should return null if semver.valid returns null for some reason', async () => {
      exec('git commit -m "initial" --allow-empty --no-gpg-sign')
      exec('git tag pkg@1.0.0')

      const client = new Client({ cwd })

      expect(await streamToArray(client.tags({ clean: true, prefix: 'pkg@1.0.0' }))).toEqual([])
    })

    it('should handle cleanTag returning null', async () => {
      exec('git commit -m "initial" --allow-empty --no-gpg-sign')
      exec('git tag not-cleanable')
      exec('git tag 1.2.3.4')
      exec('git tag 1.0.0')

      const client = new Client({ cwd })

      expect(await streamToArray(client.tags({ clean: true }))).toContain('1.0.0')
    })

    it('should cover branch when semver.clean returns null despite valid semver', async () => {
      exec('git commit -m "initial" --allow-empty --no-gpg-sign')
      exec('git tag v1.0.0')
      exec('git tag pkg@1.1.0')

      const client = new Client({ cwd })

      vi.spyOn(semver, 'clean').mockReturnValue(null)

      expect(await streamToArray(client.tags({ clean: true }))).toEqual([])
      expect(await streamToArray(client.tags({ clean: true, prefix: 'pkg@' }))).toEqual([])
    })
  })

  describe('version', () => {
    it('should return the latest semver version', async () => {
      exec('git commit -m "initial" --allow-empty --no-gpg-sign')
      exec('git tag 1.0.0')
      exec('git tag 1.2.0')
      exec('git tag 1.1.0')

      const client = new Client({ cwd })

      expect(await client.version()).toBe('1.2.0')
    })

    it('should return null if no tags found', async () => {
      exec('git commit -m "initial" --allow-empty --no-gpg-sign')

      const client = new Client({ cwd })

      expect(await client.version()).toBeNull()
    })

    it('should return the latest version with prefix', async () => {
      exec('git commit -m "initial" --allow-empty --no-gpg-sign')
      exec('git tag pkg@1.0.0')
      exec('git tag pkg@1.1.0')
      exec('git tag other@2.0.0')

      const client = new Client({ cwd })

      expect(await client.version({ prefix: 'pkg@' })).toBe('1.1.0')
    })
  })

  describe('url', () => {
    it('should return remote url', async () => {
      exec('git remote add origin https://github.com/fork/conventional.git')
      exec('git remote add upstream https://github.com/modulify/conventional.git')

      const client = new Client({ cwd })

      expect(await client.url()).toBe('https://github.com/fork/conventional.git')
      expect(await client.url('upstream')).toBe('https://github.com/modulify/conventional.git')
    })

    it('should return empty string if remote does not exist', async () => {
      const client = new Client({ cwd })

      expect(await client.url('non-existent')).toBe('')
    })

    it('should throw other errors', async () => {
      const client = new Client({ cwd })

      // @ts-expect-error accessing private for test
      vi.spyOn(client._git.cmd, 'exec').mockRejectedValue(new Error('Unexpected error'))

      await expect(client.url()).rejects.toThrow('Unexpected error')
    })
  })
})
