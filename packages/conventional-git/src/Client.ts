import type { GitLogOptions } from '@modulify/git-toolkit/types/git'

import type { Changeset } from './paths'

import type {
  Commit,
  CommitRecord,
  CommitRevert,
} from '~types/commit'

import type { ParseOptions } from '~types/parse'

import type {
  TraverseResult,
  TraverseOptions,
} from '~types/traverse'

import { AsyncStream } from '@modulify/git-toolkit/stream'
import { GitClient } from '@modulify/git-toolkit'

import semver from 'semver'

import { createChangesetTraverser } from './paths'
import { createParser } from './parse'
import { parseChangesetPaths } from './range'
import { toRevision } from './range'
import { traverse } from './traverse'

const MATCH_UNSTABLE_VERSION = /\d+\.\d+\.\d+-.+/
const COMMIT_SEPARATOR = '------------------------ >8 ------------------------'
const PATHS_SEPARATOR = '------------------------ name-status ------------------------'

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
  /** Attach changeset metadata to commit.meta.changeset. */
  changeset?: boolean;
}

export interface CommitStreamParseOptions<
  TRevert extends CommitRecord = CommitRevert,
  TFields extends CommitRecord = CommitRecord,
  TMeta extends CommitRecord = CommitRecord,
> extends CommitStreamOptions {
  parse?: ParseOptions<TRevert, TFields, TMeta>;
}

export interface TagStreamOptions {
  /** Get semver tags with specific prefix. */
  prefix?: string | RegExp
  /** Skip semver tags with unstable versions. */
  skipUnstable?: boolean
  /** Clean version from prefix and trash. */
  clean?: boolean
}

export interface ChangesetOptions {
  fromTag?: string
  tagPrefix?: string | RegExp
  toRef?: string
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
  commits<
    TRevert extends CommitRecord = CommitRevert,
    TFields extends CommitRecord = CommitRecord,
    TMeta extends CommitRecord = CommitRecord,
  > (options: CommitStreamParseOptions<TRevert, TFields, TMeta> = {}) {
    const {
      changeset = false,
      ignore,
      parse = {},
      ...rest
    } = options
    const format = `%H%n${rest.format ?? '%B'}`

    if (!changeset) {
      return this._git.commits({
        ...rest,
        ignore,
        format,
        parser: createParser(parse),
      }) as AsyncStream<Commit<TRevert, TFields, TMeta>>
    }

    const parser = createParser(parse)
    const git = this.git

    return new AsyncStream(async function * () {
      const stdout = await git.cmd.exec('log', [
        ...createLogArgs({
          ...rest,
          // Mark the beginning of each entry so the trailing --name-status block
          // stays attached to the same commit chunk after splitting.
          format: `${COMMIT_SEPARATOR}%n${format}%n${PATHS_SEPARATOR}`,
        }),
        '--name-status',
        '--find-renames',
      ])
      const chunks = stdout.split(`${COMMIT_SEPARATOR}\n`).filter(Boolean)

      for (const raw of chunks) {
        if (!ignore || !ignore.test(raw)) {
          yield parseCommitWithChangeset(raw, parser) as Commit<TRevert, TFields, TMeta>
        }
      }
    }())
  }

  async traverse<
    TRevert extends CommitRecord = CommitRevert,
    TFields extends CommitRecord = CommitRecord,
    TMeta extends CommitRecord = CommitRecord,
  > (options: TraverseOptions<TRevert, TFields, TMeta>): Promise<TraverseResult> {
    return traverse({
      ...options,
      git: this,
    })
  }

  async changeset ({
    fromTag,
    tagPrefix,
    toRef = 'HEAD',
  }: ChangesetOptions = {}): Promise<Changeset | null> {
    try {
      const result = await this.traverse({
        fromTag,
        tagPrefix,
        toRef,
        changeset: true,
        traversers: [createChangesetTraverser()],
      })

      return result.results.get('changeset') as Changeset
    } catch {
      return null
    }
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

  async url(remote: string = 'origin') {
    try {
      return await this._git.cmd.exec('remote', ['get-url', remote])
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes(remote)) {
        return ''
      }

      throw e
    }
  }
}

function createLogArgs ({
  from = '',
  to = 'HEAD',
  since,
  order = [],
  color = true,
  decorate,
  format,
  reverse,
  merges,
  path,
}: GitLogOptions) {
  return [
    `--format=${format}`,
    ...since ? [`--since=${since instanceof Date ? since.toISOString() : since}`] : [],
    ...order.map((entry) => `--${entry}-order`),
    ...reverse ? ['--reverse'] : [],
    ...merges ? ['--merges'] : [],
    ...merges === false ? ['--no-merges'] : [],
    ...color ? [] : ['--no-color'],
    ...decorate ? [typeof decorate === 'string' ? `--decorate=${decorate}` : '--decorate'] : [],
    toRevision(from, to),
    ...path ? ['--', ...arraify(path)] : [],
  ]
}

function arraify<T> (value: T | T[]) {
  return Array.isArray(value)
    ? value
    : [value]
}

function parseCommitWithChangeset<
  TRevert extends CommitRecord = CommitRevert,
  TFields extends CommitRecord = CommitRecord,
  TMeta extends CommitRecord = CommitRecord,
> (
  raw: string,
  parser: ReturnType<typeof createParser<TRevert, TFields, TMeta>>
) {
  const [payload, paths = ''] = raw.split(`\n${PATHS_SEPARATOR}\n`)
  const commit = parser(payload) as Commit<TRevert, TFields, TMeta & { changeset?: Changeset; }>

  commit.meta.changeset = {
    paths: paths.trim()
      ? parseChangesetPaths(paths.trim())
      : [],
  }

  return commit
}
