import type {
  Options,
  RunOptions,
} from '../types/index'

import {
  existsSync,
  readFileSync,
} from 'node:fs'

import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { RELEASE_CONFIG_FILENAMES } from './constants'

type ScopeOptions = Omit<Options, 'changelogFile'>

/**
 * Resolves repository release configuration from `package.json`, `release.config.*`,
 * and inline overrides using the public precedence rules.
 */
export async function resolveConfig (
  cwd?: string,
  inline?: Options
): Promise<Options> {
  const root = cwd ?? process.cwd()
  const fromPackage = loadPackageJsonConfig(root)
  const fromFile = await loadFileConfig(root)

  return {
    ...fromPackage,
    ...fromFile,
    ...(inline ?? {}),
  }
}

/** Converts repository configuration to executor-ready release options. */
export function toScopeOptions (config: Options): ScopeOptions {
  const options = { ...config } as Options

  delete options.changelogFile

  return options as ScopeOptions
}

/** Extracts inline overrides from high-level run options. */
export function toInlineConfig (options: RunOptions): Options {
  const config = { ...options } as RunOptions

  delete config.cwd
  delete config.dry
  delete config.reporter

  return config
}

function loadPackageJsonConfig (cwd: string): Options {
  const file = join(cwd, 'package.json')

  if (!existsSync(file)) {
    return {}
  }

  const content = JSON.parse(readFileSync(file, 'utf-8')) as {
    release?: unknown
  }

  return isRecord(content.release)
    ? content.release as Options
    : {}
}

async function loadFileConfig (cwd: string): Promise<Options> {
  const configFile = RELEASE_CONFIG_FILENAMES
    .map((file) => join(cwd, file))
    .find((file) => existsSync(file))

  if (!configFile) {
    return {}
  }

  const module = await import(pathToFileURL(configFile).href)
  const config = (module.default ?? module) as unknown

  return isRecord(config)
    ? config as Options
    : {}
}

function isRecord (value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object'
}
