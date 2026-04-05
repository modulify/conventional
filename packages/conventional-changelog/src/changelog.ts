import type {
  Commit,
  CommitRecord,
  CommitRevert,
} from '@modulify/conventional-git/types/commit'

import type { CommitType } from '@modulify/conventional-bump'

import type {
  Note,
  RenderContext,
  RenderFunction,
  Section,
} from './render'

import type { Traverser } from '@modulify/conventional-git/types/traverse'

import { DEFAULT_COMMIT_TYPES } from '@modulify/conventional-bump'

import { Writable } from 'node:stream'

import { createFileWritable } from './output'
import { createRender } from './render'

export interface ChangelogNotes {
  highlights: { title: string; notes: Note[]; }[];
  sections: Section[];
}

export interface ChangelogCapacitorOptions {
  types?: ReadonlyArray<CommitType>;
}

export interface RenderChangelogOptions {
  notes: ChangelogNotes;
  context?: Omit<RenderContext, 'version' | 'sections' | 'highlights'>;
  render?: RenderFunction;
  url?: string;
}

export interface WriteChangelogOptions {
  header?: string;
  file?: string;
  output?: Writable;
}

export function createChangelogCapacitor ({
  types = DEFAULT_COMMIT_TYPES,
}: ChangelogCapacitorOptions = {}): Traverser<ChangelogNotes, CommitRevert, CommitRecord, CommitRecord> {
  const sections = new Map<string, Commit[]>()
  const highlights = new Map<string, Note[]>()
  const reverted = [] as Array<NonNullable<Commit['revert']>>

  for (const entry of types) {
    if (!entry.hidden && !sections.has(entry.section)) {
      sections.set(entry.section, [])
    }
  }

  return {
    name: 'changelog',
    onCommit (commit) {
      if (reverted.some(reverts(commit))) return
      if (commit.revert) reverted.push(commit.revert)

      if (commit.notes.length > 0) {
        for (const note of commit.notes) {
          const group = highlights.get(note.title)

          if (group) {
            group.push({ commit, text: note.text })
          } else {
            highlights.set(note.title, [{ commit, text: note.text }])
          }
        }
      }

      const type = types.find((entry) => entry.type === commit.type)

      if (type && sections.has(type.section)) {
        sections.get(type.section)?.push(commit)
      }
    },
    onComplete () {
      return {
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
      }
    },
  }
}

export function renderChangelog (
  version: string,
  {
    notes,
    context,
    render = createRender(),
    url = '',
  }: RenderChangelogOptions
) {
  return render({
    version,
    ...urlToContext(url),
    ...context,
    highlights: notes.highlights,
    sections: notes.sections,
  })
}

export async function writeChangelog (
  changes: string,
  {
    header = '# Changelog',
    file,
    output,
  }: WriteChangelogOptions = {}
) {
  const target = output ?? (file ? createFileWritable(file, header) : undefined)

  if (!target) {
    return changes
  }

  await new Promise<void>((resolve, reject) => {
    let finished = false

    const fulfill = (error?: unknown) => error ? reject(error) : resolve()
    const done = (error?: unknown) => {
      if (finished) return
      finished = true
      target.off('error', done)
      fulfill(error)
    }

    target.on('error', done)
    target.write(changes, (error) => {
      if (error) return done(error)

      if (file && !output) {
        target.end(done)
      } else {
        done()
      }
    })
  })

  return changes
}

function reverts (commit: Commit) {
  return (revert: NonNullable<Commit['revert']>) => {
    if (commit.hash && revert.hash) {
      return commit.hash.startsWith(revert.hash) || revert.hash.startsWith(commit.hash)
    }

    return revert.header === commit.header
  }
}

function urlToContext (url: string) {
  const normalized = normalizeRepositoryLocation(url)

  if (!normalized) {
    return undefined
  }

  const parts = normalized.path
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.git$/, '')
    .split('/')
    .filter(Boolean)

  if (parts.length < 2) {
    return undefined
  }

  const repository = parts[parts.length - 1]
  const owner = parts.slice(0, -1).join('/')

  return {
    host: normalized.host.includes('github.com') ? 'https://github.com' : normalized.host,
    owner,
    repository,
  }
}

function normalizeRepositoryLocation (url: string) {
  try {
    const parsed = new URL(url)

    return parsed.host && parsed.pathname
      ? { host: parsed.host, path: parsed.pathname }
      : undefined
  } catch { /* empty */ }

  const [, host, path] = /^(?:[^@]+@)?([^:/]+):(.+)$/.exec(url) ?? []

  return host && path
    ? { host, path }
    : undefined
}
