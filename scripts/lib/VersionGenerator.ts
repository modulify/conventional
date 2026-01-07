import type { ReleaseType } from 'semver'

import { ReleaseAdvisor } from '@modulify/conventional-bump'

import semver from 'semver'

type StableReleaseType = 'major' | 'minor' | 'patch'

const stableTypeOf = (version: string): StableReleaseType => {
  switch (true) {
    case semver.major(version) > 0:
      return 'major'
    case semver.minor(version) > 0:
      return 'minor'
    case semver.patch(version) > 0:
      return 'patch'
  }

  return 'patch'
}

const priorityOf = (type: ReleaseType | undefined) => type
  ? {
    major: 2,
    minor: 1,
    patch: 0,
    premajor: -1,
    preminor: -1,
    prepatch: -1,
    prerelease: -1,
  }[type] ?? -1
  : -1

const isKnown = (type: unknown): type is ReleaseType => semver.RELEASE_TYPES.includes(type as ReleaseType)
const isStable = (type: ReleaseType): type is StableReleaseType => !type.startsWith('pre')

const normalize = (
  prerelease: 'alpha' | 'beta' | 'rc' | undefined,
  expectedReleaseType: ReleaseType,
  currentVersion: string
): ReleaseType => {
  if (typeof prerelease === 'string' && isStable(expectedReleaseType)) {
    if (Array.isArray(semver.prerelease(currentVersion, {}))) {
      const currentReleaseType = stableTypeOf(currentVersion)
      if (currentReleaseType === expectedReleaseType ||
        priorityOf(currentReleaseType) > priorityOf(expectedReleaseType)
      ) {
        return 'prerelease'
      }
    }

    return ('pre' + expectedReleaseType) as ReleaseType
  }

  return expectedReleaseType
}

export default class VersionGenerator {
  private readonly releaseAs: ReleaseType | undefined
  private readonly prerelease: 'alpha' | 'beta' | 'rc' | undefined
  private readonly advisor: ReleaseAdvisor

  constructor (options: {
    path?: string;
    prerelease?: 'alpha' | 'beta' | 'rc';
    releaseAs?: ReleaseType;
  }) {
    this.releaseAs = options.releaseAs
    this.prerelease = options.prerelease
    this.advisor = new ReleaseAdvisor({ cwd: options.path })
  }

  async next (version: string) {
    const recommendation = this.releaseAs ? {
      type: this.releaseAs,
      reason: '',
    } : await this.advisor.advise({
      preMajor: semver.lt(version, '1.0.0', false),
    })

    const type = isKnown(recommendation?.type)
      ? normalize(this.prerelease, recommendation?.type, version)
      : recommendation?.type ?? 'unknown'

    return {
      type,
      version: isKnown(type) && semver.valid(version, undefined)
        ? semver.inc(version, type, this.prerelease, '1')
        : version,
    }
  }
}
