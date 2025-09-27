import type { Commit } from '@modulify/conventional-git/types/commit'
import type { CommitMeta } from '@modulify/conventional-git/types/commit'
import type { ParseOptions } from '@modulify/conventional-git/types/parse'

import { Client } from '@modulify/conventional-git'

export type CommitType = {
  type: string
  section: string
  hidden?: boolean
}

export type ReleaseType = 'major' | 'minor' | 'patch'
export type ReleaseRecommendation = {
  type: ReleaseType
  reason: string
}

export const DEFAULT_COMMIT_TYPES = Object.freeze(([
  { type: 'feat', section: 'Features' },
  { type: 'feature', section: 'Features' },
  { type: 'fix', section: 'Bug Fixes' },
  { type: 'perf', section: 'Performance Improvements' },
  { type: 'revert', section: 'Reverts' },
  { type: 'docs', section: 'Documentation', hidden: true },
  { type: 'style', section: 'Styles', hidden: true },
  { type: 'chore', section: 'Miscellaneous Chores', hidden: true },
  { type: 'refactor', section: 'Code Refactoring', hidden: true },
  { type: 'test', section: 'Tests', hidden: true },
  { type: 'build', section: 'Build System', hidden: true },
  { type: 'ci', section: 'Continuous Integration', hidden: true },
] as CommitType[]).map(Object.freeze) as Readonly<CommitType>[])

const RELEASE_TYPES = [
  'major',
  'minor',
  'patch',
] as const

const reverts = (commit: Commit) => (revert: CommitMeta) => {
  return revert.header === commit.header
}

/** Advisor that analyzes git history and recommends the next semantic version. */
export class ReleaseAdvisor {
  private readonly git: Client
  private readonly parse: ParseOptions
  private readonly types: CommitType[]

  /**
   * Creates a new ReleaseAdvisor.
   * @param options - Initialization options.
   * @param options.cwd - Working directory for git commands.
   * @param options.git - Custom git client instance (mainly for testing).
   * @param options.parse - Parser options for conventional commits.
   * @param options.types - Commit types mapping to sections/visibility.
   */
  constructor ({ cwd, git, parse, types }: {
    cwd?: string;
    git?: Client;
    parse?: ParseOptions;
    types?: CommitType[];
  } = {}) {
    this.git = git ?? new Client({ cwd })
    this.parse = parse ?? {}
    this.types = types ?? DEFAULT_COMMIT_TYPES as CommitType[]
  }

  /**
   * Analyzes commits since the last tag and recommends the next release type.
   * @param options - Advisory options.
   * @param options.ignore - Predicate to skip specific commits from analysis.
   * @param options.ignoreReverted - When true, ignore commits that were reverted later. Defaults to true.
   * @param options.preMajor - If true, downgrade major to minor and minor to patch for pre-1.0.0 releases.
   * @param options.strict - If true, return null when there are no meaningful changes.
   * @returns Release recommendation or null when nothing should be released (only in strict mode).
   */
  async advise ({ ignore, ignoreReverted = true, preMajor = false, strict = false }: {
    ignore?: (commit: Commit) => boolean;
    ignoreReverted?: boolean;
    preMajor?: boolean;
    strict?: boolean;
  } = {}): Promise<ReleaseRecommendation | null> {
    const last = await this.git.tags().first()
    const commits = this.git.commits({
      ...last && { from: last },
      parse: this.parse,
    })

    const hidden = strict ? this.types.reduce((known, t) => {
      if (t.hidden) known.push(t.type)

      return known
    }, [] as string[]) : []

    const reverted: CommitMeta[] = []

    let level = 2
    let breaking = 0
    let features = 0
    let fixes = 0

    for await (const commit of commits) {
      if (ignoreReverted) {
        if (reverted.some(reverts(commit))) continue
        if (commit.revert) reverted.push(commit.revert)
      }

      if (ignore && ignore(commit)) continue

      if (commit.notes.length > 0) {
        breaking += commit.notes.length
        level = 0
      } else if (commit.type === 'feat' || commit.type === 'feature') {
        features += 1

        if (level === 2) {
          level = 1
        }
      } else if (strict && !hidden.includes(commit.type as string)) {
        fixes += 1
      }
    }

    if (preMajor && level < 2) {
      level++
    } else if (strict && level === 2 && !breaking && !features && !fixes) {
      return null
    }

    const type = RELEASE_TYPES[level]

    return {
      type,
      reason: breaking === 1
        ? `There is ${breaking} BREAKING CHANGE and ${features} features`
        : `There are ${breaking} BREAKING CHANGES and ${features} features`,
    }
  }
}
