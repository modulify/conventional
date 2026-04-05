import { describe, expect, it } from 'vitest'

import { createChangesetTraverser } from '@/index'

describe('createChangesetTraverser', () => {
  it('accumulates unique changed paths from commit meta', () => {
    const traverser = createChangesetTraverser()

    traverser.onCommit?.({
      meta: {
        changeset: {
          paths: ['packages/a/package.json', 'packages/b/package.json'],
        },
      },
    } as never, {} as never)
    traverser.onCommit?.({
      meta: {
        changeset: {
          paths: ['packages/b/package.json', 'packages/c/package.json'],
        },
      },
    } as never, {} as never)

    expect(traverser.onComplete?.({} as never)).toEqual({
      paths: [
        'packages/a/package.json',
        'packages/b/package.json',
        'packages/c/package.json',
      ],
    })
  })

  it('ignores commits without changed paths metadata', () => {
    const traverser = createChangesetTraverser()

    traverser.onCommit?.({
      meta: {},
    } as never, {} as never)

    expect(traverser.onComplete?.({} as never)).toEqual({
      paths: [],
    })
  })
})
