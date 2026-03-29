import type { ReleaseType as SemverReleaseType } from 'semver'

import type {
  Partition,
  Mode,
  Result,
  Scope,
  ScopePackage,
  Range,
  Slice,
  SliceKind,
  SliceMode,
  SliceResult,
  WorkspaceSelector,
} from './domain'

/** Context object passed to tag and message formatters. */
export interface TagContext {
  /** Stable identifier of the current release slice. */
  id: string
  /** Semantic kind of the current slice. */
  kind: SliceKind
  /** Execution mode of the current slice. */
  mode: SliceMode
  /** Partition name for hybrid partition slices. */
  partition?: string
  /** Packages participating in the current slice. */
  packages: ScopePackage[]
  /** Semantic release type produced by the advisor. */
  releaseType: string
  /** Version produced for the current slice. */
  version: string
}

/** Invocation context passed to reporter hooks. */
export interface RunContext {
  /** Working directory used as the release root. */
  cwd: string
  /** Whether side effects are skipped. */
  dry: boolean
}

/** Lifecycle reporter used during `run(...)` execution. */
export interface Reporter {
  /** Called before config resolution and scope discovery begin. */
  onStart?(context: RunContext): void | Promise<void>
  /** Called after the public scope has been resolved. */
  onScope?(scope: Scope, context: RunContext): void | Promise<void>
  /** Called before a slice starts execution. */
  onSliceStart?(slice: Slice, context: RunContext): void | Promise<void>
  /** Called after a slice has completed execution. */
  onSliceSuccess?(slice: SliceResult, context: RunContext): void | Promise<void>
  /** Called after the full release has completed successfully. */
  onSuccess?(result: Result, context: RunContext): void | Promise<void>
  /** Called when `run(...)` exits with an error. */
  onError?(error: unknown, context: RunContext): void | Promise<void>
}

/** High-level options accepted by the release planner and executor. */
export interface Options extends Range {
  /** Global release strategy for the selected repository scope. */
  mode?: Mode
  /** Explicit semantic release type override. */
  releaseAs?: SemverReleaseType
  /** Prerelease channel used when generating prerelease versions. */
  prerelease?: 'alpha' | 'beta' | 'rc'
  /** Whether dependency installation should run after manifest updates, or extra arguments appended after the installation subcommand. */
  install?: boolean | string[]
  /** Workspace discovery filters. */
  workspaces?: WorkspaceSelector
  /** Named hybrid partitions for mixed sync/async discovery. */
  partitions?: Record<string, Partition>
  /** Range style applied to bumped internal dependencies. */
  dependencyPolicy?: 'preserve' | 'caret' | 'exact'
  /** Custom tag name formatter. */
  tagName?: (context: TagContext) => string
  /** Custom annotated tag message formatter. */
  tagMessage?: (context: TagContext & { tag: string; }) => string
  /** Custom commit message formatter. */
  commitMessage?: (context: TagContext & { tag: string; }) => string
  /** Changelog file path relative to the repository root. */
  changelogFile?: string
}

/** High-level options accepted by the public planning and execution APIs. */
export interface RunOptions extends Options {
  /** Working directory used as the release root. */
  cwd?: string
  /** Whether side effects should be skipped. */
  dry?: boolean
  /** Optional lifecycle reporter for run-time progress and summaries. */
  reporter?: Reporter
}
