import type { Dependencies, Manifest } from '@modulify/pkg/types/manifest'
import type {
  Options,
  Reporter,
  Result,
  RunContext,
  SliceResult,
  TagContext,
} from '../types/index'

import type {
  DiscoveredScope,
  DiscoveredSlice,
} from './plan'

import type { ChangelogNotes } from '@modulify/conventional-changelog'
import type { ReleaseRecommendation } from '@modulify/conventional-bump'
import type { Runtime } from './runtime'

import { createRecommendationAnalyzer } from '@modulify/conventional-bump'
import { createChangelogCapacitor } from '@modulify/conventional-changelog'
import { renderChangelog } from '@modulify/conventional-changelog'
import { resolveNextVersion } from '@modulify/conventional-bump'
import { update } from '@modulify/pkg'

import { join, relative } from 'node:path'

import {
  packageIdentity,
  toScopePackage,
  toSlice,
  uniquePackages,
  uniqueStrings,
} from './plan'

import {
  reportSliceStart,
  reportSliceSuccess,
} from './reporter'

import {
  DEFAULT_DEPENDENCY_POLICY_INTERNAL,
  DEFAULT_RELEASE_PREFIX,
} from './constants'

type Reporting = {
  reporter: Reporter
  context: RunContext
}

export async function runScope (
  runtime: Runtime,
  scope: DiscoveredScope,
  options: Options,
  reporting?: Reporting
): Promise<Result> {
  const slices = [] as SliceResult[]

  for (const slice of scope.slices) {
    if (reporting) {
      await reportSliceStart(reporting.reporter, toSlice(slice, runtime.cwd), reporting.context)
    }

    const result = await executeSlice(runtime, slice, options)

    if (reporting) {
      await reportSliceSuccess(reporting.reporter, result, reporting.context)
    }

    slices.push(result)
  }

  const files = uniqueStrings(
    slices.flatMap((slice) => slice.files)
  )
  const changed = slices.some((slice) => slice.changed)

  return {
    mode: scope.mode,
    changed,
    dry: runtime.dry,
    packages: scope.packages.map((pkg) => toScopePackage(pkg, runtime.cwd)),
    affected: scope.affected.map((pkg) => toScopePackage(pkg, runtime.cwd)),
    slices,
    files,
  }
}

async function executeSlice (
  runtime: Runtime,
  slice: DiscoveredSlice,
  options: Options
): Promise<SliceResult> {
  const normalizedSlice = {
    ...slice,
    packages: uniquePackages(slice.packages),
  } satisfies DiscoveredSlice
  const currentVersion = resolveSliceCurrentVersion(normalizedSlice, runtime.cwd)
  const releaseMeta = await collectSliceMeta(runtime, normalizedSlice)
  const release = resolveNextVersion(currentVersion, {
    recommendation: releaseMeta.recommendation,
    type: options.releaseAs,
    prerelease: options.prerelease,
  })
  const releaseType = String(release.type)
  const nextVersion = release.version

  const base = toSlice(normalizedSlice, runtime.cwd)

  if (nextVersion === currentVersion) {
    return {
      ...base,
      currentVersion,
      nextVersion,
      releaseType,
      changed: false,
      dry: runtime.dry,
      files: [],
    }
  }

  const changes = renderChangelog(nextVersion, {
    notes: releaseMeta.notes,
    url: await runtime.history.url(),
  })
  const files = await applySlice(runtime, normalizedSlice, nextVersion, options, changes)
  const context = createTagContext(normalizedSlice, nextVersion, releaseType, runtime.cwd)
  const tag = options.tagName
    ? options.tagName(context)
    : createDefaultTagName(normalizedSlice, nextVersion, runtime.cwd)

  if (runtime.dry) {
    return {
      ...base,
      currentVersion,
      nextVersion,
      releaseType,
      changed: true,
      dry: true,
      tag,
      files,
    }
  }

  const messageContext = { ...context, tag }
  const commitMessage = options.commitMessage
    ? options.commitMessage(messageContext)
    : DEFAULT_RELEASE_PREFIX + tag
  const tagMessage = options.tagMessage
    ? options.tagMessage(messageContext)
    : DEFAULT_RELEASE_PREFIX + tag

  await runtime.git.add(files)
  await runtime.git.commit({ files, message: commitMessage })
  await runtime.git.tag({ name: tag, message: tagMessage })

  return {
    ...base,
    currentVersion,
    nextVersion,
    releaseType,
    changed: true,
    dry: false,
    files,
    tag,
    commitMessage,
    tagMessage,
  }
}

