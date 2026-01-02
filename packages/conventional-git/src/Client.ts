import type { GitLogOptions } from '@modulify/git-toolkit/types/git'
import type { ParseOptions } from '~types/parse'

import { AsyncStream } from '@modulify/git-toolkit/stream'
import { GitClient } from '@modulify/git-toolkit'

import semver from 'semver'

import { createParser } from '@/parse'

const MATCH_UNSTABLE_VERSION = /\d+\.\d+\.\d+-.+/

/**
 * Helper to get package tag prefix.
 * @param packageName
 * @returns Tag prefix.
 */
export function packagePrefix(packageName?: string) {
  return !packageName ? /^.+@/ : `${packageName}@`
}

export interface CommitStreamOptions extends GitLogOptions {
  /** Pattern to filter commits. */
  ignore?: RegExp;
  parse?: ParseOptions;
}

export interface TagStreamOptions {
  /** Get semver tags with specific prefix. */
  prefix?: string | RegExp
  /** Skip semver tags with unstable versions. */
  skipUnstable?: boolean
  /** Clean version from prefix and trash. */
  clean?: boolean
}

/** Wrapper around Git CLI with conventional commits support. */
export class Client {
  private readonly _git: GitClient

  /**
   * Creates a new git Client wrapper.
   * @param options - Initialization options.
   * @param options.cwd - Working directory for the underlying git client.
   * @param options.git - Custom GitClient instance (mainly for testing).
   */
  constructor ({ cwd, git }: {
    cwd?: string;
    git?: GitClient;
  } = {}) {
    this._git = git ?? new GitClient({ cwd })
  }

  /** Access to the underlying low-level Git client. */
  get git () {
    return this._git
  }

  /**
   * Get parsed commits stream.
   * @yields Parsed commits data.
   */
  commits (options: CommitStreamOptions = {}) {
    return this._git.commits({
      ...options,
      parser: createParser(options.parse ?? {}),
    })
  }

  /**
   * Get semver tags stream.
   * @param options
   * @param options.prefix - Get semver tags with specific prefix.
   * @param options.skipUnstable - Skip semver tags with unstable versions.
   * @param options.clean - Clean a version from prefix and trash.
   * @yields Semver tags.
   */
  tags (options: TagStreamOptions = {}) {
    const {
      prefix,
      skipUnstable,
      clean,
    } = options

    const cleanTag = clean
      ? (tag: string, version?: string) => semver.clean(version || tag)
      : (tag: string) => tag

    const tags = this.git.tags()

    return new AsyncStream<string>((async function* () {
      for await (const t of tags) {
        if (skipUnstable && MATCH_UNSTABLE_VERSION.test(t)) {
          continue
        }

        if (prefix && (typeof prefix === 'string' ? t.startsWith(prefix) : prefix.test(t))) {
          const version = t.replace(prefix, '')

          if (semver.valid(version)) {
            const _tag = cleanTag(t, version)
            if (_tag) {
              yield _tag
            }
          }
        } else if (semver.valid(t)) {
          const _tag = cleanTag(t)
          if (_tag) {
            yield _tag
          }
        }
      }
    })())
  }

  /**
   * Gets the current semantic version from git tags.
   * @param params - Additional git params.
   * @returns Current semantic version, `null` if not found.
   */
  async version (params: TagStreamOptions = {}) {
    const stream = this.tags({ clean: true, ...params })
    const tags: string[] = []

    for await (const tag of stream) {
      tags.push(tag)
    }

    if (!tags.length) {
      return null
    }

    return tags.sort(semver.rcompare)[0]
  }
}
