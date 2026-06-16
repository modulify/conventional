import { GitCommander } from '@modulify/git-toolkit'
import { Runner } from '@modulify/git-toolkit/shell'

import {
  ConsoleOutput,
  Output,
} from './cli/output'

import { createReporter } from './cli/reporter'
import { run } from './index'
import { parseArgv } from './cli/args'

export type { CliOptions } from './cli/args'

export type {
  MessageOutput,
  OutputTheme,
} from './cli/output'

export type {
  ReporterGit,
  ReporterOptions,
  ReporterVerbosity,
} from './cli/reporter'

export { CliParseError } from './cli/args'

export {
  BufferedOutput,
  ConsoleOutput,
  Output,
} from './cli/output'

export {
  createReporter,
  parseArgv,
}

export { DEFAULTS } from './cli/args'

export async function main (argv: string[] = process.argv) {
  const cwd = process.cwd()
  const options = await parseArgv(argv)
  const output = new Output({
    dry: options.dry,
    output: new ConsoleOutput(),
  })
  const git = new GitCommander({ sh: new Runner(cwd) })

  await run({
    cwd,
    dry: options.dry,
    releaseAs: options.releaseAs,
    prerelease: options.prerelease,
    reporter: createReporter({
      output,
      git,
      showTags: options.tags,
      verbosity: options.verbose
        ? 'detailed'
        : 'summary',
    }),
  })
}