async function applySlice (
  runtime: Runtime,
  slice: DiscoveredSlice,
  nextVersion: string,
  options: Options,
  changes: string
) {
  const bumpedPackageNames = slice.packages.reduce((all, pkg) => {
    const name = pkg.manifest.name ?? pkg.name

    if (name) {
      all.add(name)
    }

    return all
  }, new Set<string>())
  const dependencyPolicy = options.dependencyPolicy ?? DEFAULT_DEPENDENCY_POLICY_INTERNAL
  const files: string[] = []

  for (const pkg of slice.packages) {
    const diff = { version: nextVersion } as Partial<Manifest>
    const manifest = pkg.manifest

    if (hasDependencies(manifest.peerDependencies)) {
      diff.peerDependencies = actualizeDependencies(manifest.peerDependencies, nextVersion, bumpedPackageNames, dependencyPolicy)
    }

    if (hasDependencies(manifest.dependencies)) {
      diff.dependencies = actualizeDependencies(manifest.dependencies, nextVersion, bumpedPackageNames, dependencyPolicy)
    }

    if (hasDependencies(manifest.optionalDependencies)) {
      diff.optionalDependencies = actualizeDependencies(manifest.optionalDependencies, nextVersion, bumpedPackageNames, dependencyPolicy)
    }

    if (hasDependencies(manifest.devDependencies)) {
      diff.devDependencies = actualizeDependencies(manifest.devDependencies, nextVersion, bumpedPackageNames, dependencyPolicy)
    }

    files.push(relative(runtime.cwd, update(pkg.path, diff, runtime.dry)))
  }

  const installArgs = resolveInstallArgs(runtime, options.install)

  if (!runtime.dry && installArgs) {
    await runtime.sh.exec(runtime.packageManager.command, ['install', ...installArgs])
  }

  if (!runtime.dry) {
    await runtime.writeChangelog(changes)
  }

  files.push(relative(runtime.cwd, join(runtime.cwd, runtime.packageManager.lockfile)))
  files.push(relative(runtime.cwd, join(runtime.cwd, runtime.changelogFile)))

  return uniqueStrings(files)
}

async function collectSliceMeta (
  runtime: Runtime,
  slice: DiscoveredSlice
) {
  const result = await runtime.history.traverse({
    ...slice.range,
    traversers: [createRecommendationAnalyzer({
      strict: true,
    }), createChangelogCapacitor()],
  })

  return {
    recommendation: result.results.get('recommendation') as ReleaseRecommendation | null,
    notes: result.results.get('changelog') as ChangelogNotes,
  }
}

function resolveInstallArgs (runtime: Runtime, install: Options['install']) {
  if (install === false) {
    return null
  }

  if (Array.isArray(install)) {
    return install
  }

  if (runtime.packageManager.command === 'yarn') {
    return ['--no-immutable']
  }

  return []
}

function createTagContext (
  slice: DiscoveredSlice,
  version: string,
  releaseType: string,
  cwd: string
): TagContext {
  return {
    id: slice.id,
    kind: slice.kind,
    mode: slice.mode,
    partition: slice.partition,
    packages: slice.packages.map((pkg) => toScopePackage(pkg, cwd)),
    version,
    releaseType,
  }
}

function resolveSliceCurrentVersion (slice: DiscoveredSlice, cwd: string) {
  const versions = uniqueStrings(
    slice.packages
      .map((pkg) => pkg.manifest.version ?? '0.0.0')
  )

  if (slice.mode === 'sync' && versions.length > 1) {
    const packageList = slice.packages
      .map((pkg) => packageIdentity(pkg, cwd))
      .join(', ')

    throw new Error(`Sync release slice "${slice.id}" requires aligned package versions: ${packageList}`)
  }

  return versions[0]!
}

function createDefaultTagName (
  slice: DiscoveredSlice,
  version: string,
  cwd: string
) {
  if (slice.kind === 'sync') {
    return `v${version}`
  }

  if (slice.partition) {
    return `${slice.partition}@${version}`
  }

  const identity = packageIdentity(slice.packages[0]!, cwd)

  return `${identity}@${version}`
}

function hasDependencies (dependencies?: Dependencies): dependencies is Dependencies {
  return !!dependencies && Object.keys(dependencies).length > 0
}

function actualizeDependencies (
  dependencies: Dependencies,
  nextVersion: string,
  bumpedPackages: Set<string>,
  internalPolicy: 'preserve' | 'caret' | 'exact'
) {
  return Object.keys(dependencies).reduce((all, name) => ({
    ...all,
    [name]: bumpedPackages.has(name)
      ? updateDependencyRange(dependencies[name], nextVersion, internalPolicy)
      : dependencies[name],
  }), {} as Dependencies)
}

function updateDependencyRange (
  current: string,
  nextVersion: string,
  policy: 'preserve' | 'caret' | 'exact'
) {
  if (policy === 'caret') return '^' + nextVersion
  if (policy === 'exact') return nextVersion

  if (current.startsWith('workspace:')) {
    const value = current.slice('workspace:'.length)

    if (value === '*') return 'workspace:*'
    if (value.startsWith('^')) return `workspace:^${nextVersion}`
    if (value.startsWith('~')) return `workspace:~${nextVersion}`

    return `workspace:${nextVersion}`
  }

  if (current.startsWith('^')) return '^' + nextVersion
  if (current.startsWith('~')) return '~' + nextVersion

  return nextVersion
}
