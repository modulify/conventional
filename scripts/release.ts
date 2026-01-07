import type {
  Dependencies,
  Manifest,
} from '@modulify/pkg/types/manifest'

import { GitCommander } from '@modulify/git-toolkit'

import Output from './lib/Output'
import { Runner } from '@modulify/git-toolkit/shell'
import VersionGenerator from './lib/VersionGenerator'

import chalk from 'chalk'

import { createWrite } from '@modulify/conventional-changelog'
import { relative } from 'node:path'

import {
  read,
  update,
  walk,
} from '@modulify/pkg'

import args from './args/release'
import figures from 'figures'

import { DEFAULTS } from './args/release'

try {
  const cwd = process.cwd()
  const options = { ...DEFAULTS, ...args.argv } as typeof DEFAULTS

  const sh = new Runner(cwd)
  const git = new GitCommander({ sh })
  const out = new Output(options)
  const log = createWrite({
    cwd,
    file: options.dry ? relative(cwd, 'CHANGELOG.md') : undefined,
  })

  const generator = new VersionGenerator({
    releaseAs: options.releaseAs,
    prerelease: options.prerelease,
  })

  const root = read(cwd)

  const nextRelease = await generator.next(root.manifest.version ?? '0.0.0')
  const nextVersion = nextRelease.version

  if (nextVersion === null) {
    out.error('Unable to calculate next version')
    process.exit(1)
  }

  if (nextVersion === root.manifest.version) {
    out.info('No changes since last release')
    process.exit(0)
  }

  out.info('Root package: ' + chalk.magenta(root.name))
  out.info('Next version: ' + chalk.cyan(nextVersion))

  const keysOf = <T extends object>(o: T) => Object.keys(o) as (keyof T)[]
  const empty = <T extends object>(o: T | undefined): o is T => !o || keysOf(o).length === 0
  const actualize = (dependencies: Dependencies) => keysOf(dependencies).reduce((all, name) => ({
    ...all,
    [name]: String(name).startsWith('@modulify/conventional-') ? '^' + nextVersion : dependencies[name],
  }), {} as Dependencies)

  const files = [] as string[]

  await walk([root], async (pkg) => {
    const diff = { version: nextVersion } as Partial<Manifest>
    const manifest = pkg.manifest

    if (!empty(manifest.peerDependencies)) diff.peerDependencies = actualize(manifest.peerDependencies!)
    if (!empty(manifest.dependencies)) diff.dependencies = actualize(manifest.dependencies!)
    if (!empty(manifest.optionalDependencies)) diff.optionalDependencies = actualize(manifest.optionalDependencies!)
    if (!empty(manifest.devDependencies)) diff.devDependencies = actualize(manifest.devDependencies!)

    files.push(relative(cwd, update(pkg.path, diff, options.dry)))
  })

  await sh.exec('yarn', ['install', '--no-immutable'])

  files.push(relative(cwd, 'yarn.lock'))

  await log(nextVersion)

  files.push(relative(cwd, 'CHANGELOG.md'))

  if (options.dry) {
    out.info('No commiting & tagging since it was a dry run')
  } else {
    out.info(`Committing ${files.length} staged files`)

    const tag = `v${nextVersion}`

    await git.add(files)
    await git.commit({ files, message: `chore(release): ${tag}` })

    out.info('Tagging release %s', [tag])

    await git.tag({ name: tag, message: `chore(release): ${tag}` })

    const brunch = await git.revParse('HEAD', { abbrevRef: true })

    out.info('Run `%s` to publish', [
      'git push --follow-tags origin ' + String(brunch ?? '%branch%').trim(),
    ], chalk.blue(figures.info))
  }
} catch (error) {
  console.error(error)
  process.exit(1)
}
