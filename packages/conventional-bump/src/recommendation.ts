import type { Traverser } from '@modulify/conventional-git/types/traverse'
import type { Commit } from '@modulify/conventional-git/types/commit'
import type { ReleaseType as SemverReleaseType } from 'semver'

import semver from 'semver'

import type {
  CommitType,
  ReleaseRecommendation,
  ReleaseType,
} from './index'

const RELEASE_TYPES = [
  'major',
  'minor',
  'patch',
] as const

export interface RecommendationAnalyzerOptions {
  types?: ReadonlyArray<CommitType>;
  ignore?: (commit: Commit) => boolean;
  ignoreReverted?: boolean;
  strict?: boolean;
}

export interface ResolveNextVersionOptions {
  recommendation?: ReleaseRecommendation | null;
  type?: SemverReleaseType;
  prerelease?: 'alpha' | 'beta' | 'rc';
  preMajor?: boolean;
  loose?: boolean;
}

export function createRecommendationAnalyzer ({
  types = [],
  ignore,
  ignoreReverted = true,
  strict = false,
}: RecommendationAnalyzerOptions = {}): Traverser<ReleaseRecommendation | null> {
  const hidden = strict
    ? types.reduce((known, entry) => {
      if (entry.hidden) {
        known.push(entry.type)
      }

      return known
    }, [] as string[])
    : [] as string[]

  const reverted = [] as Array<NonNullable<Commit['revert']>>

  let level = 2
  let breaking = 0
  let features = 0
  let fixes = 0

  return {
    name: 'recommendation',
    onCommit (commit) {
      if (ignoreReverted) {
        if (reverted.some(reverts(commit))) return
        if (commit.revert) reverted.push(commit.revert)
      }

      if (ignore?.(commit)) return

      if (commit.notes.length > 0) {
        for (let index = 0; index < commit.notes.length; index += 1) {
          breaking += 1
          level = 0
        }

        return
      }

      if (commit.type === 'feat' || commit.type === 'feature') {
        features += 1

        if (level === 2) {
          level = 1
        }

        return
      }

      if (strict && !hidden.includes(commit.type as string)) {
        fixes += 1
      }
    },
    onComplete () {
      if (strict && level === 2 && !breaking && !features && !fixes) {
        return null
      }

      const type = RELEASE_TYPES[level]

      return {
        type,
        reason: breaking === 1
          ? `There is ${breaking} BREAKING CHANGE and ${features} features`
          : `There are ${breaking} BREAKING CHANGES and ${features} features`,
      } satisfies ReleaseRecommendation
    },
  }
}

export function resolveNextVersion (
  version: string,
  {
    recommendation,
    type,
    prerelease,
    preMajor = false,
    loose,
  }: ResolveNextVersionOptions = {}
) {
  const effectiveRecommendation = type
    ? { type, reason: '' }
    : recommendation
  const adjustedRecommendation = effectiveRecommendation && preMajor && isReleaseType(effectiveRecommendation.type)
    ? {
      ...effectiveRecommendation,
      type: RELEASE_TYPES[RELEASE_TYPES.indexOf(effectiveRecommendation.type) + 1] ?? effectiveRecommendation.type,
    }
    : effectiveRecommendation
  const resolvedType = isKnown(adjustedRecommendation?.type)
    ? isStable(adjustedRecommendation.type) && prerelease
      ? Array.isArray(semver.prerelease(version, {})) && isPrerelease(typeOf(version), adjustedRecommendation.type)
        ? 'prerelease'
        : ('pre' + adjustedRecommendation.type) as SemverReleaseType
      : adjustedRecommendation.type
    : adjustedRecommendation?.type ?? 'unknown'

  return {
    type: resolvedType,
    version: isKnown(resolvedType) && semver.valid(version, loose)
      ? semver.inc(version, resolvedType, loose, prerelease, '1') as string
      : version,
  }
}

function isKnown (type: unknown): type is SemverReleaseType {
  return semver.RELEASE_TYPES.includes(type as SemverReleaseType)
}

function isStable (type: SemverReleaseType): type is ReleaseType {
  return !type.startsWith('pre')
}

function isReleaseType (type: unknown): type is ReleaseType {
  return type === 'major' || type === 'minor' || type === 'patch'
}

function isPrerelease (current: ReleaseType, next: ReleaseType) {
  return current === next || priorityOf(current) > priorityOf(next)
}

function reverts (commit: Commit) {
  return (revert: NonNullable<Commit['revert']>) => {
    if (commit.hash && revert.hash) {
      return commit.hash.startsWith(revert.hash) || revert.hash.startsWith(commit.hash)
    }

    return revert.header === commit.header
  }
}

function typeOf (version: string): ReleaseType {
  switch (true) {
    case semver.major(version) > 0: return 'major'
    case semver.minor(version) > 0: return 'minor'
    case semver.patch(version) > 0: return 'patch'
  }

  return 'patch'
}

function priorityOf (type: ReleaseType) {
  return {
    major: 2,
    minor: 1,
    patch: 0,
  }[type]
}
