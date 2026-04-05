import type {
  Mode,
  Options,
  Package,
  Partition,
  Range,
  Scope,
  ScopePackage,
  Slice,
  SliceMode,
  WorkspaceSelector,
} from '../types/index'

import type { Runtime } from './runtime'

import { createChangesetTraverser } from '@modulify/conventional-git'
import { read } from '@modulify/pkg'
import { relative } from 'node:path'
import { walk } from '@modulify/pkg'

import { DEFAULT_RELEASE_MODE } from './constants'

export type DiscoveredSlice = {
  id: string
  kind: Slice['kind']
  mode: SliceMode
  partition?: string
  packages: Package[]
  range: Range
}

export type DiscoveredScope = {
  mode: Mode
  packages: Package[]
  affected: Package[]
  slices: DiscoveredSlice[]
}

export function toScope (
  scope: DiscoveredScope,
  cwd: string
): Scope {
  return {
    mode: scope.mode,
    packages: scope.packages.map((pkg) => toScopePackage(pkg, cwd)),
    affected: scope.affected.map((pkg) => toScopePackage(pkg, cwd)),
    slices: scope.slices.map((slice) => toSlice(slice, cwd)),
  }
}

/** Discovers packages, affected scope, and ordered release slices without side effects. */
export async function discover (
  runtime: Runtime,
  options: Options
): Promise<DiscoveredScope> {
  const root = read(runtime.cwd)
  const packages = [] as Package[]

  await walk([root], async (pkg) => {
    packages.push(pkg)
  })

  const discovered = sortPackages(
    uniquePackages(
      applyWorkspaceFilters(packages, runtime.cwd, options.workspaces)
    ),
    runtime.cwd
  )
  const mode = options.mode ?? DEFAULT_RELEASE_MODE
  const affectedPaths = mode === 'hybrid'
    ? null
    : await detectAffectedPackages({
      cwd: runtime.cwd,
      root,
      packages: discovered,
      history: runtime.history,
      range: {
        fromTag: options.fromTag,
        tagPrefix: options.tagPrefix,
      },
    })
  const affected = affectedPaths
    ? sortPackages(
      uniquePackages(
        discovered.filter((pkg) => affectedPaths.has(pkg.path))
      ),
      runtime.cwd
    )
    : [] as Package[]
  const slices = mode === 'hybrid'
    ? await createHybridSlices({
      root,
      packages: discovered,
      cwd: runtime.cwd,
      history: runtime.history,
      fromTag: options.fromTag,
      tagPrefix: options.tagPrefix,
      partitions: options.partitions,
    })
    : createSlices({
      mode,
      affected,
      cwd: runtime.cwd,
      fromTag: options.fromTag,
      tagPrefix: options.tagPrefix,
    })
  const discoveredAffected = mode === 'hybrid'
    ? sortPackages(
      uniquePackages(
        slices.flatMap((slice) => slice.packages)
      ),
      runtime.cwd
    )
    : affected

  return {
    mode,
    packages: discovered,
    affected: discoveredAffected,
    slices,
  }
}

export function toScopePackage (pkg: Package, cwd: string): ScopePackage {
  return {
    name: pkg.manifest.name ?? pkg.name,
    version: pkg.manifest.version,
    path: toPublicPath(pkg, cwd),
  }
}

export function toSlice (slice: DiscoveredSlice, cwd: string): Slice {
  return {
    id: slice.id,
    kind: slice.kind,
    mode: slice.mode,
    partition: slice.partition,
    packages: slice.packages.map((pkg) => toScopePackage(pkg, cwd)),
    range: slice.range,
  }
}

export function uniquePackages (packages: Package[]) {
  const seen = new Set<string>()

  return packages.filter((pkg) => {
    if (seen.has(pkg.path)) {
      return false
    }

    seen.add(pkg.path)

    return true
  })
}

export function uniqueStrings (values: string[]) {
  return [...new Set(values)]
}

export function packageIdentity (pkg: Package, cwd: string) {
  const name = pkg.manifest.name ?? pkg.name

  if (name) {
    return name
  }

  const path = packagePath(pkg, cwd)

  return path === '' || path === '.'
    ? 'root'
    : path
}

function createSlices ({
  mode,
  affected,
  cwd,
  fromTag,
  tagPrefix,
}: {
  mode: SliceMode
  affected: Package[]
  cwd: string
  fromTag?: string
  tagPrefix?: string | RegExp
}): DiscoveredSlice[] {
  const touched = affected

  if (mode === 'sync') {
    return touched.length
      ? [{
        id: 'sync:default',
        kind: 'sync',
        mode: 'sync',
        packages: touched,
        range: {
          fromTag,
          tagPrefix,
        },
      }]
      : [] as DiscoveredSlice[]
  }

  return touched.map((pkg) => ({
    id: `async:${packageIdentity(pkg, cwd)}`,
    kind: 'async',
    mode: 'async',
    packages: [pkg],
    range: {
      fromTag,
      tagPrefix,
    },
  }))
}

