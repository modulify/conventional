import type { Commit } from '@modulify/conventional-git/types/commit'
import type { CommitMeta } from '@modulify/conventional-git/types/commit'
import type { CommitType } from '@modulify/conventional-bump'
import type { RenderContext as _RenderContext } from './render'
import type { RenderFunction } from './render'

import { Client } from '@modulify/conventional-git'
import { Writable } from 'node:stream'

import { createRender } from './render'
import { existsSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { writeFileSync } from 'node:fs'

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

const reverts = (commit: Commit) => (revert: CommitMeta) => {
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
  const output = options.output
  const header = options.header ?? '# Changelog'
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

    const reverted: CommitMeta[] = []

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
      output.write(changes)
    }

    if (options.file) {
      const content = existsSync(options.file) ? readFileSync(options.file, 'utf8') : ''

      writeFileSync(options.file, [
        header,
        changes,
        content.startsWith(header)
          ? content.slice(header.length)
          : content,
      ].map(p => p.trim()).filter(Boolean).join('\n\n') + '\n\n')
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
