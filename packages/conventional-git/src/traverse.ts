import { Client } from './Client'

import type {
  Commit,
  CommitRevert,
  CommitRecord,
} from '~types/commit'

import type { CommitStreamParseOptions } from './Client'

import type {
  TraverseContext,
  TraverseResult,
  TraverseOptions,
} from '~types/traverse'

import { resolveFromTag } from './range'

type AnalyzeGit<
  TRevert extends CommitRecord = CommitRevert,
  TFields extends CommitRecord = CommitRecord,
  TMeta extends CommitRecord = CommitRecord,
> = {
  commits: (options?: CommitStreamParseOptions<TRevert, TFields, TMeta>) => AsyncIterable<Commit<TRevert, TFields, TMeta>>
  tags?: Pick<Client, 'tags'>['tags'];
}

export async function traverse<
  TRevert extends CommitRecord = CommitRevert,
  TFields extends CommitRecord = CommitRecord,
  TMeta extends CommitRecord = CommitRecord,
> ({
  cwd,
  git,
  traversers,
  fromTag,
  tagPrefix,
  toRef,
  ...options
}: TraverseOptions<TRevert, TFields, TMeta> & {
  cwd?: string;
  git?: AnalyzeGit<TRevert, TFields, TMeta>;
}): Promise<TraverseResult> {
  const client = git ?? new Client({ cwd })
  const from = await resolveFromTag(client, fromTag, tagPrefix)
  const to = toRef ?? 'HEAD'
  const context: TraverseContext = {
    cwd,
    range: { from, to, ...tagPrefix && { tagPrefix } },
    commits: {
      total: 0,
    },
  }

  for (const traverser of traversers) {
    await traverser.onStart?.(context)
  }

  const commits = client.commits({
    ...options,
    ...from && { from },
    ...toRef && { to: toRef },
  })

  for await (const commit of commits) {
    context.commits.total += 1

    for (const traverser of traversers) {
      await traverser.onCommit?.(commit, context)
    }
  }

  const results = new Map<string, unknown>()
  for (const traverser of traversers) {
    results.set(traverser.name, await traverser.onComplete?.(context))
  }

  return {
    range: { ...context.range },
    commits: { ...context.commits },
    results,
  }
}
