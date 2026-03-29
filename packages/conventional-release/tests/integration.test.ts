import { run as runRelease } from '@/index'
import { applyGitFixture } from '~tests/helpers/git-fixture'

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'

import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import {
  join,
  resolve,
} from 'node:path'

const __temporary = join(__dirname, 'tmp')

describe('release integration fixtures', () => {
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
    } catch { /* empty */
    }
  })

  it('supports sync use case with package-driven releaseAs', async () => {
    applyGitFixture({
      cwd,
      useCase: 'case-sync',
      fixture: 'single-package-major',
    })

    const result = await runRelease({
      cwd,
      dry: true,
    })
    const slice = result.slices[0]

    expect(result).toEqual(expect.objectContaining({
      changed: true,
      dry: true,
    }))
    expect(slice).toEqual(expect.objectContaining({
      currentVersion: '0.1.0',
      nextVersion: '1.0.0',
      releaseType: 'major',
      tag: 'v1.0.0',
    }))
    expect(result.files).toEqual(expect.arrayContaining([
      'package.json',
      'package-lock.json',
      'CHANGELOG.md',
    ]))
  })

  it('supports config precedence use case with inline override', async () => {
    applyGitFixture({
      cwd,
      useCase: 'case-config',
      fixture: 'inline-overrides-repo-config',
    })

    const result = await runRelease({
      cwd,
      dry: true,
      releaseAs: 'patch',
    })
    const slice = result.slices[0]

    expect(result).toEqual(expect.objectContaining({
      changed: true,
      dry: true,
    }))
    expect(slice).toEqual(expect.objectContaining({
      currentVersion: '0.1.0',
      nextVersion: '0.1.1',
      releaseType: 'patch',
      tag: 'v0.1.1',
    }))
  })

  it('supports hybrid use case with partitioned and fallback slices', async () => {
    applyGitFixture({
      cwd,
      useCase: 'case-hybrid',
      fixture: 'partitioned-monorepo-minor',
    })

    const result = await runRelease({
      cwd,
      dry: true,
      releaseAs: 'minor',
      mode: 'hybrid',
      partitions: {
        core: {
          mode: 'sync',
          workspaces: ['@fixture/app', '@fixture/web'],
        },
        plugins: {
          mode: 'async',
          workspaces: ['@fixture/plugin-*'],
        },
      },
    })

    expect(result).toEqual(expect.objectContaining({
      changed: true,
      dry: true,
    }))
    expect(result.slices.map((slice) => slice.id)).toEqual([
      'partition:core',
      'partition:plugins:@fixture/plugin-a',
      'hybrid:fixture-release-root',
      'hybrid:@fixture/worker',
    ])
    expect(result.slices[0]).toEqual(expect.objectContaining({
      kind: 'partition',
      mode: 'sync',
      partition: 'core',
      currentVersion: '1.0.0',
      nextVersion: '1.1.0',
      tag: 'core@1.1.0',
    }))
    expect(result.slices[0]?.packages.map((pkg) => pkg.name)).toEqual([
      '@fixture/app',
      '@fixture/web',
    ])
    expect(result.slices[1]).toEqual(expect.objectContaining({
      kind: 'partition',
      mode: 'async',
      partition: 'plugins',
      currentVersion: '1.0.0',
      nextVersion: '1.1.0',
      tag: 'plugins@1.1.0',
    }))
    expect(result.slices[2]).toEqual(expect.objectContaining({
      kind: 'async',
      mode: 'async',
      currentVersion: '1.0.0',
      nextVersion: '1.1.0',
      tag: 'fixture-release-root@1.1.0',
    }))
    expect(result.slices[3]).toEqual(expect.objectContaining({
      kind: 'async',
      mode: 'async',
      currentVersion: '1.0.0',
      nextVersion: '1.1.0',
      tag: '@fixture/worker@1.1.0',
    }))
    expect(result.files).toEqual(expect.arrayContaining([
      'package.json',
      'packages/app/package.json',
      'packages/web/package.json',
      'packages/plugin-a/package.json',
      'packages/worker/package.json',
      'package-lock.json',
      'CHANGELOG.md',
    ]))
  })
})
