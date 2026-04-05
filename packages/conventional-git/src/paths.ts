import type { CommitRecord } from '~types/commit'
import type { Traverser } from '~types/traverse'

export interface Changeset {
  paths: string[];
}

export type ChangesetMeta = CommitRecord & {
  changeset?: Changeset;
}

export function createChangesetTraverser (): Traverser<Changeset, CommitRecord, CommitRecord, ChangesetMeta> {
  const paths = new Set<string>()

  return {
    name: 'changeset',
    onCommit (commit) {
      for (const path of commit.meta.changeset?.paths ?? []) {
        paths.add(path)
      }
    },
    onComplete () {
      return {
        paths: [...paths],
      }
    },
  }
}
