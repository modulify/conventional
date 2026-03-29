export type {
  Manifest,
  Mode,
  Options,
  Package,
  Partition,
  Range,
  Reporter,
  Result,
  RunContext,
  RunOptions,
  Scope,
  ScopePackage,
  Slice,
  SliceKind,
  SliceMode,
  SliceResult,
  TagContext,
  WorkspaceSelector,
} from '../types/index'

import type {
  Scope,
  Result,
  RunOptions,
} from '../types/index'

import {
  createRunContext,
  reportError,
  reportScope,
  reportStart,
  reportSuccess,
} from './reporter'

import {
  resolveConfig,
  toInlineConfig,
  toScopeOptions,
} from './config'

import { createRuntime } from './runtime'
import { discover, toScope } from './plan'
import { runScope } from './execute'

import { DEFAULT_CHANGELOG_FILE } from './constants'

export {
  resolveConfig,
}

/** Resolves config, creates a runtime, and executes the release in one high-level call. */
export async function run (options: RunOptions = {}): Promise<Result> {
  const inline = toInlineConfig(options)
  const cwd = options.cwd ?? process.cwd()
  const context = createRunContext({
    cwd,
    dry: options.dry ?? false,
  })

  try {
    await reportStart(options.reporter, context)

    const config = await resolveConfig(cwd, inline)
    const scopeOptions = toScopeOptions(config)
    const runtime = createRuntime({
      cwd,
      dry: context.dry,
      changelogFile: config.changelogFile ?? DEFAULT_CHANGELOG_FILE,
    })
    const scope = await discover(runtime, scopeOptions)
    const publicScope = toScope(scope, runtime.cwd)

    await reportScope(options.reporter, publicScope, context)

    const result = await runScope(runtime, scope, scopeOptions, options.reporter
      ? {
        reporter: options.reporter,
        context,
      }
      : undefined)

    await reportSuccess(options.reporter, result, context)

    return result
  } catch (error) {
    await reportError(options.reporter, error, context)

    throw error
  }
}

/** Resolves config, creates a runtime, and returns a deterministic release scope. */
export async function createScope (options: RunOptions = {}): Promise<Scope> {
  const inline = toInlineConfig(options)
  const cwd = options.cwd ?? process.cwd()
  const config = await resolveConfig(cwd, inline)
  const scopeOptions = toScopeOptions(config)
  const runtime = createRuntime({
    cwd,
    dry: options.dry ?? true,
    changelogFile: config.changelogFile ?? DEFAULT_CHANGELOG_FILE,
  })
  const scope = await discover(runtime, scopeOptions)

  return toScope(scope, runtime.cwd)
}
