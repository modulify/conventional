import type { Commit } from '@modulify/conventional-git/types/commit'
import type { CommitType } from '@modulify/conventional-bump'
import type { RenderContext as _RenderContext } from './render'
import type { RenderFunction } from './render'

import { Client } from '@modulify/conventional-git'
import { Writable } from 'node:stream'

import { createRender } from './render'
import { createFileWritable } from './output'

import { DEFAULT_COMMIT_TYPES } from '@modulify/conventional-bump'

export interface RenderContext extends Omit<_RenderContext, 'sections' | 'highlights'> {
  [key: string]: unknown;
}

export interface ChangelogOptions {
  /** Working directory. */
  cwd?: string;
  /** Git client instance. */
  git?: Client;
  /** Custom commit types configuration. */
  types?: CommitType[];
  /** Static header for the changelog file. */
  header?: string;
  /** Changelog context. */
  context?: RenderContext;
  /** Custom render function. */
  render?: RenderFunction;
  /** Output file path. */
  file?: string;
  /** Output stream. */
  output?: Writable;
}

const reverts = (commit: Commit) => (revert: NonNullable<Commit['revert']>) => {
  if (commit.hash && revert.hash) {
    return commit.hash.startsWith(revert.hash) || revert.hash.startsWith(commit.hash)
  }

  return revert.header === commit.header
}

const MATCH_REPOSITORY_URL = /^(?:https?:\/\/|git@)([^:/]+)[:/]([^/]+)\/([^/.]+)(?:\.git)?$/

/**
 * Creates a write function.
 * @param options - Changelog writer options.
 * @param options.types - Custom commit types configuration to group sections.
 * @param options.cwd - Working directory for git commands.
 * @param options.git - Custom git client instance (mainly for testing).
 * @param options.render - Custom render function.
 * @param options.context - Additional context for the template.
 * @param options.file - Optional file path to write the changelog to.
 * @param options.output - Optional output stream to write the changelog to.
 */
export const createWrite = (options: ChangelogOptions = {}) => {
  const git = options.git ?? new Client({ cwd: options.cwd })
  const types = options.types ?? DEFAULT_COMMIT_TYPES
  const header = options.header ?? '# Changelog'
  const output = options.output ?? (options.file ? createFileWritable(options.file, header) : undefined)
  const render = options.render ?? createRender()

  return async (version: string = '0.0.0') => {
    const context = urlToContext(await git.url())
    const commits = git.commits()
    const sections = new Map<string, Commit[]>()
    const highlights = new Map<string, { commit: Commit; text: string }[]>()

    for (const t of types) {
      if (!t.hidden && !sections.has(t.section)) {
        sections.set(t.section, [])
      }
    }

    const reverted: Array<NonNullable<Commit['revert']>> = []

    for await (const commit of commits) {
      if (reverted.some(reverts(commit))) continue
      if (commit.revert) reverted.push(commit.revert)

      if (commit.notes && commit.notes.length > 0) {
        for (const note of commit.notes) {
          const group = highlights.get(note.title)
          if (group) {
            group.push({ commit, text: note.text })
          } else {
            highlights.set(note.title, [{ commit, text: note.text }])
          }
        }
      }

      const type = types.find(t => t.type === commit.type)
      if (type && sections.has(type.section)) {
        sections.get(type.section)?.push(commit)
      }
    }

    const changes = render({
      version,
      ...context,
      ...options.context,
      highlights: Array.from(highlights.entries())
        .filter(([, notes]) => notes.length > 0)
        .map(([title, notes]) => ({
          title,
          notes,
        })),
      sections: Array.from(sections.entries())
        .filter(([, commits]) => commits.length > 0)
        .map(([title, commits]) => ({
          title,
          commits: [...commits].reverse(),
        })),
    })

    if (output) {
      await new Promise<void>((resolve, reject) => {
        let finished = false

        const fulfill = (e?: unknown) => e ? reject(e) : resolve()
        const done = (e?: unknown) => {
          if (finished) return
          finished = true
          output.off('error', done)
          fulfill(e)
        }

        output.on('error', done)
        output.write(changes, (e) => {
          if (e) return done(e)
          if (options.file && !options.output) {
            output.end(done)
          } else {
            done()
          }
        })
      })
    }

    return changes
  }
}

function urlToContext (url: string) {
  const [matches, host, owner, repository] = MATCH_REPOSITORY_URL.exec(url) ?? []

  return matches ? {
    host: host?.includes('github.com') ? 'https://github.com' : host,
    owner,
    repository,
  } : undefined
}
