import type { ReleaseType } from 'semver'

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

export const DEFAULTS = {
  releaseAs: undefined as ReleaseType | undefined,
  prerelease: undefined as 'alpha' | 'beta' | 'rc' | undefined,
  dry: false,
  verbose: false,
  tags: false,
}

export interface CliOptions {
  releaseAs?: ReleaseType
  prerelease?: 'alpha' | 'beta' | 'rc'
  dry: boolean
  verbose: boolean
  tags: boolean
}

export async function parseArgv (argv: string[] = process.argv): Promise<CliOptions> {
  const parsed = await yargs(hideBin(argv))
    .usage('Usage: $0 [options]')
    .option('release-as', {
      alias: 'r',
      describe: 'Specify the release type (major|minor|patch)',
      requiresArg: true,
      string: true,
    })
    .option('prerelease', {
      alias: 'p',
      describe: 'Specify the prerelease type (alpha|beta|rc)',
      requiresArg: true,
      string: true,
    })
    .option('dry', {
      type: 'boolean',
      default: DEFAULTS.dry,
      describe: 'See the commands that running release would run',
    })
    .option('verbose', {
      type: 'boolean',
      default: DEFAULTS.verbose,
      describe: 'Show detailed per-slice progress output',
    })
    .option('tags', {
      type: 'boolean',
      default: DEFAULTS.tags,
      describe: 'Show generated tags in the final output',
    })
    .exitProcess(false)
    .check((options) => {
      if (!['alpha', 'beta', 'rc', undefined].includes(options.prerelease)) {
        throw new Error('prerelease should be one of alpha, beta, rc or undefined')
      }

      return true
    })
    .alias('version', 'v')
    .alias('help', 'h')
    .example('$0', 'Update changelog and tag release')
    .example('$0 --dry --verbose', 'Show a detailed dry-run release preview')
    .pkgConf('release')
    .wrap(97)
    .parseAsync()

  return {
    releaseAs: parsed.releaseAs as ReleaseType | undefined,
    prerelease: parsed.prerelease as 'alpha' | 'beta' | 'rc' | undefined,
    dry: parsed.dry,
    verbose: parsed.verbose,
    tags: parsed.tags,
  }
}
