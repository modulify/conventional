import type { Commit } from '@modulify/conventional-git/types/commit'
import type { ParseOptions } from '@modulify/conventional-git/types/parse'
import type { ReleaseType as SemverReleaseType } from 'semver'

import { Client } from '@modulify/conventional-git'

import semver from 'semver'

import {
  createRecommendationAnalyzer,
  resolveNextVersion,
} from './recommendation'

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
export type AdvisoryRangeOptions = {
  fromTag?: string
  tagPrefix?: string | RegExp
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

export {
  createRecommendationAnalyzer,
  resolveNextVersion,
}

/** Advisor that analyzes git history and recommends the next semantic version. */
export class ReleaseAdvisor {
  private readonly git: Pick<Client, 'traverse'>
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
    git?: Pick<Client, 'traverse'>;
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
   * @param options.fromTag - Explicit tag to use as lower commit boundary.
   * @param options.tagPrefix - Tag prefix or pattern to discover boundary within a specific tag line.
   * @returns Release recommendation or null when nothing should be released (only in strict mode).
   */
  async advise ({ ignore, ignoreReverted = true, preMajor = false, strict = false, fromTag, tagPrefix }: AdvisoryRangeOptions & {
    ignore?: (commit: Commit) => boolean;
    ignoreReverted?: boolean;
    preMajor?: boolean;
    strict?: boolean;
  } = {}): Promise<ReleaseRecommendation | null> {
    const result = await this.git.traverse({
      parse: this.parse,
      fromTag,
      tagPrefix,
      traversers: [createRecommendationAnalyzer({
        types: this.types,
        ignore,
        ignoreReverted,
        strict,
      })],
    })
    const recommendation = result.results.get('recommendation') as ReleaseRecommendation | null | undefined

    if (!recommendation) {
      return null
    }

    return preMajor && recommendation.type !== 'patch'
      ? {
        ...recommendation,
        type: recommendation.type === 'major'
          ? 'minor'
          : 'patch',
      }
      : recommendation
  }

  async next (version: string, options: AdvisoryRangeOptions & {
    type?: SemverReleaseType,
    prerelease?: 'alpha' | 'beta' | 'rc',
    ignore?: (commit: Commit) => boolean;
    ignoreReverted?: boolean;
    preMajor?: boolean;
    strict?: boolean;
    loose?: boolean;
  } = {}) {
    if (options.type) {
      return resolveNextVersion(version, {
        type: options.type,
        prerelease: options.prerelease,
        loose: options.loose,
      })
    }

    const recommendation = await this.advise({
      ignore: options.ignore,
      ignoreReverted: options.ignoreReverted,
      preMajor: options.preMajor ?? (semver.valid(version, options.loose) ? semver.lt(version, '1.0.0', options.loose) : false),
      strict: options.strict,
      fromTag: options.fromTag,
      tagPrefix: options.tagPrefix,
    })

    return resolveNextVersion(version, {
      type: options.type,
      prerelease: options.prerelease,
      loose: options.loose,
      recommendation,
    })
  }
}
