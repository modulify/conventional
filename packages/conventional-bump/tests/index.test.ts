import type { Commit } from '@modulify/conventional-git/types/commit'
import type { Client } from '@modulify/conventional-git'

import {
  ReleaseAdvisor,
  createRecommendationAnalyzer,
  resolveNextVersion,
} from '@/index'

import { applyGitFixture } from '~tests/helpers/git-fixture'

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

describe('ReleaseAdvisor', () => {
  let cwd: string

  const commit = (overrides: Partial<Commit> = {}): Commit => ({
    hash: null,
    type: null,
    scope: null,
    subject: null,
    merge: null,
    revert: null,
    header: null,
    body: null,
    footer: null,
    notes: [],
    mentions: [],
    references: [],
    fields: {},
    meta: {},
    ...overrides,
  })

  const createGit = (
    history: Commit[],
    options: {
      onTraverse?: (options: Record<string, unknown>) => void;
    } = {}
  ): Pick<Client, 'traverse'> => ({
    traverse: (async ({ traversers, ...traverseOptions }: {
      traversers: Array<{
        name: string;
        onStart?: (context: { range: { from: string | null; to: string; tagPrefix?: string | RegExp; }; commits: { total: number; }; }) => Promise<void> | void;
        onCommit?: (commit: Commit, context: { range: { from: string | null; to: string; tagPrefix?: string | RegExp; }; commits: { total: number; }; }) => Promise<void> | void;
        onComplete?: (context: { range: { from: string | null; to: string; tagPrefix?: string | RegExp; }; commits: { total: number; }; }) => Promise<unknown> | unknown;
      }>;
      fromTag?: string;
      tagPrefix?: string | RegExp;
      parse?: unknown;
    }) => {
      options.onTraverse?.(traverseOptions)

      const context = {
        range: {
          from: (traverseOptions.fromTag as string | undefined) ?? null,
          to: 'HEAD',
          ...traverseOptions.tagPrefix && { tagPrefix: traverseOptions.tagPrefix as string | RegExp },
        },
        commits: {
          total: 0,
        },
      }
      const results = new Map<string, unknown>()

      for (const traverser of traversers) {
        await traverser.onStart?.(context)
      }

      for (const entry of history) {
        context.commits.total += 1

        for (const traverser of traversers) {
          await traverser.onCommit?.(entry, context)
        }
      }

      for (const traverser of traversers) {
        results.set(traverser.name, await traverser.onComplete?.(context))
      }

      return {
        range: {
          ...context.range,
        },
        commits: {
          ...context.commits,
        },
        results,
      }
    }) as Client['traverse'],
  })

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
    } catch { /* empty */
    }
  })

  it('creates release recommendation', async () => {
    const advisor = new ReleaseAdvisor({ cwd })

    exec('git commit -m "feat: Added feature #1" --allow-empty --no-gpg-sign')
    exec('git commit -m "feat: Added feature #2" --allow-empty --no-gpg-sign')
    exec('git tag v1.0.0')

    exec('git commit -m "feat: Added feature #3" --allow-empty --no-gpg-sign')
    exec('git commit -m "feat: Added feature #4" --allow-empty --no-gpg-sign')
    exec('git commit -m "fix: Fixed issue #5" --allow-empty --no-gpg-sign')

    expect(await advisor.advise()).toEqual(
      expect.objectContaining({ type: 'minor' })
    )
  })

  it('creates release recommendation for breaking changes', async () => {
    const advisor = new ReleaseAdvisor({ cwd })

    exec('git commit -m "feat: Added feature #1" --allow-empty --no-gpg-sign')
    exec('git commit -m "feat: Added feature #2" --allow-empty --no-gpg-sign')
    exec('git tag v1.0.0')

    exec('git commit -m "feat!: Added feature #3" --allow-empty --no-gpg-sign')

    expect(await advisor.advise()).toEqual(
      expect.objectContaining({ type: 'major' })
    )
  })

  it('uses singular wording for a single breaking change', async () => {
    const advisor = new ReleaseAdvisor({ cwd })

    exec('git commit -m "feat!: Added breaking feature" --allow-empty --no-gpg-sign')

    expect(await advisor.advise()).toEqual(
      expect.objectContaining({ reason: 'There is 1 BREAKING CHANGE and 0 features' })
    )
  })

  it('ignores reverted commits when creating recommendation', async () => {
    const advisor = new ReleaseAdvisor({ cwd })

    exec('git commit -m "feat: Base feature" --allow-empty --no-gpg-sign')
    exec('git tag v1.0.0')

    exec('git commit -m "feat: Added feature #A" --allow-empty --no-gpg-sign')
    exec(`git commit -m 'Revert "feat: Added feature #A"' -m 'This reverts commit ${lastHash()}.' --allow-empty --no-gpg-sign`)

    expect(await advisor.advise()).toEqual(
      expect.objectContaining({ type: 'patch' })
    )
  })

  it('restores feature after revert of revert', async () => {
    const advisor = new ReleaseAdvisor({ cwd })

    exec('git commit -m "feat: Initial" --allow-empty --no-gpg-sign')
    exec('git tag v1.0.0')

    exec('git commit -m "feat: Added feature #B" --allow-empty --no-gpg-sign')
    const featHash = lastHash()

    exec(`git commit -m 'Revert "feat: Added feature #B"' -m 'This reverts commit ${featHash}.' --allow-empty --no-gpg-sign`)
    const revertHash = lastHash()

    exec(`git commit -m 'Revert "Revert "feat: Added feature #B""' -m 'This reverts commit ${revertHash}.' --allow-empty --no-gpg-sign`)

    expect(await advisor.advise()).toEqual(
      expect.objectContaining({ type: 'minor' })
    )
  })

  it('handles multiple alternating reverts correctly', async () => {
    const advisor = new ReleaseAdvisor({ cwd })

    exec('git commit -m "feat: Seed" --allow-empty --no-gpg-sign')
    exec('git tag v1.0.0')

    exec('git commit -m "feat: Added feature #C" --allow-empty --no-gpg-sign')
    const featHash = lastHash()

    exec(`git commit -m 'Revert "feat: Added feature #C"' -m 'This reverts commit ${featHash}.' --allow-empty --no-gpg-sign`)
    const revert1Hash = lastHash()

    exec(`git commit -m 'Revert "Revert "feat: Added feature #C""' -m 'This reverts commit ${revert1Hash}.' --allow-empty --no-gpg-sign`)
    const revert2Hash = lastHash()

    exec(`git commit --allow-empty --no-gpg-sign -m 'Revert "Revert "Revert "feat: Added feature #C"""' -m 'This reverts commit ${revert2Hash}.'`)

    expect(await advisor.advise()).toEqual(
      expect.objectContaining({ type: 'patch' })
    )
  })

  it('supports strict mode', async () => {
    const advisor = new ReleaseAdvisor({ cwd })

    exec('git commit -m "chore: some chore" --allow-empty --no-gpg-sign')

    expect(await advisor.advise({ strict: true })).toBeNull()

    exec('git commit -m "fix: some fix" --allow-empty --no-gpg-sign')

    expect(await advisor.advise({ strict: true })).toEqual(
      expect.objectContaining({ type: 'patch' })
    )
  })

  it('supports preMajor mode', async () => {
    const advisor = new ReleaseAdvisor({ cwd })

    exec('git commit -m "feat: some feature" --allow-empty --no-gpg-sign')

    expect(await advisor.advise({ preMajor: true })).toEqual(
      expect.objectContaining({ type: 'patch' })
    )

    exec('git commit -m "feat!: breaking feature" --allow-empty --no-gpg-sign')

    expect(await advisor.advise({ preMajor: true })).toEqual(
      expect.objectContaining({ type: 'minor' })
    )
  })

  it('supports custom hidden types in strict mode', async () => {
    const advisor = new ReleaseAdvisor({
      cwd,
      types: [
        { type: 'feat', section: 'Features' },
        { type: 'custom', section: 'Custom', hidden: true },
      ],
    })

    exec('git commit -m "custom: hidden change" --allow-empty --no-gpg-sign')

    expect(await advisor.advise({ strict: true })).toBeNull()

    exec('git commit -m "feat: visible change" --allow-empty --no-gpg-sign')

    expect(await advisor.advise({ strict: true })).toEqual(
      expect.objectContaining({ type: 'minor' })
    )
  })

  describe('multi-tag advisory range', () => {
    it('prioritizes fromTag over discovered tags', async () => {
      const calls = {
        traverse: [] as Array<Record<string, unknown>>,
      }

      const git = createGit([commit({
        type: 'feat',
        header: 'feat: Added feature',
        subject: 'Added feature',
      })], {
        onTraverse: (options) => calls.traverse.push(options),
      })

      const advisor = new ReleaseAdvisor({
        git,
      })

      expect(await advisor.advise({
        fromTag: 'pkg-b@1.4.0',
      })).toEqual(expect.objectContaining({
        type: 'minor',
      }))

      expect(calls.traverse).toHaveLength(1)
      expect(calls.traverse[0]).toEqual(expect.objectContaining({
        fromTag: 'pkg-b@1.4.0',
      }))
    })

    it('uses tagPrefix to isolate a workspace tag line', async () => {
      const calls = {
        traverse: [] as Array<Record<string, unknown>>,
      }

      const git = createGit([commit({
        type: 'feat',
        header: 'feat: Added feature',
        subject: 'Added feature',
      })], {
        onTraverse: (options) => calls.traverse.push(options),
      })

      const advisor = new ReleaseAdvisor({
        git,
      })

      expect(await advisor.advise({
        tagPrefix: 'pkg-b@',
      })).toEqual(expect.objectContaining({
        type: 'minor',
      }))

      expect(calls.traverse).toHaveLength(1)
      expect(calls.traverse[0]).toEqual(expect.objectContaining({
        tagPrefix: 'pkg-b@',
      }))
    })

    it('supports regexp tagPrefix for grouped tag lines', async () => {
      const prefix = /^(?:core|shared)@/

      const calls = {
        traverse: [] as Array<Record<string, unknown>>,
      }

      const git = createGit([commit({
        type: 'fix',
        header: 'fix: Fixed issue',
        subject: 'Fixed issue',
      })], {
        onTraverse: (options) => calls.traverse.push(options),
      })

      const advisor = new ReleaseAdvisor({
        git,
      })

      expect(await advisor.advise({
        tagPrefix: prefix,
      })).toEqual(expect.objectContaining({
        type: 'patch',
      }))

      expect(calls.traverse[0]).toEqual(expect.objectContaining({
        tagPrefix: prefix,
      }))
    })

    it('falls back to full history when tagPrefix has no matches', async () => {
      const calls = {
        traverse: [] as Array<Record<string, unknown>>,
      }

      const git = createGit([commit({
        type: 'feat',
        header: 'feat: Added feature',
        subject: 'Added feature',
      })], {
        onTraverse: (options) => calls.traverse.push(options),
      })

      const advisor = new ReleaseAdvisor({
        git,
      })

      await advisor.advise({
        tagPrefix: 'pkg-b@',
      })

      expect(calls.traverse[0]).toEqual(expect.objectContaining({
        tagPrefix: 'pkg-b@',
      }))
      expect(calls.traverse[0].fromTag).toBeUndefined()
    })

    it('forwards fromTag into next() recommendation flow', async () => {
      const calls = {
        traverse: [] as Array<Record<string, unknown>>,
      }

      const git = createGit([commit({
        type: 'feat',
        header: 'feat: Added feature',
        subject: 'Added feature',
      })], {
        onTraverse: (options) => calls.traverse.push(options),
      })

      const advisor = new ReleaseAdvisor({
        git,
      })

      expect(await advisor.next('1.0.0', {
        fromTag: 'pkg-b@1.4.0',
      })).toEqual(expect.objectContaining({
        type: 'minor',
        version: '1.1.0',
      }))

      expect(calls.traverse).toHaveLength(1)
      expect(calls.traverse[0]).toEqual(expect.objectContaining({
        fromTag: 'pkg-b@1.4.0',
      }))
    })

    it('handles non-synchronized workspace versions with fixture history', async () => {
      const advisor = new ReleaseAdvisor({ cwd })

      applyGitFixture({
        cwd,
        fixture: 'non-synchronized-workspace-versions',
      })

      const onlyWorkspace = (workspace: string) => (c: Commit) => c.scope !== workspace

      expect(await advisor.advise({
        tagPrefix: 'conventional-git@',
        ignore: onlyWorkspace('conventional-git'),
      })).toEqual(expect.objectContaining({
        type: 'minor',
      }))

      expect(await advisor.next('3.2.0', {
        tagPrefix: 'conventional-git@',
        ignore: onlyWorkspace('conventional-git'),
      })).toEqual(expect.objectContaining({
        type: 'minor',
        version: '3.3.0',
      }))

      expect(await advisor.advise({
        tagPrefix: 'conventional-changelog@',
        ignore: onlyWorkspace('conventional-changelog'),
      })).toEqual(expect.objectContaining({
        type: 'major',
      }))

      expect(await advisor.next('1.5.0', {
        tagPrefix: 'conventional-changelog@',
        ignore: onlyWorkspace('conventional-changelog'),
      })).toEqual(expect.objectContaining({
        type: 'major',
        version: '2.0.0',
      }))
    })
  })

  describe('next', () => {
    it('can be instantiated without options', () => {
      expect(new ReleaseAdvisor()).toBeInstanceOf(ReleaseAdvisor)
    })

    it('supports in-memory history for ignore and strict flows', async () => {
      const base = commit({
        type: 'feat',
        header: 'feat: Added feature',
        subject: 'Added feature',
      })

      const revert = commit({
        type: 'revert',
        header: 'Revert "feat: Added feature"',
        subject: 'Revert "feat: Added feature"',
        revert: {
          header: 'feat: Added feature',
          hash: 'deadbeef',
        },
      })

      const advisor = new ReleaseAdvisor({
        git: createGit([revert, base]),
      })

      expect(await advisor.advise({
        strict: true,
        ignore: (c) => c.type === 'revert',
      })).toBeNull()

      expect(await advisor.advise({
        ignoreReverted: false,
        ignore: (c) => c.type === 'revert',
      })).toEqual(expect.objectContaining({
        type: 'minor',
      }))

      expect(await advisor.next('1.0.0', {
        strict: true,
        ignore: () => true,
      })).toEqual({
        type: 'unknown',
        version: '1.0.0',
      })
    })

    it('handles prerelease continuation for 0.x versions', async () => {
      const advisor = new ReleaseAdvisor({
        git: createGit([commit({
          type: 'feat',
          header: 'feat: Added feature',
          subject: 'Added feature',
        })]),
      })

      expect(await advisor.next('0.1.0-alpha.1', { prerelease: 'alpha' })).toEqual({
        type: 'prerelease',
        version: '0.1.0-alpha.2',
      })

      expect(await advisor.next('0.0.1-alpha.1', { prerelease: 'alpha' })).toEqual({
        type: 'prerelease',
        version: '0.0.1-alpha.2',
      })

      expect(await advisor.next('0.0.0-alpha.1', { prerelease: 'alpha' })).toEqual({
        type: 'prerelease',
        version: '0.0.0-alpha.2',
      })
    })

    it('returns next version based on recommendation', async () => {
      const advisor = new ReleaseAdvisor({ cwd })

      exec('git commit -m "feat: some feature" --allow-empty --no-gpg-sign')

      expect(await advisor.next('1.0.0')).toEqual({
        type: 'minor',
        version: '1.1.0',
      })
    })

    it('supports forced version type', async () => {
      const advisor = new ReleaseAdvisor({ cwd })

      expect(await advisor.next('1.0.0', { type: 'major' })).toEqual({
        type: 'major',
        version: '2.0.0',
      })
    })

  it('supports prerelease', async () => {
      const advisor = new ReleaseAdvisor({ cwd })

      exec('git commit -m "feat: some feature" --allow-empty --no-gpg-sign')

      expect(await advisor.next('1.0.0', { prerelease: 'alpha' })).toEqual({
        type: 'preminor',
        version: '1.1.0-alpha.1',
      })
    })

    it('handles prerelease to stable transition', async () => {
      const advisor = new ReleaseAdvisor({ cwd })

      exec('git commit -m "fix: some fix" --allow-empty --no-gpg-sign')

      expect(await advisor.next('1.1.0-alpha.1', { prerelease: 'alpha' })).toEqual(
        expect.objectContaining({ version: '1.1.0-alpha.2' })
      )
    })

    it('handles major prerelease', async () => {
      const advisor = new ReleaseAdvisor({ cwd })

      exec('git commit -m "feat!: breaking" --allow-empty --no-gpg-sign')

      expect(await advisor.next('1.0.0', { prerelease: 'beta' })).toEqual({
        type: 'premajor',
        version: '2.0.0-beta.1',
      })
    })

    it('handles unknown recommendation', async () => {
      const advisor = new ReleaseAdvisor({ cwd })

      exec('git commit -m "chore: some chore" --allow-empty --no-gpg-sign')

      expect(await advisor.next('1.0.0')).toEqual({
        type: 'patch',
        version: '1.0.1',
      })
    })

    it('handles invalid version', async () => {
      const advisor = new ReleaseAdvisor({ cwd })

      exec('git commit -m "feat: some feature" --allow-empty --no-gpg-sign')

      expect(await advisor.next('invalid-version')).toEqual(
        expect.objectContaining({ version: 'invalid-version' })
      )
    })

    it('uses loose semver if option provided', async () => {
      const advisor = new ReleaseAdvisor({ cwd })

      exec('git commit -m "feat: some feature" --allow-empty --no-gpg-sign')

      expect(await advisor.next('v1.0.0', { loose: true })).toEqual(
        expect.objectContaining({ version: '1.1.0' })
      )
    })

    it('detects type of version, automatically calculates if it is pre-major', async () => {
      const advisor = new ReleaseAdvisor({ cwd })

      exec('git commit -m "feat: some feature" --allow-empty --no-gpg-sign')

      expect(await advisor.next('1.1.0', { prerelease: 'alpha' })).toEqual({
        type: 'preminor',
        version: '1.2.0-alpha.1',
      })

      expect(await advisor.next('1.1.1', { prerelease: 'alpha' })).toEqual({
        type: 'preminor',
        version: '1.2.0-alpha.1',
      })

      expect(await advisor.next('0.0.1', { prerelease: 'alpha' })).toEqual({
        type: 'prepatch',
        version: '0.0.2-alpha.1',
      })

      expect(await advisor.next('0.1.0', { prerelease: 'alpha' })).toEqual({
        type: 'prepatch',
        version: '0.1.1-alpha.1',
      })
    })
  })

  it('keeps prerelease recommendations intact in preMajor mode', () => {
    expect(resolveNextVersion('1.0.0-alpha.1', {
      recommendation: {
        type: 'preminor' as never,
        reason: '',
      },
      preMajor: true,
    }).type).toBe('preminor')
  })

  it('creates recommendation analyzer with default options', async () => {
    const analyzer = createRecommendationAnalyzer()
    const context = {
      range: {
        from: null,
        to: 'HEAD',
      },
      commits: {
        total: 0,
      },
    }

    await analyzer.onStart?.(context)
    expect(await analyzer.onComplete?.(context)).toEqual({
      type: 'patch',
      reason: 'There are 0 BREAKING CHANGES and 0 features',
    })
  })

  it('resolves next version with default options', () => {
    expect(resolveNextVersion('1.0.0')).toEqual({
      type: 'unknown',
      version: '1.0.0',
    })
  })

  it('downgrades stable recommendations in preMajor mode', () => {
    expect(resolveNextVersion('0.2.0', {
      recommendation: {
        type: 'minor',
        reason: '',
      },
      preMajor: true,
    })).toEqual({
      type: 'patch',
      version: '0.2.1',
    })

    expect(resolveNextVersion('0.0.1', {
      recommendation: {
        type: 'patch',
        reason: '',
      },
      preMajor: true,
    })).toEqual({
      type: 'patch',
      version: '0.0.2',
    })
  })
})
