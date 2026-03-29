import type {
  Reporter,
  Result,
  RunContext,
  Scope,
  Slice,
  SliceResult,
} from '../types/index'

export function createRunContext ({
  cwd,
  dry,
}: {
  cwd: string
  dry: boolean
}): RunContext {
  return { cwd, dry }
}

export async function reportStart (reporter: Reporter | undefined, context: RunContext) {
  await reporter?.onStart?.(context)
}

export async function reportScope (
  reporter: Reporter | undefined,
  scope: Scope,
  context: RunContext
) {
  await reporter?.onScope?.(scope, context)
}

export async function reportSliceStart (
  reporter: Reporter | undefined,
  slice: Slice,
  context: RunContext
) {
  await reporter?.onSliceStart?.(slice, context)
}

export async function reportSliceSuccess (
  reporter: Reporter | undefined,
  slice: SliceResult,
  context: RunContext
) {
  await reporter?.onSliceSuccess?.(slice, context)
}

export async function reportSuccess (
  reporter: Reporter | undefined,
  result: Result,
  context: RunContext
) {
  await reporter?.onSuccess?.(result, context)
}

export async function reportError (
  reporter: Reporter | undefined,
  error: unknown,
  context: RunContext
) {
  await reporter?.onError?.(error, context)
}
