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

import { execFileSync } from 'node:child_process'
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
  const affectedPaths = detectAffectedPackages(runtime.cwd, root, discovered)
  const affected = sortPackages(
    uniquePackages(
      discovered.filter((pkg) => affectedPaths.has(pkg.path))
    ),
    runtime.cwd
  )
  const mode = options.mode ?? DEFAULT_RELEASE_MODE
  const slices = createSlices({
    mode,
    packages: discovered,
    affected,
    cwd: runtime.cwd,
    fromTag: options.fromTag,
    tagPrefix: options.tagPrefix,
    partitions: options.partitions,
  })

  return {
    mode,
    packages: discovered,
    affected,
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
  packages,
  affected,
  cwd,
  fromTag,
  tagPrefix,
  partitions,
}: {
  mode: Mode
  packages: Package[]
  affected: Package[]
  cwd: string
  fromTag?: string
  tagPrefix?: string | RegExp
  partitions?: Record<string, Partition>
}): DiscoveredSlice[] {
  const touched = affected.length ? affected : packages

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

  if (mode === 'async') {
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

  return createHybridSlices({
    packages,
    touched,
    cwd,
    fromTag,
    tagPrefix,
    partitions,
  })
}

function createHybridSlices ({
  packages,
  touched,
  cwd,
  fromTag,
  tagPrefix,
  partitions,
}: {
  packages: Package[]
  touched: Package[]
  cwd: string
  fromTag?: string
  tagPrefix?: string | RegExp
  partitions?: Record<string, Partition>
}): DiscoveredSlice[] {
  const partitionEntries = Object.entries(partitions ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
  const partitioned = [] as DiscoveredSlice[]
  const touchedPaths = new Set(touched.map((pkg) => pkg.path))
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

    const scoped = matched.filter((pkg) => touchedPaths.has(pkg.path))

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

  const remainder = sortPackages(
    packages.filter((pkg) => !usedPaths.has(pkg.path) && touchedPaths.has(pkg.path)),
    cwd
  )
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

function detectAffectedPackages (
  cwd: string,
  root: Package,
  packages: Package[]
) {
  const touched = readWorkingTreePaths(cwd)

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
    const child = children.find((entry) => isPathInside(path, entry.relativePath))

    if (child) {
      affected.add(child.packagePath)
      continue
    }

    if (isPathInside(path, normalizedRoot)) {
      affected.add(root.path)
    }
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
  if (!pattern) {
    return false
  }

  if (pattern === '*') {
    return true
  }

  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '__DOUBLE_STAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__DOUBLE_STAR__/g, '.*')

  return new RegExp(`^${escaped}$`).test(input)
}

function readWorkingTreePaths (cwd: string) {
  try {
    const output = execFileSync('git', ['status', '--porcelain'], {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim()

    if (!output) {
      return [] as string[]
    }

    return output
      .split('\n')
      .flatMap((line) => {
        const payload = line.slice(3).trim()

        if (payload.includes(' -> ')) {
          const [from, to] = payload.split(' -> ')

          return [from, to].filter(Boolean)
        }

        return [payload].filter(Boolean)
      })
  } catch {
    return [] as string[]
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
