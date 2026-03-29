import type {
  Reporter,
  Result,
  RunContext,
  Scope,
  ScopePackage,
  Slice,
  SliceResult,
} from '../../types/index'

import type { Output } from './output'

type Git = {
  revParse(revision: string, options?: { abbrevRef?: boolean; }): Promise<string>
}

type Verbosity = 'summary' | 'detailed'

type BaseReporterOptions = {
  output: Output
  git: Git
  showTags: boolean
}

export function createReporter ({
  output,
  git,
  showTags = false,
  verbosity = 'summary',
}: {
  output: Output;
  git: Git;
  showTags?: boolean;
  verbosity?: Verbosity;
}): Reporter {
  if (verbosity === 'detailed') {
    return new DetailedReporter({
      output,
      git,
      showTags,
    })
  }

  return new SummaryReporter({
    output,
    git,
    showTags,
  })
}

class SummaryReporter implements Reporter {
  protected readonly output: Output
  protected readonly git: Git
  protected readonly showTags: boolean
  protected scope: Scope | null = null
  protected position = new Map<string, number>()

  constructor ({
    output,
    git,
    showTags,
  }: BaseReporterOptions) {
    this.output = output
    this.git = git
    this.showTags = showTags
  }

  async onStart (context: RunContext) {
    this.output.info(
      context.dry
        ? 'Starting dry release'
        : 'Starting release'
    )
  }

  async onScope (scope: Scope, context?: RunContext) {
    void context
    this.scope = scope
    this.position = new Map(
      scope.slices.map((slice, index) => [slice.id, index + 1])
    )
  }

  async onSliceStart (slice: Slice) {
    this.output.info('Running slice %s', [this.describeProgress(slice)])
  }

  async onSuccess (result: Result) {
    if (!result.changed) {
      this.output.success('No changes since last release')
      return
    }

    const changed = result.slices.filter((slice) => slice.changed)
    const primary = changed[0]
    const packages = collectPackages(changed)

    this.output.success('Release slices: %s', [String(changed.length)])
    this.output.success('Updated packages: %s', [String(packages.length)])

    if (primary) {
      this.output.success('Next version: %s', [primary.nextVersion])
    }

    if (result.dry) {
      this.output.info('No committing or tagging since this was a dry run')
      return
    }

    this.output.success('Committed %s staged files', [String(result.files.length)])

    if (this.showTags) {
      const tags = collectTags(changed)

      if (tags.length) {
        this.output.success('Tags: %s', [tags.join(', ')])
      }
    }

    this.output.info('Run `%s` to publish', [
      `git push --follow-tags origin ${await this.resolveBranch()}`,
    ])
  }

  async onError (error: unknown) {
    const message = error instanceof Error
      ? error.message
      : String(error)

    this.output.error(message)
  }

  protected describeProgress (slice: Slice) {
    const position = this.position.get(slice.id)
    const total = this.scope?.slices.length
    const label = describeSlice(slice)

    return position && total
      ? `${position}/${total}: ${label}`
      : label
  }

  protected async resolveBranch () {
    try {
      return await this.git.revParse('HEAD', { abbrevRef: true })
    } catch {
      return '%branch%'
    }
  }
}

class DetailedReporter extends SummaryReporter {
  async onScope (scope: Scope, context: RunContext) {
    await super.onScope(scope, context)

    this.output.info('%s scope: %s packages, %s affected, %s slices', [
      scope.mode,
      String(scope.packages.length),
      String(scope.affected.length),
      String(scope.slices.length),
    ])
  }

  async onSliceSuccess (slice: SliceResult) {
    if (!slice.changed) {
      this.output.warn('Completed slice %s without version changes (%s)', [
        describeSlice(slice),
        slice.currentVersion,
      ])
      return
    }

    this.output.success('Completed slice %s: %s -> %s (%s)', [
      describeSlice(slice),
      slice.currentVersion,
      slice.nextVersion,
      slice.releaseType,
    ])

    if (this.showTags && slice.tag) {
      this.output.info('Tag: %s', [slice.tag])
    }
  }

  async onSuccess (result: Result) {
    await super.onSuccess(result)

    if (!result.changed) {
      return
    }

    const packages = collectPackages(result.slices.filter((slice) => slice.changed))

    this.output.info('Updated packages: %s', [describePackages(packages)])
  }
}

function describeSlice (slice: Slice | SliceResult) {
  if (slice.partition) {
    return `${slice.partition} [${describePackages(slice.packages)}]`
  }

  return describePackages(slice.packages)
}

function describePackages (packages: ScopePackage[]) {
  return packages
    .map((pkg) => pkg.name ?? pkg.path)
    .join(', ')
}

function collectTags (slices: SliceResult[]) {
  return slices
    .map((slice) => slice.tag)
    .filter((tag): tag is string => !!tag)
}

function collectPackages (slices: SliceResult[]) {
  const packages = [] as ScopePackage[]
  const seen = new Set<string>()

  for (const slice of slices) {
    for (const pkg of slice.packages) {
      const identity = pkg.name ?? pkg.path

      if (seen.has(identity)) {
        continue
      }

      seen.add(identity)
      packages.push(pkg)
    }
  }

  return packages
}
