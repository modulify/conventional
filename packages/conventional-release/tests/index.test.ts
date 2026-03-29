import type { Manifest } from '@modulify/pkg/types/manifest'
import type {
  Options as ReleaseOptions,
  Package as ReleasePackage,
  Reporter,
} from '@/index'

import {
  createScope as createReleaseScope,
  run as runRelease,
  resolveConfig as resolveReleaseConfig,
} from '@/index'
import { runScope as runReleaseScope } from '@/execute'
import { discover as discoverRelease, toScope as toPublicReleaseScope } from '@/plan'
import { createRuntime as createReleaseRuntime, type Runtime as ReleaseRuntime } from '@/runtime'

import { execSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

const pkgState = vi.hoisted(() => ({
  mocked: false,
  root: undefined as ReleasePackage | undefined,
  updates: [] as Array<{ path: string; diff: Partial<Manifest>; dry: boolean; }>,
}))

vi.mock('@modulify/pkg', async () => {
  const actual = await vi.importActual<typeof import('@modulify/pkg')>('@modulify/pkg')

  return {
    ...actual,
    read: vi.fn((cwd: string) => {
      if (!pkgState.mocked) {
        return actual.read(cwd)
      }

      if (!pkgState.root) {
        throw new Error('Mock package root is not configured')
      }

      return pkgState.root
    }),
    update: vi.fn((path: string, diff: Partial<Manifest>, dry: boolean) => {
      if (!pkgState.mocked) {
        return actual.update(path, diff, dry)
      }

      pkgState.updates.push({ path, diff, dry })

      return `${path}/package.json`
    }),
  }
})

afterEach(() => {
  pkgState.mocked = false
  pkgState.root = undefined
  pkgState.updates = []
})

const createPackage = ({
  name,
  path,
  manifest,
}: {
  name?: string;
  path: string;
  manifest?: Partial<Manifest>;
}): ReleasePackage => ({
  name,
  path,
  manifest: {
    version: '1.0.0',
    ...manifest,
  } as Manifest,
  children: [],
})

function createRuntime ({
  root,
  nested = [],
  dry = false,
  next = { type: 'minor', version: '1.1.0' },
}: {
  root: ReleasePackage;
  nested?: ReleasePackage[];
  dry?: boolean;
  next?: { type: string; version: string | null; };
}) {
  const runtimeRoot = {
    ...root,
    children: [...root.children, ...nested],
  } satisfies ReleasePackage

  pkgState.mocked = true
  pkgState.root = runtimeRoot
  pkgState.updates = []

  const runtime = {
    cwd: '/repo',
    dry,
    changelogFile: 'CHANGELOG.md',
    packageManager: {
      command: 'yarn',
      lockfile: 'yarn.lock',
    },
    advisor: {
      next: vi.fn(async () => next),
    },
    write: vi.fn(async () => '# Changelog'),
    sh: {
      exec: vi.fn(async () => undefined),
    },
    git: {
      add: vi.fn(async () => undefined),
      commit: vi.fn(async () => undefined),
      tag: vi.fn(async () => undefined),
    },
  } satisfies ReleaseRuntime

  return {
    runtime,
    updates: pkgState.updates,
  }
}

function createTemporaryDirectory () {
  return mkdtempSync(join(tmpdir(), 'conventional-release-config-'))
}

async function createReleaseScopeWithRuntime (
  runtime: ReleaseRuntime,
  options: ReleaseOptions = {}
) {
  const scope = await discoverRelease(runtime, options)

  return toPublicReleaseScope(scope, runtime.cwd)
}

async function runReleaseWithRuntime (
  runtime: ReleaseRuntime,
  options: ReleaseOptions = {},
  reporting?: {
    reporter: Reporter;
    context: { cwd: string; dry: boolean; };
  }
) {
  const scope = await discoverRelease(runtime, options)

  return runReleaseScope(runtime, scope, options, reporting)
}

function createExec (cwd: string) {
  return (command: string) => execSync(command, {
    cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
  })
}

function initializeGitRepository (cwd: string) {
  const exec = createExec(cwd)

  mkdirSync(join(cwd, 'git-templates'))
  exec('git init --template=./git-templates --initial-branch=main')
  exec('git config user.name "Tester"')
  exec('git config user.email "tester.modulify@gmail.com"')

  return exec
}

function onlySlice<T> (slices: T[]) {
  expect(slices).toHaveLength(1)

  return slices[0]!
}

describe('runRelease', () => {
  it('returns without side effects when no new version is required', async () => {
    const root = createPackage({
      name: '@scope/root',
      path: '/repo',
      manifest: { version: '1.0.0' },
    })
    const { runtime } = createRuntime({
      root,
      next: { type: 'patch', version: '1.0.0' },
    })

    const result = await runReleaseWithRuntime(runtime)
    const step = onlySlice(result.slices)

    expect(result).toEqual(expect.objectContaining({
      mode: 'sync',
      changed: false,
      dry: false,
      files: [],
    }))
    expect(step).toEqual(expect.objectContaining({
      id: 'sync:default',
      kind: 'sync',
      mode: 'sync',
      currentVersion: '1.0.0',
      nextVersion: '1.0.0',
      releaseType: 'patch',
      changed: false,
      dry: false,
      files: [],
    }))
    expect(runtime.write).not.toHaveBeenCalled()
    expect(runtime.sh.exec).not.toHaveBeenCalled()
    expect(runtime.git.add).not.toHaveBeenCalled()
  })

  it('throws when advisor cannot calculate a version', async () => {
    const root = createPackage({
      name: '@scope/root',
      path: '/repo',
      manifest: { version: '1.0.0' },
    })
    const { runtime } = createRuntime({
      root,
      next: { type: 'patch', version: null },
    })

    await expect(runReleaseWithRuntime(runtime)).rejects.toThrow('Unable to calculate next version for slice "sync:default"')
  })

  it('updates manifests and finalizes release with commit and tag', async () => {
    const root = createPackage({
      name: '@scope/root',
      path: '/repo',
      manifest: {
        version: '1.0.0',
        dependencies: {
          '@scope/plugin': '^1.0.0',
          'chalk': '^5.0.0',
        },
        peerDependencies: {
          '@scope/plugin': '~1.0.0',
        },
      },
    })
    const nested = createPackage({
      name: '@scope/plugin',
      path: '/repo/packages/plugin',
      manifest: {
        version: '1.0.0',
        devDependencies: {
          '@scope/root': 'workspace:^1.0.0',
          'vitest': '^4.0.0',
        },
      },
    })
    const { runtime, updates } = createRuntime({
      root,
      nested: [nested],
      next: { type: 'minor', version: '1.1.0' },
    })

    const result = await runReleaseWithRuntime(runtime, {
      fromTag: 'v1.0.0',
      tagPrefix: 'v',
    })
    const step = onlySlice(result.slices)

    expect(runtime.advisor.next).toHaveBeenCalledWith('1.0.0', {
      type: undefined,
      prerelease: undefined,
      fromTag: 'v1.0.0',
      tagPrefix: 'v',
    })
    expect(runtime.sh.exec).toHaveBeenCalledWith('yarn', ['install', '--no-immutable'])
    expect(runtime.write).toHaveBeenCalledWith('1.1.0')
    expect(updates[0]?.diff).toEqual({
      version: '1.1.0',
      dependencies: {
        '@scope/plugin': '^1.1.0',
        'chalk': '^5.0.0',
      },
      peerDependencies: {
        '@scope/plugin': '~1.1.0',
      },
    })
    expect(updates[1]?.diff).toEqual({
      version: '1.1.0',
      devDependencies: {
        '@scope/root': 'workspace:^1.1.0',
        'vitest': '^4.0.0',
      },
    })
    expect(runtime.git.add).toHaveBeenCalledWith([
      'package.json',
      'packages/plugin/package.json',
      'yarn.lock',
      'CHANGELOG.md',
    ])
    expect(runtime.git.commit).toHaveBeenCalledWith({
      files: [
        'package.json',
        'packages/plugin/package.json',
        'yarn.lock',
        'CHANGELOG.md',
      ],
      message: 'chore(release): v1.1.0',
    })
    expect(runtime.git.tag).toHaveBeenCalledWith({
      name: 'v1.1.0',
      message: 'chore(release): v1.1.0',
    })
    expect(result).toEqual(expect.objectContaining({
      mode: 'sync',
      changed: true,
      dry: false,
      files: [
        'package.json',
        'packages/plugin/package.json',
        'yarn.lock',
        'CHANGELOG.md',
      ],
    }))
    expect(step).toEqual(expect.objectContaining({
      releaseType: 'minor',
      nextVersion: '1.1.0',
      tag: 'v1.1.0',
    }))
  })

  it('supports dry-run mode without install, commit, or tag', async () => {
    const root = createPackage({
      name: '@scope/root',
      path: '/repo',
      manifest: {
        version: '1.0.0',
        optionalDependencies: {
          '@modulify/conventional-git': '^1.0.0',
        },
      },
    })
    const { runtime } = createRuntime({
      root,
      dry: true,
      next: { type: 'patch', version: '1.0.1' },
    })

    const result = await runReleaseWithRuntime(runtime)
    const step = onlySlice(result.slices)

    expect(runtime.sh.exec).not.toHaveBeenCalled()
    expect(runtime.git.add).not.toHaveBeenCalled()
    expect(runtime.git.commit).not.toHaveBeenCalled()
    expect(runtime.git.tag).not.toHaveBeenCalled()
    expect(result).toEqual(expect.objectContaining({
      dry: true,
      changed: true,
      files: ['package.json', 'yarn.lock', 'CHANGELOG.md'],
    }))
    expect(step).toEqual(expect.objectContaining({
      tag: 'v1.0.1',
    }))
  })

  it('supports custom release options and custom messages', async () => {
    const root = createPackage({
      path: '/repo',
      manifest: {
        version: '1.1.0',
        dependencies: {
          '@custom/release-tools': '^1.1.0',
          '@modulify/conventional-git': '^1.1.0',
        },
      },
    })
    const nested = createPackage({
      name: '@custom/release-tools',
      path: '/repo/packages/release-tools',
      manifest: {
        version: '1.1.0',
      },
    })
    const { runtime, updates } = createRuntime({
      root,
      nested: [nested],
      next: { type: 'minor', version: '1.2.0' },
    })

    const result = await runReleaseWithRuntime(runtime, {
      install: false,
      dependencyPolicy: 'exact',
      tagName: ({ version }) => `release-${version}`,
      commitMessage: ({ tag }) => `build: Added ${tag}`,
      tagMessage: ({ tag }) => `build: Added ${tag}`,
    })
    const step = onlySlice(result.slices)

    expect(runtime.sh.exec).not.toHaveBeenCalled()
    expect(updates[0]?.diff).toEqual({
      version: '1.2.0',
      dependencies: {
        '@custom/release-tools': '1.2.0',
        '@modulify/conventional-git': '^1.1.0',
      },
    })
    expect(updates[1]?.diff).toEqual({
      version: '1.2.0',
    })
    expect(step.tag).toBe('release-1.2.0')
    expect(step.commitMessage).toBe('build: Added release-1.2.0')
    expect(step.tagMessage).toBe('build: Added release-1.2.0')
  })

  it('uses install array as explicit yarn arguments', async () => {
    const root = createPackage({
      path: '/repo',
      manifest: {
        version: '1.0.0',
      },
    })
    const { runtime } = createRuntime({
      root,
      next: { type: 'patch', version: '1.0.1' },
    })

    await runReleaseWithRuntime(runtime, {
      install: ['--mode=skip-build'],
    })

    expect(runtime.sh.exec).toHaveBeenCalledWith('yarn', ['install', '--mode=skip-build'])
  })

  it('preserves internal dependency range formats when policy is preserve', async () => {
    const root = createPackage({
      name: '@scope/root',
      path: '/repo',
      manifest: {
        version: '1.0.0',
        dependencies: {
          '@scope/ws-star': 'workspace:*',
          '@scope/ws-tilde': 'workspace:~1.0.0',
          '@scope/ws-exact': 'workspace:1.0.0',
          '@scope/plain': '1.0.0',
        },
      },
    })
    const nested = [
      createPackage({
        name: '@scope/ws-star',
        path: '/repo/packages/ws-star',
      }),
      createPackage({
        name: '@scope/ws-tilde',
        path: '/repo/packages/ws-tilde',
      }),
      createPackage({
        name: '@scope/ws-exact',
        path: '/repo/packages/ws-exact',
      }),
      createPackage({
        name: '@scope/plain',
        path: '/repo/packages/plain',
      }),
    ]
    const { runtime, updates } = createRuntime({
      root,
      nested,
      next: { type: 'minor', version: '1.1.0' },
    })

    await runReleaseWithRuntime(runtime, {
      install: false,
    })

    expect(updates[0]?.diff).toEqual({
      version: '1.1.0',
      dependencies: {
        '@scope/ws-star': 'workspace:*',
        '@scope/ws-tilde': 'workspace:~1.1.0',
        '@scope/ws-exact': 'workspace:1.1.0',
        '@scope/plain': '1.1.0',
      },
    })
  })

  it('applies caret dependency policy for internal dependencies', async () => {
    const root = createPackage({
      name: '@scope/root',
      path: '/repo',
      manifest: {
        version: '1.0.0',
        dependencies: {
          '@scope/plugin': '1.0.0',
        },
      },
    })
    const nested = createPackage({
      name: '@scope/plugin',
      path: '/repo/packages/plugin',
    })
    const { runtime, updates } = createRuntime({
      root,
      nested: [nested],
      next: { type: 'minor', version: '1.1.0' },
    })

    await runReleaseWithRuntime(runtime, {
      install: false,
      dependencyPolicy: 'caret',
    })

    expect(updates[0]?.diff).toEqual({
      version: '1.1.0',
      dependencies: {
        '@scope/plugin': '^1.1.0',
      },
    })
  })

  it('falls back to default current version and unknown release type', async () => {
    const root = createPackage({
      path: '/repo',
      manifest: {
        version: undefined,
      },
    })
    const advisorNext = vi.fn(async () => ({
      type: undefined,
      version: '0.0.1',
    }))
    const runtime = {
      ...createRuntime({
        root,
        next: { type: 'minor', version: '0.0.1' },
      }).runtime,
      advisor: {
        next: advisorNext,
      },
    } satisfies ReleaseRuntime

    const result = await runReleaseWithRuntime(runtime)
    const step = onlySlice(result.slices)

    expect(advisorNext).toHaveBeenCalledWith('0.0.0', {
      type: undefined,
      prerelease: undefined,
      fromTag: undefined,
      tagPrefix: undefined,
    })
    expect(step.currentVersion).toBe('0.0.0')
    expect(step.releaseType).toBe('unknown')
  })

  it('throws when sync step packages have misaligned versions', async () => {
    const root = createPackage({
      name: '@scope/root',
      path: '/repo',
      manifest: {
        version: '1.0.0',
      },
    })
    const packageA = createPackage({
      name: '@scope/a',
      path: '/repo/packages/a',
      manifest: {
        version: '2.0.0',
      },
    })
    const { runtime } = createRuntime({
      root,
      nested: [packageA],
      next: { type: 'minor', version: '2.1.0' },
    })

    await expect(runReleaseWithRuntime(runtime, {
      mode: 'hybrid',
      partitions: {
        core: {
          mode: 'sync',
          workspaces: ['@scope/root', '@scope/a'],
        },
      },
    })).rejects.toThrow('Sync release slice "partition:core" requires aligned package versions: @scope/root, @scope/a')
  })

  it('uses default partition tag name when custom tagName is not provided', async () => {
    const root = createPackage({
      name: '@scope/root',
      path: '/repo',
      manifest: {
        version: '1.0.0',
      },
    })
    const packageA = createPackage({
      name: '@scope/a',
      path: '/repo/packages/a',
      manifest: {
        version: '1.0.0',
      },
    })
    const { runtime } = createRuntime({
      root,
      nested: [packageA],
      dry: true,
      next: { type: 'patch', version: '1.0.1' },
    })

    const result = await runReleaseWithRuntime(runtime, {
      mode: 'hybrid',
      partitions: {
        core: {
          mode: 'async',
          workspaces: ['@scope/a'],
        },
      },
    })

    expect(result.slices.find((slice) => slice.id === 'partition:core:@scope/a')?.tag).toBe('core@1.0.1')
  })

  it('returns unchanged when commits do not touch the release root path', async () => {
    const cwd = createTemporaryDirectory()

    try {
      const exec = initializeGitRepository(cwd)
      mkdirSync(join(cwd, 'docs'), { recursive: true })

      writeFileSync(join(cwd, 'docs/README.md'), 'outside root')
      exec('git add docs/README.md')
      exec('git commit -m "docs: Added external docs" --no-gpg-sign')
      exec('git tag v1.0.0')
      writeFileSync(join(cwd, 'docs/README.md'), 'outside root changed')
      exec('git add docs/README.md')
      exec('git commit -m "docs: Updated external docs" --no-gpg-sign')

      const root = createPackage({
        name: '@scope/release-root',
        path: join(cwd, 'packages/release-root'),
        manifest: {
          version: '1.0.0',
        },
      })
      pkgState.mocked = true
      pkgState.root = root
      pkgState.updates = []
      const runtime = {
        cwd,
        dry: true,
        changelogFile: 'CHANGELOG.md',
        packageManager: {
          command: 'yarn',
          lockfile: 'yarn.lock',
        },
        advisor: {
          next: vi.fn(async () => ({ type: 'patch', version: '1.0.1' })),
        },
        write: vi.fn(async () => '# Changelog'),
        sh: {
          exec: vi.fn(async () => undefined),
        },
        git: {
          add: vi.fn(async () => undefined),
          commit: vi.fn(async () => undefined),
          tag: vi.fn(async () => undefined),
        },
      } satisfies ReleaseRuntime

      const result = await runReleaseWithRuntime(runtime, {
        mode: 'sync',
      })

      expect(result.changed).toBe(false)
      expect(pkgState.updates).toHaveLength(0)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('returns unchanged when workspace filters exclude all targets', async () => {
    const root = createPackage({
      name: '@scope/root',
      path: '/repo',
      manifest: {
        version: '1.0.0',
      },
    })
    const { runtime } = createRuntime({
      root,
      next: { type: 'patch', version: '1.0.1' },
    })

    const result = await runReleaseWithRuntime(runtime, {
      workspaces: {
        include: [''],
      },
    })

    expect(result.changed).toBe(false)
    expect(result.files).toEqual([])
    expect(runtime.write).not.toHaveBeenCalled()
    expect(runtime.git.add).not.toHaveBeenCalled()
  })

  it('updates each package once when planner yields duplicated package paths', async () => {
    const root = createPackage({
      name: '@scope/root',
      path: '/repo',
      manifest: {
        version: '1.0.0',
      },
    })
    const duplicate = createPackage({
      name: '@scope/root',
      path: '/repo',
      manifest: {
        version: '1.0.0',
      },
    })
    const { runtime, updates } = createRuntime({
      root,
      nested: [duplicate],
      next: { type: 'patch', version: '1.0.1' },
    })

    const result = await runReleaseWithRuntime(runtime, {
      mode: 'async',
    })

    expect(result.changed).toBe(true)
    expect(updates).toHaveLength(1)
    expect(updates[0]?.path).toBe('/repo')
  })

  it('reports slice lifecycle while executing discovered scope', async () => {
    const root = createPackage({
      name: '@scope/root',
      path: '/repo',
      manifest: {
        version: '1.0.0',
      },
    })
    const packageA = createPackage({
      name: '@scope/a',
      path: '/repo/packages/a',
      manifest: {
        version: '1.0.0',
      },
    })
    const { runtime } = createRuntime({
      root,
      nested: [packageA],
      dry: true,
      next: { type: 'patch', version: '1.0.1' },
    })
    const events = [] as string[]
    const reporter = {
      onSliceStart: vi.fn(async (slice, context) => {
        events.push(`start:${slice.id}:${context.cwd}:${String(context.dry)}`)
      }),
      onSliceSuccess: vi.fn(async (slice, context) => {
        events.push(`success:${slice.id}:${slice.nextVersion}:${String(context.dry)}`)
      }),
    } satisfies Reporter

    const result = await runReleaseWithRuntime(runtime, {
      mode: 'async',
    }, {
      reporter,
      context: {
        cwd: runtime.cwd,
        dry: runtime.dry,
      },
    })

    expect(result.slices.map((slice) => slice.id)).toEqual([
      'async:@scope/root',
      'async:@scope/a',
    ])
    expect(events).toEqual([
      'start:async:@scope/root:/repo:true',
      'success:async:@scope/root:1.0.1:true',
      'start:async:@scope/a:/repo:true',
      'success:async:@scope/a:1.0.1:true',
    ])
  })
})

describe('createReleaseScope', () => {
  it('creates async scope with deterministic per-package slices', async () => {
    const root = createPackage({
      name: '@scope/root',
      path: '/repo',
    })
    const packageB = createPackage({
      name: '@scope/b',
      path: '/repo/packages/b',
    })
    const packageA = createPackage({
      name: '@scope/a',
      path: '/repo/packages/a',
    })
    const { runtime } = createRuntime({
      root,
      nested: [packageB, packageA],
    })

    const scope = await createReleaseScopeWithRuntime(runtime, {
      mode: 'async',
      fromTag: 'v1.0.0',
      tagPrefix: 'v',
    })

    expect(scope.mode).toBe('async')
    expect(scope.slices.map((slice) => slice.id)).toEqual([
      'async:@scope/root',
      'async:@scope/a',
      'async:@scope/b',
    ])
    expect(scope.slices.every((slice) => slice.mode === 'async')).toBe(true)
    expect(scope.slices.map((slice) => slice.range.fromTag)).toEqual([
      'v1.0.0',
      'v1.0.0',
      'v1.0.0',
    ])
    expect(runtime.write).not.toHaveBeenCalled()
    expect(runtime.sh.exec).not.toHaveBeenCalled()
    expect(runtime.git.add).not.toHaveBeenCalled()
  })

  it('creates async scope from commits since the latest prefixed tag', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'conventional-release-plan-async-tagprefix-'))
    const exec = (command: string) => execSync(command, {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    })

    try {
      mkdirSync(join(cwd, 'git-templates'))
      mkdirSync(join(cwd, 'packages/a'), { recursive: true })
      mkdirSync(join(cwd, 'packages/b'), { recursive: true })

      writeFileSync(join(cwd, 'package.json'), JSON.stringify({
        name: 'fixture-release-root',
        version: '1.0.0',
        workspaces: ['packages/*'],
      }, null, 2))
      writeFileSync(join(cwd, 'packages/a/package.json'), JSON.stringify({
        name: '@fixture/a',
        version: '1.0.0',
      }, null, 2))
      writeFileSync(join(cwd, 'packages/b/package.json'), JSON.stringify({
        name: '@fixture/b',
        version: '1.0.0',
      }, null, 2))

      exec('git init --template=./git-templates --initial-branch=main')
      exec('git config user.name "Tester"')
      exec('git config user.email "tester.modulify@gmail.com"')
      exec('git add package.json packages/a/package.json packages/b/package.json')
      exec('git commit -m "feat: Added workspace packages" --no-gpg-sign')
      exec('git tag root@1.0.0')

      writeFileSync(join(cwd, 'packages/b/notes.md'), 'changed package b')
      exec('git add packages/b/notes.md')
      exec('git commit -m "docs: Updated package b notes" --no-gpg-sign')

      const scope = await createReleaseScope({
        cwd,
        mode: 'async',
        tagPrefix: 'root@',
      })

      expect(scope.affected.map((pkg) => pkg.path)).toEqual(['packages/b'])
      expect(scope.slices.map((slice) => slice.id)).toEqual(['async:@fixture/b'])
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('creates scope with runtime when options are omitted', async () => {
    const root = createPackage({
      name: '@scope/root',
      path: '/repo',
    })
    const { runtime } = createRuntime({
      root,
    })

    const scope = await createReleaseScopeWithRuntime(runtime)

    expect(scope.mode).toBe('sync')
    expect(scope.slices.map((slice) => slice.id)).toEqual(['sync:default'])
  })

  it('applies workspace include and exclude filters to discovery', async () => {
    const root = createPackage({
      name: '@scope/root',
      path: '/repo',
    })
    const packageA = createPackage({
      name: '@scope/a',
      path: '/repo/packages/a',
    })
    const packageB = createPackage({
      name: '@scope/b',
      path: '/repo/packages/b',
    })
    const { runtime } = createRuntime({
      root,
      nested: [packageA, packageB],
    })

    const scope = await createReleaseScopeWithRuntime(runtime, {
      mode: 'sync',
      workspaces: {
        include: ['packages/*'],
        exclude: ['**/b'],
      },
    })

    expect(scope.packages.map((pkg) => pkg.path)).toEqual([
      'packages/a',
    ])
    expect(scope.slices).toHaveLength(1)
    expect(scope.slices[0]?.id).toBe('sync:default')
    expect(scope.slices[0]?.packages.map((pkg) => pkg.path)).toEqual([
      'packages/a',
    ])
  })

  it('builds hybrid scope with partition range priority', async () => {
    const root = createPackage({
      name: '@scope/root',
      path: '/repo',
    })
    const packageA = createPackage({
      name: '@scope/a',
      path: '/repo/packages/a',
    })
    const packageB = createPackage({
      name: '@scope/b',
      path: '/repo/packages/b',
    })
    const packageC = createPackage({
      name: '@scope/c',
      path: '/repo/packages/c',
    })
    const { runtime } = createRuntime({
      root,
      nested: [packageA, packageB, packageC],
    })

    const scope = await createReleaseScopeWithRuntime(runtime, {
      mode: 'hybrid',
      fromTag: 'v0.0.0',
      tagPrefix: 'v',
      partitions: {
        core: {
          mode: 'sync',
          workspaces: ['@scope/a', '@scope/b'],
          fromTag: 'core-from-tag',
          tagPrefix: 'core-v',
        },
        plugins: {
          mode: 'async',
          workspaces: ['@scope/c'],
          tagPrefix: 'plugin-v',
        },
      },
    })

    expect(scope.mode).toBe('hybrid')
    expect(scope.slices.map((slice) => slice.id)).toEqual([
      'partition:core',
      'partition:plugins:@scope/c',
      'hybrid:@scope/root',
    ])
    expect(scope.slices[0]).toEqual(expect.objectContaining({
      kind: 'partition',
      mode: 'sync',
      partition: 'core',
      range: {
        fromTag: 'core-from-tag',
        tagPrefix: 'core-v',
      },
    }))
    expect(scope.slices[1]).toEqual(expect.objectContaining({
      kind: 'partition',
      mode: 'async',
      partition: 'plugins',
      range: {
        fromTag: 'v0.0.0',
        tagPrefix: 'plugin-v',
      },
    }))
    expect(scope.slices[2]).toEqual(expect.objectContaining({
      kind: 'async',
      mode: 'async',
      range: {
        fromTag: 'v0.0.0',
        tagPrefix: 'v',
      },
    }))
  })

  it('builds scope without runtime from repository on disk', async () => {
    const cwd = createTemporaryDirectory()

    try {
      writeFileSync(join(cwd, 'package.json'), JSON.stringify({
        name: 'fixture-release',
        version: '1.0.0',
      }, null, 2))

      const scope = await createReleaseScope({
        cwd,
      })

      expect(scope.mode).toBe('sync')
      expect(scope.slices).toHaveLength(1)
      expect(scope.slices[0]?.id).toBe('sync:default')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('supports calling createReleaseScope without arguments', async () => {
    const cwd = createTemporaryDirectory()
    const previous = process.cwd()

    try {
      writeFileSync(join(cwd, 'package.json'), JSON.stringify({
        name: 'fixture-release',
        version: '1.0.0',
      }, null, 2))

      process.chdir(cwd)
      const scope = await createReleaseScope()

      expect(scope.mode).toBe('sync')
      expect(scope.slices).toHaveLength(1)
      expect(scope.slices[0]?.id).toBe('sync:default')
    } finally {
      process.chdir(previous)
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('reports lifecycle events while running from repository on disk', async () => {
    const cwd = createTemporaryDirectory()
    const events = [] as string[]
    const reporter = {
      onStart: vi.fn(async (context) => {
        events.push(`start:${context.cwd}:${String(context.dry)}`)
      }),
      onScope: vi.fn(async (scope, context) => {
        events.push(`scope:${scope.slices.length}:${context.cwd}`)
      }),
      onSliceStart: vi.fn(async (slice) => {
        events.push(`slice-start:${slice.id}`)
      }),
      onSliceSuccess: vi.fn(async (slice) => {
        events.push(`slice-success:${slice.id}:${slice.nextVersion}`)
      }),
      onSuccess: vi.fn(async (result) => {
        events.push(`success:${String(result.changed)}:${result.slices.length}`)
      }),
    } satisfies Reporter

    try {
      const exec = initializeGitRepository(cwd)

      writeFileSync(join(cwd, 'package.json'), JSON.stringify({
        name: 'fixture-release',
        version: '1.0.0',
        packageManager: 'npm@10.0.0',
      }, null, 2))
      exec('git add package.json')
      exec('git commit -m "feat: Added package" --no-gpg-sign')

      const result = await runRelease({
        cwd,
        dry: true,
        releaseAs: 'patch',
        reporter,
      })

      expect(result.changed).toBe(true)
      expect(events).toEqual([
        `start:${cwd}:true`,
        `scope:1:${cwd}`,
        'slice-start:sync:default',
        'slice-success:sync:default:1.0.1',
        'success:true:1',
      ])
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('reports errors from run lifecycle before rethrowing', async () => {
    const cwd = createTemporaryDirectory()
    const events = [] as string[]
    const reporter = {
      onStart: vi.fn(async () => {
        events.push('start')
      }),
      onScope: vi.fn(async (scope) => {
        events.push(`scope:${scope.slices.length}`)
      }),
      onSliceStart: vi.fn(async (slice) => {
        events.push(`slice-start:${slice.id}`)
      }),
      onError: vi.fn(async (error) => {
        events.push(`error:${error instanceof Error ? error.message : String(error)}`)
      }),
    } satisfies Reporter

    try {
      writeFileSync(join(cwd, 'package.json'), JSON.stringify({
        name: 'fixture-release',
        version: '1.0.0',
        packageManager: 'npm@10.0.0',
        workspaces: ['packages/*'],
      }, null, 2))
      mkdirSync(join(cwd, 'packages/a'), { recursive: true })
      writeFileSync(join(cwd, 'packages/a/package.json'), JSON.stringify({
        name: '@fixture/a',
        version: '2.0.0',
      }, null, 2))

      await expect(runRelease({
        cwd,
        dry: true,
        releaseAs: 'patch',
        mode: 'hybrid',
        partitions: {
          core: {
            mode: 'sync',
            workspaces: ['fixture-release', '@fixture/a'],
          },
        },
        reporter,
      })).rejects.toThrow('Sync release slice "partition:core" requires aligned package versions: fixture-release, @fixture/a')

      expect(events).toEqual([
        'start',
        'scope:1',
        'slice-start:partition:core',
        'error:Sync release slice "partition:core" requires aligned package versions: fixture-release, @fixture/a',
      ])
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('builds hybrid fallback slices when partitions are not configured', async () => {
    const root = createPackage({
      name: '@scope/root',
      path: '/repo',
    })
    const packageA = createPackage({
      name: '@scope/a',
      path: '/repo/packages/a',
    })
    const { runtime } = createRuntime({
      root,
      nested: [packageA],
    })

    const scope = await createReleaseScopeWithRuntime(runtime, {
      mode: 'hybrid',
    })

    expect(scope.slices.map((slice) => slice.id)).toEqual([
      'hybrid:@scope/root',
      'hybrid:@scope/a',
    ])
  })

  it('falls back to global tagPrefix when partition tagPrefix is not set', async () => {
    const root = createPackage({
      name: '@scope/root',
      path: '/repo',
    })
    const packageA = createPackage({
      name: '@scope/a',
      path: '/repo/packages/a',
    })
    const { runtime } = createRuntime({
      root,
      nested: [packageA],
    })

    const scope = await createReleaseScopeWithRuntime(runtime, {
      mode: 'hybrid',
      fromTag: 'global-from',
      tagPrefix: 'global-prefix',
      partitions: {
        groupA: {
          mode: 'async',
          workspaces: ['@scope/a'],
        },
      },
    })

    expect(scope.slices[0]).toEqual(expect.objectContaining({
      id: 'partition:groupA:@scope/a',
      range: {
        fromTag: 'global-from',
        tagPrefix: 'global-prefix',
      },
    }))
  })

  it('skips untouched partition packages in hybrid mode', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'conventional-release-plan-hybrid-'))
    const exec = initializeGitRepository(cwd)

    try {
      mkdirSync(join(cwd, 'packages/a'), { recursive: true })
      writeFileSync(join(cwd, 'package.json'), JSON.stringify({
        name: 'fixture-release-root',
        version: '1.0.0',
        workspaces: ['packages/*'],
      }, null, 2))
      writeFileSync(join(cwd, 'packages/a/package.json'), JSON.stringify({
        name: '@fixture/a',
        version: '1.0.0',
      }, null, 2))

      exec('git add package.json packages/a/package.json')
      exec('git commit -m "feat: Added workspace package" --no-gpg-sign')
      exec('git tag v1.0.0')
      writeFileSync(join(cwd, 'README.md'), 'changed root file')
      exec('git add README.md')
      exec('git commit -m "docs: Updated root readme" --no-gpg-sign')

      const scope = await createReleaseScope({
        cwd,
        mode: 'hybrid',
        partitions: {
          packageA: {
            mode: 'sync',
            workspaces: ['@fixture/a'],
          },
        },
      })

      expect(scope.affected.map((pkg) => pkg.path)).toEqual(['.'])
      expect(scope.slices.map((slice) => slice.id)).toEqual(['hybrid:fixture-release-root'])
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('supports include-only and exclude-only workspace filters', async () => {
    const root = createPackage({
      name: '@scope/root',
      path: '/repo',
    })
    const packageA = createPackage({
      name: '@scope/a',
      path: '/repo/packages/a',
    })
    const packageB = createPackage({
      name: '@scope/b',
      path: '/repo/packages/b',
    })
    const { runtime } = createRuntime({
      root,
      nested: [packageA, packageB],
    })

    const includeOnly = await createReleaseScopeWithRuntime(runtime, {
      mode: 'sync',
      workspaces: {
        include: ['*'],
      },
    })
    const excludeOnly = await createReleaseScopeWithRuntime(runtime, {
      mode: 'sync',
      workspaces: {
        exclude: ['@scope/b'],
      },
    })

    expect(includeOnly.packages.map((pkg) => pkg.path)).toEqual([
      '.',
      'packages/a',
      'packages/b',
    ])
    expect(excludeOnly.packages.map((pkg) => pkg.path)).toEqual([
      '.',
      'packages/a',
    ])
  })

  it('supports unnamed packages in scope identities', async () => {
    const root = createPackage({
      path: '/repo',
      manifest: {
        name: undefined,
      },
    })
    const child = createPackage({
      path: '/repo/packages/plain',
      manifest: {
        name: undefined,
      },
    })
    const { runtime } = createRuntime({
      root,
      nested: [child],
    })

    const scope = await createReleaseScopeWithRuntime(runtime, {
      mode: 'async',
    })

    expect(scope.slices.map((slice) => slice.id)).toEqual([
      'async:root',
      'async:packages/plain',
    ])
  })

  it('treats empty workspace selector as non-matching pattern', async () => {
    const root = createPackage({
      name: '@scope/root',
      path: '/repo',
    })
    const { runtime } = createRuntime({
      root,
    })

    const scope = await createReleaseScopeWithRuntime(runtime, {
      mode: 'sync',
      workspaces: {
        include: [''],
      },
    })

    expect(scope.packages).toEqual([])
    expect(scope.slices).toEqual([])
  })

  it('supports workspace filtering for unnamed packages', async () => {
    const root = createPackage({
      path: '/repo',
      manifest: {
        name: undefined,
      },
    })
    const child = createPackage({
      path: '/repo/packages/plain',
      manifest: {
        name: undefined,
      },
    })
    const { runtime } = createRuntime({
      root,
      nested: [child],
    })

    const scope = await createReleaseScopeWithRuntime(runtime, {
      mode: 'sync',
      workspaces: {
        include: ['packages/*'],
      },
    })

    expect(scope.packages.map((pkg) => pkg.path)).toEqual([
      'packages/plain',
    ])
  })
})

describe('createReleaseRuntime', () => {
  it('creates runtime with default options', () => {
    const runtime = createReleaseRuntime()

    expect(runtime.cwd).toBe(process.cwd())
    expect(runtime.dry).toBe(false)
    expect(runtime.changelogFile).toBe('CHANGELOG.md')
    expect(runtime.packageManager.command).toBe('yarn')
  })

  it('creates runtime with dry changelog mode', () => {
    const runtime = createReleaseRuntime({
      cwd: '/repo',
      dry: true,
    })

    expect(runtime.cwd).toBe('/repo')
    expect(runtime.dry).toBe(true)
    expect(runtime.changelogFile).toBe('CHANGELOG.md')
    expect(typeof runtime.write).toBe('function')
  })

  it('creates runtime with file output mode', () => {
    const runtime = createReleaseRuntime({
      cwd: '/repo',
      dry: false,
      changelogFile: 'RELEASE_NOTES.md',
    })

    expect(runtime.cwd).toBe('/repo')
    expect(runtime.dry).toBe(false)
    expect(runtime.changelogFile).toBe('RELEASE_NOTES.md')
    expect(typeof runtime.write).toBe('function')
  })

  it('detects package manager from package.json', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'conventional-release-pm-'))

    try {
      writeFileSync(join(cwd, 'package.json'), JSON.stringify({
        name: 'fixture-release',
        version: '1.0.0',
        packageManager: 'npm@10.9.0',
      }, null, 2))

      const runtime = createReleaseRuntime({
        cwd,
        dry: true,
      })

      expect(runtime.packageManager).toEqual({
        command: 'npm',
        lockfile: 'package-lock.json',
      })
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it.each([
    ['yarn', 'yarn.lock', { command: 'yarn', lockfile: 'yarn.lock' }],
    ['pnpm', 'pnpm-lock.yaml', { command: 'pnpm', lockfile: 'pnpm-lock.yaml' }],
    ['npm', 'package-lock.json', { command: 'npm', lockfile: 'package-lock.json' }],
    ['bun', 'bun.lock', { command: 'bun', lockfile: 'bun.lock' }],
    ['bun binary', 'bun.lockb', { command: 'bun', lockfile: 'bun.lockb' }],
  ] as const)('detects %s from lockfile', (_, lockfile, expected) => {
    const cwd = mkdtempSync(join(tmpdir(), 'conventional-release-pm-lock-'))

    try {
      writeFileSync(join(cwd, lockfile), '')

      const runtime = createReleaseRuntime({
        cwd,
        dry: true,
      })

      expect(runtime.packageManager).toEqual(expected)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('falls back from unsupported packageManager field to lockfile detection', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'conventional-release-pm-invalid-'))

    try {
      writeFileSync(join(cwd, 'package.json'), JSON.stringify({
        name: 'fixture-release',
        version: '1.0.0',
        packageManager: 'foo@1.0.0',
      }, null, 2))
      writeFileSync(join(cwd, 'yarn.lock'), '')

      const runtime = createReleaseRuntime({
        cwd,
        dry: true,
      })

      expect(runtime.packageManager).toEqual({
        command: 'yarn',
        lockfile: 'yarn.lock',
      })
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('falls back to npm when repository gives no package manager hints', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'conventional-release-pm-default-'))

    try {
      const runtime = createReleaseRuntime({
        cwd,
        dry: true,
      })

      expect(runtime.packageManager).toEqual({
        command: 'npm',
        lockfile: 'package-lock.json',
      })
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('runs release with default package api wrappers', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'conventional-release-'))
    const exec = (command: string) => execSync(command, {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    })

    try {
      mkdirSync(join(cwd, 'git-templates'))
      writeFileSync(join(cwd, 'package.json'), JSON.stringify({
        name: 'fixture-release',
        version: '1.0.0',
      }, null, 2))

      exec('git init --template=./git-templates --initial-branch=main')
      exec('git config user.name "Tester"')
      exec('git config user.email "tester.modulify@gmail.com"')
      exec('git add package.json')
      exec('git commit -m "feat: Added integration fixture" --no-gpg-sign')

      const runtime = createReleaseRuntime({
        cwd,
        dry: true,
      })
      const result = await runReleaseWithRuntime(runtime)

      expect(result.changed).toBe(true)
      expect(result.files).toContain('package.json')
      expect(result.files).toContain('package-lock.json')
      expect(result.files).toContain('CHANGELOG.md')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('walks workspace children with default package api wrappers', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'conventional-release-workspace-'))
    const exec = (command: string) => execSync(command, {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    })

    try {
      mkdirSync(join(cwd, 'git-templates'))
      mkdirSync(join(cwd, 'packages/feature'), { recursive: true })

      writeFileSync(join(cwd, 'package.json'), JSON.stringify({
        name: 'fixture-release-root',
        version: '1.0.0',
        workspaces: ['packages/*'],
      }, null, 2))
      writeFileSync(join(cwd, 'packages/feature/package.json'), JSON.stringify({
        name: 'fixture-feature',
        version: '1.0.0',
      }, null, 2))

      exec('git init --template=./git-templates --initial-branch=main')
      exec('git config user.name "Tester"')
      exec('git config user.email "tester.modulify@gmail.com"')
      exec('git add package.json packages/feature/package.json')
      exec('git commit -m "feat: Added workspace fixture" --no-gpg-sign')

      const runtime = createReleaseRuntime({
        cwd,
        dry: true,
      })
      const result = await runReleaseWithRuntime(runtime)

      expect(result.changed).toBe(true)
      expect(result.files).toContain('package.json')
      expect(result.files).toContain('packages/feature/package.json')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('updates only affected packages for sync mode based on commits since the last tag', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'conventional-release-sync-affected-'))
    const exec = (command: string) => execSync(command, {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    })

    try {
      mkdirSync(join(cwd, 'git-templates'))
      mkdirSync(join(cwd, 'packages/a'), { recursive: true })
      mkdirSync(join(cwd, 'packages/b'), { recursive: true })

      writeFileSync(join(cwd, 'package.json'), JSON.stringify({
        name: 'fixture-release-root',
        version: '1.0.0',
        workspaces: ['packages/*'],
      }, null, 2))
      writeFileSync(join(cwd, 'packages/a/package.json'), JSON.stringify({
        name: '@fixture/a',
        version: '1.0.0',
        dependencies: {
          '@fixture/b': '^1.0.0',
        },
      }, null, 2))
      writeFileSync(join(cwd, 'packages/b/package.json'), JSON.stringify({
        name: '@fixture/b',
        version: '1.0.0',
      }, null, 2))

      exec('git init --template=./git-templates --initial-branch=main')
      exec('git config user.name "Tester"')
      exec('git config user.email "tester.modulify@gmail.com"')
      exec('git add package.json packages/a/package.json packages/b/package.json')
      exec('git commit -m "feat: Added workspace packages" --no-gpg-sign')
      exec('git tag v1.0.0')
      writeFileSync(join(cwd, 'packages/b/notes.md'), '# changed in history')
      exec('git add packages/b/notes.md')
      exec('git commit -m "docs: Updated package b notes" --no-gpg-sign')

      const result = await runRelease({
        cwd,
        dry: true,
        mode: 'sync',
        releaseAs: 'patch',
      })

      expect(result.changed).toBe(true)
      expect(result.files).toContain('packages/b/package.json')
      expect(result.files).not.toContain('package.json')
      expect(result.files).not.toContain('packages/a/package.json')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('updates root package when only root files changed since the last tag', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'conventional-release-sync-root-'))
    const exec = (command: string) => execSync(command, {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    })

    try {
      mkdirSync(join(cwd, 'git-templates'))
      mkdirSync(join(cwd, 'packages/feature'), { recursive: true })

      writeFileSync(join(cwd, 'package.json'), JSON.stringify({
        name: 'fixture-release-root',
        version: '1.0.0',
        workspaces: ['packages/*'],
      }, null, 2))
      writeFileSync(join(cwd, 'packages/feature/package.json'), JSON.stringify({
        name: '@fixture/feature',
        version: '1.0.0',
      }, null, 2))

      exec('git init --template=./git-templates --initial-branch=main')
      exec('git config user.name "Tester"')
      exec('git config user.email "tester.modulify@gmail.com"')
      exec('git add package.json packages/feature/package.json')
      exec('git commit -m "feat: Added workspace packages" --no-gpg-sign')
      exec('git tag v1.0.0')
      writeFileSync(join(cwd, 'README.md'), 'changed root file')
      exec('git add README.md')
      exec('git commit -m "docs: Updated root readme" --no-gpg-sign')

      const result = await runRelease({
        cwd,
        dry: true,
        mode: 'sync',
        releaseAs: 'patch',
      })

      expect(result.changed).toBe(true)
      expect(result.files).toContain('package.json')
      expect(result.files).not.toContain('packages/feature/package.json')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('returns unchanged when no commits were made after the latest tag', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'conventional-release-sync-no-commits-'))
    const exec = (command: string) => execSync(command, {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    })

    try {
      mkdirSync(join(cwd, 'git-templates'))
      mkdirSync(join(cwd, 'packages/feature'), { recursive: true })

      writeFileSync(join(cwd, 'package.json'), JSON.stringify({
        name: 'fixture-release-root',
        version: '1.0.0',
        workspaces: ['packages/*'],
      }, null, 2))
      writeFileSync(join(cwd, 'packages/feature/package.json'), JSON.stringify({
        name: '@fixture/feature',
        version: '1.0.0',
      }, null, 2))

      exec('git init --template=./git-templates --initial-branch=main')
      exec('git config user.name "Tester"')
      exec('git config user.email "tester.modulify@gmail.com"')
      exec('git add package.json packages/feature/package.json')
      exec('git commit -m "feat: Added workspace packages" --no-gpg-sign')
      exec('git tag v1.0.0')

      const result = await runRelease({
        cwd,
        dry: true,
        mode: 'sync',
      })

      expect(result.changed).toBe(false)
      expect(result.slices).toEqual([])
      expect(result.files).toEqual([])
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('detects renamed files in commit history for affected package resolution', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'conventional-release-sync-rename-'))
    const exec = (command: string) => execSync(command, {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    })

    try {
      mkdirSync(join(cwd, 'git-templates'))
      mkdirSync(join(cwd, 'packages/feature'), { recursive: true })

      writeFileSync(join(cwd, 'package.json'), JSON.stringify({
        name: 'fixture-release-root',
        version: '1.0.0',
        workspaces: ['packages/*'],
      }, null, 2))
      writeFileSync(join(cwd, 'packages/feature/package.json'), JSON.stringify({
        name: '@fixture/feature',
        version: '1.0.0',
      }, null, 2))
      writeFileSync(join(cwd, 'packages/feature/old.txt'), 'before')

      exec('git init --template=./git-templates --initial-branch=main')
      exec('git config user.name "Tester"')
      exec('git config user.email "tester.modulify@gmail.com"')
      exec('git add package.json packages/feature/package.json packages/feature/old.txt')
      exec('git commit -m "feat: Added workspace packages" --no-gpg-sign')
      exec('git tag v1.0.0')
      exec('git mv packages/feature/old.txt packages/feature/new.txt')
      exec('git commit -m "refactor: Renamed workspace file" --no-gpg-sign')

      const result = await runRelease({
        cwd,
        dry: true,
        mode: 'sync',
        releaseAs: 'patch',
      })

      expect(result.changed).toBe(true)
      expect(result.files).toContain('packages/feature/package.json')
      expect(result.files).not.toContain('package.json')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})

describe('config loading and high-level api', () => {
  it('loads empty config when no package.json and no release file exist', async () => {
    const cwd = createTemporaryDirectory()

    try {
      expect(await resolveReleaseConfig(cwd)).toEqual({})
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('loads config from current working directory when cwd is omitted', async () => {
    expect(await resolveReleaseConfig()).toEqual({})
  })

  it('loads release config from package.json', async () => {
    const cwd = createTemporaryDirectory()

    try {
      writeFileSync(join(cwd, 'package.json'), JSON.stringify({
        name: 'fixture-release',
        version: '1.2.3',
        release: {
          releaseAs: 'major',
          prerelease: 'beta',
        },
      }, null, 2))

      expect(await resolveReleaseConfig(cwd)).toEqual({
        releaseAs: 'major',
        prerelease: 'beta',
      })
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('ignores non-object config values in package.json and release file', async () => {
    const cwd = createTemporaryDirectory()

    try {
      writeFileSync(join(cwd, 'package.json'), JSON.stringify({
        name: 'fixture-release',
        version: '1.2.3',
        release: 'invalid',
      }, null, 2))
      writeFileSync(join(cwd, 'release.config.mjs'), 'export default "invalid"')

      expect(await resolveReleaseConfig(cwd)).toEqual({})
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('applies precedence inline > file > package', async () => {
    const cwd = createTemporaryDirectory()

    try {
      writeFileSync(join(cwd, 'package.json'), JSON.stringify({
        name: 'fixture-release',
        version: '1.2.3',
        release: {
          releaseAs: 'patch',
        },
      }, null, 2))
      writeFileSync(join(cwd, 'release.config.mjs'), `
        export default {
          mode: 'sync',
          releaseAs: 'major',
        }
      `)

      expect(await resolveReleaseConfig(cwd, {
        releaseAs: 'minor',
      })).toEqual({
        mode: 'sync',
        releaseAs: 'minor',
      })
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('supports release config files without default export', async () => {
    const cwd = createTemporaryDirectory()

    try {
      writeFileSync(join(cwd, 'package.json'), JSON.stringify({
        name: 'fixture-release',
        version: '1.2.3',
      }, null, 2))
      writeFileSync(join(cwd, 'release.config.mjs'), `
        export const releaseAs = 'major'
      `)

      expect(await resolveReleaseConfig(cwd)).toEqual({
        releaseAs: 'major',
      })
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('runs release via one-argument api and reads releaseAs from repository config', async () => {
    const cwd = createTemporaryDirectory()

    try {
      const exec = initializeGitRepository(cwd)

      writeFileSync(join(cwd, 'package.json'), JSON.stringify({
        name: 'fixture-release',
        version: '0.1.0',
        release: {
          releaseAs: 'major',
        },
      }, null, 2))

      exec('git add package.json')
      exec('git commit -m "feat: Added fixture package" --no-gpg-sign')

      const result = await runRelease({
        cwd,
        dry: true,
      })
      const step = onlySlice(result.slices)

      expect(result.changed).toBe(true)
      expect(step.currentVersion).toBe('0.1.0')
      expect(step.nextVersion).toBe('1.0.0')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('allows inline config override for one-argument api', async () => {
    const cwd = createTemporaryDirectory()

    try {
      const exec = initializeGitRepository(cwd)

      writeFileSync(join(cwd, 'package.json'), JSON.stringify({
        name: 'fixture-release',
        version: '0.1.0',
        release: {
          releaseAs: 'major',
        },
      }, null, 2))

      exec('git add package.json')
      exec('git commit -m "feat: Added fixture package" --no-gpg-sign')

      const result = await runRelease({
        cwd,
        dry: true,
        releaseAs: 'minor',
        mode: 'async',
      })
      const step = onlySlice(result.slices)

      expect(result.changed).toBe(true)
      expect(step.currentVersion).toBe('0.1.0')
      expect(step.nextVersion).toBe('0.2.0')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('falls back to process.cwd and dry=false when one-argument options omit cwd and dry', async () => {
    const cwd = createTemporaryDirectory()
    const previous = process.cwd()

    try {
      const exec = initializeGitRepository(cwd)

      writeFileSync(join(cwd, 'package.json'), JSON.stringify({
        name: 'fixture-release',
        version: '0.1.0',
      }, null, 2))

      exec('git add package.json')
      exec('git commit -m "feat: Added fixture package" --no-gpg-sign')

      process.chdir(cwd)
      const result = await runRelease({
        releaseAs: 'patch',
      })
      const step = onlySlice(result.slices)

      expect(result.changed).toBe(true)
      expect(result.dry).toBe(false)
      expect(step.currentVersion).toBe('0.1.0')
      expect(step.nextVersion).toBe('0.1.1')
    } finally {
      process.chdir(previous)
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('supports calling runRelease without arguments', async () => {
    const cwd = createTemporaryDirectory()
    const previous = process.cwd()

    try {
      const exec = initializeGitRepository(cwd)

      writeFileSync(join(cwd, 'package.json'), JSON.stringify({
        name: 'fixture-release',
        version: '0.1.0',
      }, null, 2))

      exec('git add package.json')
      exec('git commit -m "feat: Added fixture package" --no-gpg-sign')

      process.chdir(cwd)
      const result = await runRelease()
      const step = onlySlice(result.slices)

      expect(result.changed).toBe(true)
      expect(result.dry).toBe(false)
      expect(step.currentVersion).toBe('0.1.0')
    } finally {
      process.chdir(previous)
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})
