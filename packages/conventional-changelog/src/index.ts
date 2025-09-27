import type { Commit } from '@modulify/conventional-git/types/commit'
import type { CommitMeta } from '@modulify/conventional-git/types/commit'
import type { CommitType } from '@modulify/conventional-bump'

import { Client } from '@modulify/conventional-git'
import { Writable } from 'node:stream'

export interface ChangelogOptions {
  /** Custom commit types configuration. */
  types?: CommitType[];
  /** Output stream. */
  output?: Writable;
  /** Working directory. */
  cwd?: string;
  /** Git client instance. */
  git?: Client;
}

const reverts = (commit: Commit) => (revert: CommitMeta) => {
  return revert.header === commit.header
}

/** Writes a changelog based on conventional commits. */
export class ChangelogWriter {
  private readonly git: Client
  private readonly types: CommitType[]
  private readonly output?: Writable

  /**
   * Creates a new ChangelogWriter.
   * @param options - Changelog writer options.
   * @param options.types - Custom commit types configuration to group sections.
   * @param options.output - Optional output stream to write the changelog to.
   * @param options.cwd - Working directory for git commands.
   * @param options.git - Custom git client instance (mainly for testing).
   */
  constructor({
    types,
    output,
    cwd,
    git,
  }: ChangelogOptions = {}) {
    this.git = git ?? new Client({ cwd })
    this.types = types ?? []
    this.output = output
  }

  /**
   * Generates changelog content based on commits and configured sections.
   * Skips commits that were reverted later and groups entries by section.
   * When an output stream is provided, writes the content to it as well.
   * @returns Generated changelog content as a string.
   */
  async write() {
    const commits = this.git.commits()
    const sections = new Map<string, Commit[]>()
    for (const t of this.types) {
      if (t.hidden !== true && !sections.has(t.section)) {
        sections.set(t.section, [])
      }
    }

    const reverted: CommitMeta[] = []

    for await (const commit of commits) {
      if (reverted.some(reverts(commit))) continue
      if (commit.revert) reverted.push(commit.revert)

      const type = this.types.find(t => t.type === commit.type)
      if (type && sections.has(type.section)) {
        sections.get(type.section)?.push(commit)
      }
    }

    let content = ''

    for (const [section, commits] of sections) {
      content += `### ${section}\n\n`

      for (const commit of [...commits].reverse()) {
        content += `* ${commit.subject}\n`
      }

      content += '\n'
    }

    if (this.output) {
      this.output.write(content)
    }

    return content
  }
}
