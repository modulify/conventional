import { GitCommander } from '@modulify/git-toolkit'
import { Runner } from '@modulify/git-toolkit/shell'

import { run } from './index'
import { parseArgv } from './cli/args'
import { createReporter } from './cli/reporter'
import {
  ConsoleOutput,
  Output,
} from './cli/output'

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
