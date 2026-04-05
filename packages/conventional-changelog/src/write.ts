import type { ChangelogNotes } from './changelog'
import type { CommitType } from '@modulify/conventional-bump'
import type { RenderContext as _RenderContext } from './render'
import type { RenderFunction } from './render'

import { Client } from '@modulify/conventional-git'

import { Writable } from 'node:stream'

import {
  createChangelogCapacitor,
  renderChangelog,
  writeChangelog,
} from './changelog'

export interface RenderContext extends Omit<_RenderContext, 'sections' | 'highlights'> {
  [key: string]: unknown;
}

export interface ChangelogOptions {
  /** Working directory. */
  cwd?: string;
  /** Git client instance. */
  git?: Pick<Client, 'url' | 'traverse'>;
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

  return async (version: string = '0.0.0') => {
    const result = await git.traverse({
      traversers: [createChangelogCapacitor({
        types: options.types,
      })],
    })
    const notes = result.results.get('changelog') as ChangelogNotes
    const changes = renderChangelog(version, {
      notes,
      context: options.context,
      render: options.render,
      url: await git.url(),
    })

    await writeChangelog(changes, {
      header: options.header,
      file: options.file,
      output: options.output,
    })

    return changes
  }
}
