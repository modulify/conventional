import type {
  Reporter,
  Result,
  Scope,
  Slice,
  SliceResult,
} from '@/index'

import { run } from '@/index'
import { main } from '@/cli'
import {
  CliParseError,
  parseArgv,
} from '@/cli/args'
import { createReporter } from '@/cli/reporter'
import {
  BufferedOutput,
  Output,
} from '@/cli/output'

import {
  afterEach,
  describe,
  expect,
  it,
  beforeEach,
  vi,
} from 'vitest'

vi.mock('@/index', async () => {
  const actual = await vi.importActual<typeof import('@/index')>('@/index')

  return {
    ...actual,
    run: vi.fn(async () => undefined),
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('parseArgv', () => {
  const originalArgv = process.argv

  beforeEach(() => {
    process.argv = originalArgv
  })

  afterEach(() => {
    process.argv = originalArgv
  })

  it('returns default CLI options', async () => {
    await expect(parseArgv(['node', 'conventional-release'])).resolves.toEqual({
      releaseAs: undefined,
      prerelease: undefined,
      dry: false,
      verbose: false,
      tags: false,
    })
  })

  it('parses explicit CLI flags', async () => {
    await expect(parseArgv([
      'node',
      'conventional-release',
      '--dry',
      '--verbose',
      '--tags',
      '--release-as',
      'minor',
      '--prerelease',
      'beta',
    ])).resolves.toEqual({
      releaseAs: 'minor',
      prerelease: 'beta',
      dry: true,
      verbose: true,
      tags: true,
    })
  })

  it('rejects unsupported prerelease channels', async () => {
    expect.assertions(3)

    try {
      await parseArgv([
        'node',
        'conventional-release',
        '--prerelease',
        'preview',
      ])
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(CliParseError)
      expect((error as CliParseError).message).toBe('prerelease should be one of alpha, beta, rc or undefined')
      expect((error as CliParseError).help).toContain('Specify the prerelease type (alpha|beta|rc)')
    }
  })

  it('rejects missing option arguments with help text', async () => {
    expect.assertions(3)

    try {
      await parseArgv([
        'node',
        'conventional-release',
        '--release-as',
      ])
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(CliParseError)
      expect((error as CliParseError).message).toContain('Not enough arguments following: release-as')
      expect((error as CliParseError).help).toContain('Specify the release type (major|minor|patch)')
    }
  })

  it('falls back to process.argv when argv is omitted', async () => {
    process.argv = ['node', 'conventional-release', '--dry']

    await expect(parseArgv()).resolves.toEqual({
      releaseAs: undefined,
      prerelease: undefined,
      dry: true,
      verbose: false,
      tags: false,
    })
  })
})

describe('createReporter', () => {
  function createSummaryScope (): Scope {
    return {
      mode: 'sync',
      packages: [
        {
          name: '@scope/root',
          path: '.',
          version: '1.0.0',
        },
        {
          name: '@scope/pkg-a',
          path: 'packages/pkg-a',
          version: '1.0.0',
        },
      ],
      affected: [
        {
          name: '@scope/root',
          path: '.',
          version: '1.0.0',
        },
        {
          name: '@scope/pkg-a',
          path: 'packages/pkg-a',
          version: '1.0.0',
        },
      ],
      slices: [
        {
          id: 'sync:default',
          kind: 'sync',
          mode: 'sync',
          packages: [
            {
              name: '@scope/root',
              path: '.',
              version: '1.0.0',
            },
            {
              name: '@scope/pkg-a',
              path: 'packages/pkg-a',
              version: '1.0.0',
            },
          ],
          range: {},
        },
      ],
    }
  }

  function createChangedSlice (): SliceResult {
    return {
      id: 'sync:default',
      kind: 'sync',
      mode: 'sync',
      packages: [
        {
          name: '@scope/root',
          path: '.',
          version: '1.0.0',
        },
        {
          name: '@scope/pkg-a',
          path: 'packages/pkg-a',
          version: '1.0.0',
        },
      ],
      range: {},
      currentVersion: '1.0.0',
      nextVersion: '1.1.0',
      releaseType: 'minor',
      changed: true,
      dry: false,
      files: ['package.json', 'CHANGELOG.md'],
      tag: 'v1.1.0',
      commitMessage: 'chore(release): v1.1.0',
      tagMessage: 'chore(release): v1.1.0',
    }
  }

  function createUnchangedSlice (): SliceResult {
    return {
      id: 'sync:default',
      kind: 'sync',
      mode: 'sync',
      packages: [
        {
          name: '@scope/root',
          path: '.',
          version: '1.0.0',
        },
        {
          name: '@scope/pkg-a',
          path: 'packages/pkg-a',
          version: '1.0.0',
        },
      ],
      range: {},
      currentVersion: '1.0.0',
      nextVersion: '1.0.0',
      releaseType: 'patch',
      changed: false,
      dry: true,
      files: [],
    }
  }

  function createSlice (): Slice {
    return {
      id: 'sync:default',
      kind: 'sync',
      mode: 'sync',
      packages: [
        {
          name: '@scope/root',
          path: '.',
          version: '1.0.0',
        },
        {
          name: '@scope/pkg-a',
          path: 'packages/pkg-a',
          version: '1.0.0',
        },
      ],
      range: {},
    }
  }

  it('prints summary progress, tags, and push hint', async () => {
    const sink = new BufferedOutput()
    const output = new Output({
      dry: false,
      output: sink,
    })
    const reporter = createReporter({
      output,
      git: {
        revParse: vi.fn(async () => 'main'),
      },
      showTags: true,
    }) satisfies Reporter
    const scope = createSummaryScope()
    const slice = createSlice()
    const result = {
      mode: 'sync',
      changed: true,
      dry: false,
      packages: scope.packages,
      affected: scope.affected,
      slices: [createChangedSlice()],
      files: ['package.json', 'CHANGELOG.md'],
    } satisfies Result

    await reporter.onStart?.({ cwd: '/repo', dry: false })
    await reporter.onScope?.(scope, { cwd: '/repo', dry: false })
    await reporter.onSliceStart?.(slice, { cwd: '/repo', dry: false })
    await reporter.onSuccess?.(result, { cwd: '/repo', dry: false })

    expect(sink.messages.join('\n')).toContain('Starting release')
    expect(sink.messages.join('\n')).toContain('Running slice 1/1: @scope/root, @scope/pkg-a')
    expect(sink.messages.join('\n')).toContain('Release slices: 1')
    expect(sink.messages.join('\n')).toContain('Updated packages: 2')
    expect(sink.messages.join('\n')).toContain('Next version: 1.1.0')
    expect(sink.messages.join('\n')).toContain('Tags: v1.1.0')
    expect(sink.messages.join('\n')).toContain('git push --follow-tags origin main')
  })

  it('prints detailed per-slice output and dry-run summary', async () => {
    const sink = new BufferedOutput()
    const output = new Output({
      dry: true,
      output: sink,
    })
    const reporter = createReporter({
      output,
      git: {
        revParse: vi.fn(async () => 'main'),
      },
      showTags: true,
      verbosity: 'detailed',
    }) satisfies Reporter
    const scope = createSummaryScope()
    const changedSlice = createChangedSlice()
    const unchangedSlice = createUnchangedSlice()
    const result = {
      mode: 'sync',
      changed: true,
      dry: true,
      packages: scope.packages,
      affected: scope.affected,
      slices: [changedSlice],
      files: ['package.json', 'CHANGELOG.md'],
    } satisfies Result

    await reporter.onStart?.({ cwd: '/repo', dry: true })
    await reporter.onScope?.(scope, { cwd: '/repo', dry: true })
    await reporter.onSliceSuccess?.(changedSlice, { cwd: '/repo', dry: true })
    await reporter.onSliceSuccess?.(unchangedSlice, { cwd: '/repo', dry: true })
    await reporter.onSuccess?.(result, { cwd: '/repo', dry: true })

    expect(sink.messages.join('\n')).toContain('sync scope: 2 packages, 2 affected, 1 slices')
    expect(sink.messages.join('\n')).toContain('Starting dry release')
    expect(sink.messages.join('\n')).toContain('Completed slice @scope/root, @scope/pkg-a: 1.0.0 -> 1.1.0 (minor)')
    expect(sink.messages.join('\n')).toContain('Tag: v1.1.0')
    expect(sink.messages.join('\n')).toContain('Updated packages: @scope/root, @scope/pkg-a')
    expect(sink.messages.join('\n')).toContain('No committing or tagging since this was a dry run')
    expect(sink.messages.join('\n')).toContain('Completed slice @scope/root, @scope/pkg-a without version changes (1.0.0)')
  })

  it('prints no-changes and error branches', async () => {
    const sink = new BufferedOutput()
    const output = new Output({
      dry: false,
      output: sink,
    })
    const reporter = createReporter({
      output,
      git: {
        revParse: vi.fn(async () => 'main'),
      },
      showTags: false,
    }) satisfies Reporter

    await reporter.onSuccess?.({
      mode: 'sync',
      changed: false,
      dry: false,
      packages: [],
      affected: [],
      slices: [],
      files: [],
    }, {
      cwd: '/repo',
      dry: false,
    })
    await reporter.onError?.(new Error('boom'), {
      cwd: '/repo',
      dry: false,
    })

    expect(sink.messages.join('\n')).toContain('No changes since last release')
    expect(sink.errors.join('\n')).toContain('boom')
  })

  it('keeps detailed reporter quiet after unchanged success', async () => {
    const sink = new BufferedOutput()
    const output = new Output({
      dry: false,
      output: sink,
    })
    const reporter = createReporter({
      output,
      git: {
        revParse: vi.fn(async () => 'main'),
      },
      verbosity: 'detailed',
    }) satisfies Reporter

    await reporter.onSuccess?.({
      mode: 'sync',
      changed: false,
      dry: false,
      packages: [],
      affected: [],
      slices: [],
      files: [],
    }, {
      cwd: '/repo',
      dry: false,
    })

    expect(sink.messages.join('\n')).toContain('No changes since last release')
    expect(sink.messages.join('\n')).not.toContain('Updated packages:')
  })

  it('falls back to placeholder branch when rev-parse fails', async () => {
    const sink = new BufferedOutput()
    const output = new Output({
      dry: false,
      output: sink,
    })
    const reporter = createReporter({
      output,
      git: {
        revParse: vi.fn(async () => {
          throw new Error('no branch')
        }),
      },
      showTags: false,
    }) satisfies Reporter
    const scope = createSummaryScope()

    await reporter.onScope?.(scope, { cwd: '/repo', dry: false })
    await reporter.onSuccess?.({
      mode: 'sync',
      changed: true,
      dry: false,
      packages: scope.packages,
      affected: scope.affected,
      slices: [createChangedSlice()],
      files: ['package.json'],
    }, {
      cwd: '/repo',
      dry: false,
    })

    expect(sink.messages.join('\n')).toContain('git push --follow-tags origin %branch%')
  })

  it('uses partition labels and skips empty tag logs', async () => {
    const sink = new BufferedOutput()
    const output = new Output({
      dry: false,
      output: sink,
    })
    const reporter = createReporter({
      output,
      git: {
        revParse: vi.fn(async () => 'main'),
      },
      showTags: true,
    }) satisfies Reporter
    const scope = {
      mode: 'hybrid',
      packages: [
        {
          name: '@scope/a',
          path: 'packages/a',
          version: '1.0.0',
        },
      ],
      affected: [
        {
          name: '@scope/a',
          path: 'packages/a',
          version: '1.0.0',
        },
      ],
      slices: [
        {
          id: 'partition:core:@scope/a',
          kind: 'partition',
          mode: 'async',
          partition: 'core',
          packages: [
            {
              name: '@scope/a',
              path: 'packages/a',
              version: '1.0.0',
            },
          ],
          range: {},
        },
      ],
    } satisfies Scope
    const slice = scope.slices[0]!

    await reporter.onSliceStart?.(slice, { cwd: '/repo', dry: false })
    await reporter.onScope?.(scope, { cwd: '/repo', dry: false })
    await reporter.onSuccess?.({
      mode: 'hybrid',
      changed: true,
      dry: false,
      packages: scope.packages,
      affected: scope.affected,
      slices: [{
        ...slice,
        currentVersion: '1.0.0',
        nextVersion: '1.0.1',
        releaseType: 'patch',
        changed: true,
        dry: false,
        files: ['packages/a/package.json'],
      }],
      files: ['packages/a/package.json'],
    }, {
      cwd: '/repo',
      dry: false,
    })

    expect(sink.messages.join('\n')).toContain('Running slice core [@scope/a]')
    expect(sink.messages.join('\n')).not.toContain('Tags:')
  })

  it('deduplicates updated package names across changed slices', async () => {
    const sink = new BufferedOutput()
    const output = new Output({
      dry: false,
      output: sink,
    })
    const reporter = createReporter({
      output,
      git: {
        revParse: vi.fn(async () => 'main'),
      },
    }) satisfies Reporter

    await reporter.onSuccess?.({
      mode: 'async',
      changed: true,
      dry: false,
      packages: [{
        path: 'packages/a',
        version: '1.0.0',
      }],
      affected: [{
        path: 'packages/a',
        version: '1.0.0',
      }],
      slices: [
        {
          id: 'async:@scope/a',
          kind: 'async',
          mode: 'async',
          packages: [{
            path: 'packages/a',
            version: '1.0.0',
          }],
          range: {},
          currentVersion: '1.0.0',
          nextVersion: '1.0.1',
          releaseType: 'patch',
          changed: true,
          dry: false,
          files: ['packages/a/package.json'],
        },
        {
          id: 'partition:core:@scope/a',
          kind: 'partition',
          mode: 'async',
          partition: 'core',
          packages: [{
            path: 'packages/a',
            version: '1.0.0',
          }],
          range: {},
          currentVersion: '1.0.0',
          nextVersion: '1.0.1',
          releaseType: 'patch',
          changed: true,
          dry: false,
          files: ['packages/a/package.json'],
        },
      ],
      files: ['packages/a/package.json'],
    }, {
      cwd: '/repo',
      dry: false,
    })

    expect(sink.messages.join('\n')).toContain('Updated packages: 1')
  })

  it('writes through the default console transport', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const output = new Output({
      dry: false,
    })

    output.success('Done')
    output.warn('Warn')
    output.error('Boom')

    expect(info).toHaveBeenCalledTimes(2)
    expect(error).toHaveBeenCalledTimes(1)
  })

  it('covers fallback branches in summary and detailed reporters', async () => {
    const sink = new BufferedOutput()
    const output = new Output({
      dry: false,
      output: sink,
    })
    const summary = createReporter({
      output,
      git: {
        revParse: vi.fn(async () => 'main'),
      },
      showTags: true,
    }) satisfies Reporter
    const detailed = createReporter({
      output,
      git: {
        revParse: vi.fn(async () => 'main'),
      },
      showTags: true,
      verbosity: 'detailed',
    }) satisfies Reporter

    await summary.onSuccess?.({
      mode: 'sync',
      changed: true,
      dry: false,
      packages: [{
        path: '.',
        version: '1.0.0',
      }],
      affected: [],
      slices: [],
      files: [],
    }, {
      cwd: '/repo',
      dry: false,
    })
    await summary.onError?.('boom', {
      cwd: '/repo',
      dry: false,
    })
    await detailed.onSliceSuccess?.({
      id: 'async:packages/a',
      kind: 'async',
      mode: 'async',
      packages: [{
        path: 'packages/a',
        version: '1.0.0',
      }],
      range: {},
      currentVersion: '1.0.0',
      nextVersion: '1.0.1',
      releaseType: 'patch',
      changed: true,
      dry: false,
      files: ['packages/a/package.json'],
    }, {
      cwd: '/repo',
      dry: false,
    })

    expect(sink.messages.join('\n')).toContain('Release slices: 0')
    expect(sink.messages.join('\n')).toContain('Updated packages: 0')
    expect(sink.messages.join('\n')).toContain('Completed slice packages/a: 1.0.0 -> 1.0.1 (patch)')
    expect(sink.errors.join('\n')).toContain('boom')
  })

  it('uses default showTags=false when reporter options omit it', async () => {
    const sink = new BufferedOutput()
    const output = new Output({
      dry: false,
      output: sink,
    })
    const reporter = createReporter({
      output,
      git: {
        revParse: vi.fn(async () => 'main'),
      },
    }) satisfies Reporter

    await reporter.onSuccess?.({
      mode: 'sync',
      changed: true,
      dry: false,
      packages: [{
        name: '@scope/root',
        path: '.',
        version: '1.0.0',
      }],
      affected: [],
      slices: [createChangedSlice()],
      files: ['package.json'],
    }, {
      cwd: '/repo',
      dry: false,
    })

    expect(sink.messages.join('\n')).not.toContain('Tags:')
  })
})

describe('main', () => {
  it('wires parsed CLI options into run()', async () => {
    const runMock = vi.mocked(run)

    await main([
      'node',
      'conventional-release',
      '--dry',
      '--verbose',
      '--tags',
      '--release-as',
      'minor',
      '--prerelease',
      'rc',
    ])

    expect(runMock).toHaveBeenCalledWith(expect.objectContaining({
      cwd: process.cwd(),
      dry: true,
      releaseAs: 'minor',
      prerelease: 'rc',
      reporter: expect.any(Object),
    }))
  })

  it('uses default argv and summary verbosity when flags are omitted', async () => {
    const runMock = vi.mocked(run)
    const originalArgv = process.argv

    try {
      process.argv = ['node', 'conventional-release']

      await main()

      expect(runMock).toHaveBeenCalledWith(expect.objectContaining({
        cwd: process.cwd(),
        dry: false,
        releaseAs: undefined,
        prerelease: undefined,
        reporter: expect.any(Object),
      }))
    } finally {
      process.argv = originalArgv
    }
  })
})
