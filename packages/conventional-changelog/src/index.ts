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

export class ChangelogWriter {
  private readonly git: Client
  private readonly types: CommitType[]
  private readonly output?: Writable

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