async function createHybridSlices ({
  root,
  packages,
  cwd,
  history,
  fromTag,
  tagPrefix,
  partitions,
}: {
  root: Package
  packages: Package[]
  cwd: string
  history: Runtime['history']
  fromTag?: string
  tagPrefix?: string | RegExp
  partitions?: Record<string, Partition>
}): Promise<DiscoveredSlice[]> {
  const partitionEntries = Object.entries(partitions ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
  const partitioned = [] as DiscoveredSlice[]
  const usedPaths = new Set<string>()

  for (const [partition, definition] of partitionEntries) {
    const matched = sortPackages(
      packages.filter((pkg) => {
        if (usedPaths.has(pkg.path)) {
          return false
        }

        return definition.workspaces.some((selector) => matchesPackageSelector(pkg, cwd, selector))
      }),
      cwd
    )

    for (const pkg of matched) {
      usedPaths.add(pkg.path)
    }

    const affectedPaths = await detectAffectedPackages({
      cwd,
      root,
      packages: matched,
      history,
      range: resolvePartitionRange({ fromTag, tagPrefix, partition: definition }),
    })
    const scoped = matched.filter((pkg) => affectedPaths.has(pkg.path))

    if (!scoped.length) {
      continue
    }

    const resolvedRange = resolvePartitionRange({ fromTag, tagPrefix, partition: definition })

    if (definition.mode === 'sync') {
      partitioned.push({
        id: `partition:${partition}`,
        kind: 'partition',
        mode: 'sync',
        partition,
        packages: scoped,
        range: resolvedRange,
      })
      continue
    }

    partitioned.push(...scoped.map((pkg) => ({
      id: `partition:${partition}:${packageIdentity(pkg, cwd)}`,
      kind: 'partition',
      mode: 'async',
      partition,
      packages: [pkg],
      range: resolvedRange,
    } satisfies DiscoveredSlice)))
  }

  const fallbackCandidates = sortPackages(
    packages.filter((pkg) => !usedPaths.has(pkg.path)),
    cwd
  )
  const fallbackPaths = await detectAffectedPackages({
    cwd,
    root,
    packages: fallbackCandidates,
    history,
    range: {
      fromTag,
      tagPrefix,
    },
  })
  const remainder = fallbackCandidates.filter((pkg) => fallbackPaths.has(pkg.path))
  const fallback = remainder.map((pkg) => ({
    id: `hybrid:${packageIdentity(pkg, cwd)}`,
    kind: 'async' as const,
    mode: 'async' as const,
    packages: [pkg],
    range: {
      fromTag,
      tagPrefix,
    },
  } satisfies DiscoveredSlice))

  return [...partitioned, ...fallback]
}

function resolvePartitionRange ({
  fromTag,
  tagPrefix,
  partition,
}: {
  fromTag?: string
  tagPrefix?: string | RegExp
  partition: Partition
}): Range {
  return {
    fromTag: partition.fromTag ?? fromTag,
    tagPrefix: partition.tagPrefix ?? tagPrefix,
  }
}

async function detectAffectedPackages ({
  cwd,
  root,
  packages,
  history,
  range,
}: {
  cwd: string
  root: Package
  packages: Package[]
  history: Runtime['history']
  range: Range
}) {
  const touched = await readCommitRangePaths(history, range)

  if (touched === null) {
    return new Set(packages.map((pkg) => pkg.path))
  }

  if (!touched.length) {
    return new Set<string>()
  }

  const normalizedRoot = normalizePath(relative(cwd, root.path))
  const children = packages
    .filter((pkg) => pkg.path !== root.path)
    .map((pkg) => ({
      packagePath: pkg.path,
      relativePath: normalizePath(relative(cwd, pkg.path)),
    }))
    .sort((a, b) => b.relativePath.length - a.relativePath.length)

  const affected = new Set<string>()

  for (const path of touched.map(normalizePath)) {
    if (!isPathInside(path, normalizedRoot)) continue

    const child = children.find((entry) => isPathInside(path, entry.relativePath))

    affected.add(child?.packagePath ?? root.path)
  }

  return affected
}

function applyWorkspaceFilters (
  packages: Package[],
  cwd: string,
  selector?: WorkspaceSelector
) {
  if (!selector?.include?.length && !selector?.exclude?.length) {
    return packages
  }

  return packages.filter((pkg) => {
    const included = selector.include?.length
      ? selector.include.some((entry) => matchesPackageSelector(pkg, cwd, entry))
      : true

    if (!included) {
      return false
    }

    return !(selector.exclude?.some((entry) => matchesPackageSelector(pkg, cwd, entry)) ?? false)
  })
}

function sortPackages (packages: Package[], cwd: string) {
  return [...packages]
    .sort((a, b) => packagePath(a, cwd).localeCompare(packagePath(b, cwd)))
}

function packagePath (pkg: Package, cwd: string) {
  return normalizePath(relative(cwd, pkg.path))
}

function toPublicPath (pkg: Package, cwd: string) {
  return packagePath(pkg, cwd) || '.'
}

function matchesPackageSelector (
  pkg: Package,
  cwd: string,
  selector: string
) {
  const name = pkg.manifest.name ?? pkg.name ?? ''
  const path = packagePath(pkg, cwd)

  return matchesGlob(name, selector) || matchesGlob(path, selector)
}

function matchesGlob (input: string, pattern: string) {
  if (!pattern) return false
  if (pattern === '*') return true

  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '__DOUBLE_STAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__DOUBLE_STAR__/g, '.*')

  return new RegExp(`^${escaped}$`).test(input)
}

async function readCommitRangePaths (
  history: Runtime['history'],
  range: Range
) {
  try {
    const result = await history.traverse({
      fromTag: range.fromTag,
      tagPrefix: range.tagPrefix,
      changeset: true,
      traversers: [createChangesetTraverser()],
    })

    return (result.results.get('changeset') as { paths: string[]; }).paths
  } catch {
    return null
  }
}

function normalizePath (path: string) {
  return path.replace(/\\/g, '/')
}

function isPathInside (path: string, root: string) {
  return !root
    || root === '.'
    || root === path
    || path.startsWith(`${root}/`)
}
