import type { Range } from '~types/domain'
import type { ReleaseType as SemverReleaseType } from 'semver'

import { GitCommander } from '@modulify/git-toolkit'
import { ReleaseAdvisor } from '@modulify/conventional-bump'
import { Runner } from '@modulify/git-toolkit/shell'

import { createWrite } from '@modulify/conventional-changelog'

import {
  existsSync,
  readFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { DEFAULT_CHANGELOG_FILE } from './constants'

export type Shell = {
  exec(command: string, args?: string[]): Promise<unknown>
}

export type Git = {
  add(files: string[]): Promise<unknown>
  commit(options: { files: string[]; message: string; }): Promise<unknown>
  tag(options: { name: string; message: string; }): Promise<unknown>
}

export type Advisor = {
  next(version: string, options?: {
    type?: SemverReleaseType;
    prerelease?: 'alpha' | 'beta' | 'rc';
  } & Range): Promise<{ type?: string | null; version: string | null; }>
}

export type PackageManagerName = 'yarn' | 'pnpm' | 'npm' | 'bun'

export interface PackageManager {
  command: PackageManagerName
  lockfile: string
}

export interface Runtime {
  cwd: string
  dry: boolean
  changelogFile: string
  packageManager: PackageManager
  advisor: Advisor
  write: (version: string) => Promise<string>
  sh: Shell
  git: Git
}

/** Creates the default runtime used by the public planning and release APIs. */
export function createRuntime ({
  cwd = process.cwd(),
  dry = false,
  changelogFile = DEFAULT_CHANGELOG_FILE,
}: {
  cwd?: string;
  dry?: boolean;
  changelogFile?: string;
} = {}): Runtime {
  const sh = new Runner(cwd)

  return {
    cwd,
    dry,
    changelogFile,
    packageManager: resolvePackageManager(cwd),
    advisor: createAdvisor(cwd),
    write: createWrite({
      cwd,
      file: dry ? undefined : join(cwd, changelogFile),
    }),
    sh,
    git: createGit(sh),
  }
}

function createAdvisor (cwd: string): Advisor {
  const advisor = new ReleaseAdvisor({ cwd })

  return {
    next: (version, options) => advisor.next(version, options),
  }
}

function createGit (sh: Runner): Git {
  const git = new GitCommander({ sh })

  return {
    add: (files) => git.add(files),
    commit: (options) => git.commit(options),
    tag: (options) => git.tag(options),
  }
}

function resolvePackageManager (cwd: string): PackageManager {
  const command = readPackageManager(cwd)
    ?? inferPackageManagerFromLockfile(cwd)
    ?? 'npm'

  return {
    command,
    lockfile: resolveLockfile(cwd, command),
  }
}

function readPackageManager (cwd: string): PackageManagerName | null {
  const file = join(cwd, 'package.json')

  if (!existsSync(file)) {
    return null
  }

  const content = JSON.parse(readFileSync(file, 'utf-8')) as {
    packageManager?: unknown
  }

  if (typeof content.packageManager !== 'string' || content.packageManager === '') {
    return null
  }

  const [name] = content.packageManager.split('@')

  return isPackageManagerName(name)
    ? name
    : null
}

function inferPackageManagerFromLockfile (cwd: string): PackageManagerName | null {
  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn'
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(cwd, 'package-lock.json'))) return 'npm'
  if (existsSync(join(cwd, 'bun.lock'))) return 'bun'
  if (existsSync(join(cwd, 'bun.lockb'))) return 'bun'

  return null
}

function resolveLockfile (cwd: string, command: PackageManagerName) {
  if (command === 'bun' && existsSync(join(cwd, 'bun.lockb'))) {
    return 'bun.lockb'
  }

  return {
    yarn: 'yarn.lock',
    pnpm: 'pnpm-lock.yaml',
    npm: 'package-lock.json',
    bun: 'bun.lock',
  }[command]
}

function isPackageManagerName (value: string): value is PackageManagerName {
  return value === 'yarn' || value === 'pnpm' || value === 'npm' || value === 'bun'
}
