import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import {
  parseChangesetPaths,
  resolveFromTag,
  toRevision,
} from '@/range'

describe('range helpers', () => {
  it('returns explicit fromTag without reading tags', async () => {
    const tags = vi.fn()

    expect(await resolveFromTag({ tags }, 'v1.2.3')).toBe('v1.2.3')
    expect(tags).not.toHaveBeenCalled()
  })

  it('returns null when tags accessor is unavailable', async () => {
    expect(await resolveFromTag({})).toBeNull()
  })

  it('builds revisions with and without lower boundary', () => {
    expect(toRevision('v1.0.0')).toBe('v1.0.0..HEAD')
    expect(toRevision('v1.0.0', 'main')).toBe('v1.0.0..main')
    expect(toRevision(null)).toBe('HEAD')
    expect(toRevision(null, 'main')).toBe('main')
  })

  it('parses renamed and regular changed paths', () => {
    expect(parseChangesetPaths([
      'M\tREADME.md',
      'R100\told.txt\tnew.txt',
      '',
    ].join('\n'))).toEqual([
      'README.md',
      'old.txt',
      'new.txt',
    ])
  })
})
