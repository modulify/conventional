import type { Manifest } from '@modulify/pkg/types/manifest'

export type { Manifest }

/** Package node discovered in the release scope. */
export type Package = {
  /** Package name from `package.json` when available. */
  name?: string
  /** Absolute filesystem path to the package root. */
  path: string
  /** Parsed package manifest. */
  manifest: Manifest
  /** Nested workspace packages discovered under this package. */
  children: Package[]
}

/** Release coordination strategy for the selected repository scope. */
export type Mode = 'sync' | 'async' | 'hybrid'
/** Execution mode for a single slice. */
export type SliceMode = 'sync' | 'async'
/** Semantic kind of slice in the public scope/result model. */
export type SliceKind = 'sync' | 'async' | 'partition'

/** Git advisory range used to calculate the next version for a step. */
export interface Range {
  /** Explicit lower tag bound for commit analysis. */
  fromTag?: string
  /** Prefix or pattern used to match release tags. */
  tagPrefix?: string | RegExp
}

/** Workspace selection filters applied during package discovery. */
export type WorkspaceSelector = {
  /** Workspace names or paths to include. */
  include?: string[]
  /** Workspace names or paths to exclude after inclusion. */
  exclude?: string[]
}

/** Named workspace partition participating in hybrid scope discovery. */
export type Partition = Range & {
  /** Execution mode for workspaces matched by this partition. */
  mode: SliceMode
  /** Workspace selectors belonging to the partition. */
  workspaces: string[]
}

/** Public package descriptor returned from scopes and results. */
export type ScopePackage = {
  /** Package name from `package.json` when available. */
  name?: string
  /** The current package version when available. */
  version?: string
  /** Package path relative to the release root. */
  path: string
}

/** Single slice in a computed scope. */
export interface Slice {
  /** Stable identifier for the slice. */
  id: string
  /** High-level semantic kind of the slice. */
  kind: SliceKind
  /** Execution mode used for the slice. */
  mode: SliceMode
  /** Partition name for hybrid partition slices. */
  partition?: string
  /** Packages participating in the slice. */
  packages: ScopePackage[]
  /** Git advisory range used for version calculation. */
  range: Range
}

/** Deterministic release scope produced before side effects are applied. */
export interface Scope {
  /** Global release mode used for discovery. */
  mode: Mode
  /** All packages in the resolved release scope. */
  packages: ScopePackage[]
  /** Packages affected by the current working tree state. */
  affected: ScopePackage[]
  /** Ordered release slices to execute. */
  slices: Slice[]
}

/** Result of applying a single release slice. */
export interface SliceResult extends Slice {
  /** Version used as the starting point for the slice. */
  currentVersion: string
  /** Version produced for the slice. */
  nextVersion: string
  /** Semantic release type reported by the advisor. */
  releaseType: string
  /** Whether the slice produced a version change. */
  changed: boolean
  /** Whether the slice ran in dry-run mode. */
  dry: boolean
  /** Files touched or planned for the slice. */
  files: string[]
  /** Tag created or planned for the slice. */
  tag?: string
  /** Commit message created or planned for the slice. */
  commitMessage?: string
  /** Annotated tag message created or planned for the slice. */
  tagMessage?: string
}

/** Aggregated result of executing all release slices. */
export interface Result {
  /** Global release mode used for execution. */
  mode: Mode
  /** Whether at least one slice produced a version change. */
  changed: boolean
  /** Whether the release ran in dry-run mode. */
  dry: boolean
  /** All packages in the resolved release scope. */
  packages: ScopePackage[]
  /** Packages affected by the current working tree state. */
  affected: ScopePackage[]
  /** Per-slice execution results. */
  slices: SliceResult[]
  /** Union of files touched across all changed slices. */
  files: string[]
}
