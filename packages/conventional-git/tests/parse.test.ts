import {
  describe,
  expect,
  it,
} from 'vitest'

import { createParser } from '@/parse'

describe('parse', () => {
  describe('defaults', () => {
    const parse = createParser()

    it.each([
      ['feat: subject', 'feat', null, 'subject'],
      ['fix: Annoying bug', 'fix', null, 'Annoying bug'],
      ['feat(scope): subject', 'feat', 'scope', 'subject'],
      ['feat(@scope/package): subject', 'feat', '@scope/package', 'subject'],
      ['abc: def', 'abc', null, 'def'],
      ['header', null, null, null],
    ])('should parse type, scope and subject in: %s', (header, type, scope, subject) => {
      expect(parse(header)).toEqual({
        hash: null,
        type,
        scope,
        subject,
        merge: null,
        revert: null,
        header,
        body: null,
        footer: null,
        notes: [],
        mentions: [],
        references: [],
        fields: {},
        meta: {},
      })
    })

    it.each([
      ['feat!: subject', 'feat', null, 'subject'],
      ['fix!: Annoying bug', 'fix', null, 'Annoying bug'],
      ['feat(scope)!: subject', 'feat', 'scope', 'subject'],
    ])('should parse breaking change note in: %s', (header, type, scope, subject) => {
      expect(parse(header)).toEqual({
        hash: null,
        type,
        scope,
        subject,
        merge: null,
        revert: null,
        header,
        body: null,
        footer: null,
        notes: [{ title: 'BREAKING CHANGE', text: subject }],
        mentions: [],
        references: [],
        fields: {},
        meta: {},
      })
    })

    it('should parse references from header', () => {
      expect(parse('ref #2597').references).toEqual([{
        raw: 'ref #2597',
        issue: '2597',
        action: null,
        prefix: '#',
        owner: null,
        repository: null,
      }])
    })

    it('should parse commit body', () => {
      expect(parse(
        'feat(git): Commands\n'
        + '\n'
        + '* revParse\n'
        + '* show\n'
      )).toEqual({
        hash: null,
        type: 'feat',
        scope: 'git',
        subject: 'Commands',
        merge: null,
        revert: null,
        header: 'feat(git): Commands',
        body: '* revParse\n* show',
        footer: null,
        notes: [],
        mentions: [],
        references: [],
        fields: {},
        meta: {},
      })
    })

    it('should parse actions', () => {
      expect(parse(
        'fix: Annoying bug\n'
        + '\n'
        + 'Closes #2597'
      )).toEqual({
        hash: null,
        type: 'fix',
        scope: null,
        subject: 'Annoying bug',
        merge: null,
        revert: null,
        header: 'fix: Annoying bug',
        body: '',
        footer: 'Closes #2597',
        notes: [],
        mentions: [],
        references: [{
          raw: '#2597',
          issue: '2597',
          prefix: '#',
          owner: null,
          repository: null,
          action: 'Closes',
        }],
        fields: {},
        meta: {},
      })
    })

    it('should ignore gpg signature lines', () => {
      expect(parse(
        'gpg: Signature made Thu Oct 22 12:19:30 2020 EDT\n'
        + 'gpg:                using RSA key ABCDEF1234567890\n'
        + 'gpg: Good signature from "Author <author@example.com>" [ultimate]\n'
        + 'feat(scope): Broadcast $destroy event on scope destruction\n'
        + 'perf testing shows that in chrome this change adds 5-15% overhead\n'
        + 'when destroying 10k nested scopes where each scope has a $destroy listener\n'
        + 'BREAKING CHANGE: some breaking change\n'
        + 'Closes #1\n'
      )).toEqual({
        hash: null,
        merge: null,
        header: 'feat(scope): Broadcast $destroy event on scope destruction',
        scope: 'scope',
        subject: 'Broadcast $destroy event on scope destruction',
        type: 'feat',
        body: 'perf testing shows that in chrome this change adds 5-15% overhead\nwhen destroying 10k nested scopes where each scope has a $destroy listener',
        footer: 'BREAKING CHANGE: some breaking change\nCloses #1',
        notes: [
          {
            title: 'BREAKING CHANGE',
            text: 'some breaking change',
          },
        ],
        references: [
          {
            raw: '#1',
            issue: '1',
            prefix: '#',
            owner: null,
            repository: null,
            action: 'Closes',
          },
        ],
        mentions: [],
        revert: null,
        fields: {},
        meta: {},
      })
    })

    it('should parse mentions', () => {
      const commit = parse('feat: subject\n\nBody with @user1 and @user2')

      expect(commit.mentions).toEqual(['user1', 'user2'])
    })

    it('should parse complex references', () => {
      const commit = parse('fix: issue in another repo owner/repo#123')

      expect(commit.references).toEqual([{
        raw: 'fix: issue in another repo owner/repo#123',
        issue: '123',
        action: null,
        prefix: '#',
        owner: 'owner',
        repository: 'repo',
      }])
    })

    it('should parse revert commits', () => {
      const commit = parse('Revert "feat: original subject"\n\nThis reverts commit 1234567.')

      expect(commit.revert).toEqual({
        header: 'feat: original subject',
        hash: '1234567',
      })
    })
  })

  describe('options', () => {
    it('should support mergePattern with manageable fields', () => {
      const parse = createParser({
        mergePattern: /^Merge branch '([\w-]+)' into ([\w-]+)/,
        mergeCorrespondence: ['branch', 'body'],
      })

      const commit = parse('Merge branch \'feature-branch\' into main\n\nfeat: some feature')

      expect(commit.merge).toBe('Merge branch \'feature-branch\' into main')
      expect(commit.meta.branch).toBe('feature-branch')
      expect(commit.body).toContain('main')
    })

    it('should support custom fieldPattern with manageable fields', () => {
      const parse = createParser({ fieldPattern: /^-(.*?)-$/ })
      const commit = parse('feat: subject\n\n-body-\nCustom body')

      expect(commit.body).toBe('Custom body')
    })

    it('should support commentChar', () => {
      const parse = createParser({ commentChar: '#' })
      const commit = parse('feat: subject\n# this is a comment\n\nbody')

      expect(commit.body).toBe('body')
    })

    it('should support custom issuePrefixes', () => {
      const parse = createParser({ issuePrefixes: ['GH-'] })
      const commit = parse('fix: some bug GH-123')

      expect(commit.references[0].issue).toBe('123')
      expect(commit.references[0].prefix).toBe('GH-')
    })

    it('should support multiple notes keywords', () => {
      const parse = createParser({
        notesKeywords: ['BREAKING CHANGE', 'SECURITY'],
      })

      const commit = parse('feat: subject\n\nSECURITY: this is a security note')

      expect(commit.notes[0]).toEqual({
        title: 'SECURITY',
        text: 'this is a security note',
      })
    })
  })

  describe('edge cases', () => {
    const parse = createParser()

    it('should handle empty body and footer', () => {
      const commit = parse('feat: subject\n\n\n')

      expect(commit.body).toBe(null)
      expect(commit.footer).toBe(null)
    })

    it('should handle multiline notes', () => {
      const commit = parse('feat: subject\n\nBREAKING CHANGE: line 1\nline 2')

      expect(commit.notes[0].text).toBe('line 1\nline 2')
    })

    it('should handle notes with fields', () => {
      const commit = parse('feat: subject\n\nBREAKING CHANGE: some note\n-field-\nvalue')

      expect(commit.notes[0].text).toBe('some note')
      expect(commit.fields.field).toBe('value')
    })

    it('should ignore URLs in references', () => {
      const commit = parse('fix: see https://example.com/issue/1')

      expect(commit.references).toEqual([])
    })

    it('should handle only line breaks', () => {
      const commit = parse('\n\n\n')

      expect(commit.hash).toBe(null)
      expect(commit.header).toBe(null)
    })

    it('should parse hash if provided as first line', () => {
      const commit = parse('1234567890abcdef1234567890abcdef12345678\nfeat: subject')

      expect(commit.hash).toBe('1234567890abcdef1234567890abcdef12345678')
      expect(commit.type).toBe('feat')
      expect(commit.subject).toBe('subject')
    })

    it('should parse short hash if provided as first line', () => {
      const commit = parse('1234567\nfeat: subject')

      expect(commit.hash).toBe('1234567')
      expect(commit.type).toBe('feat')
    })

    it('should handle notes followed by other notes', () => {
      const commit = parse('feat: subject\n\nBREAKING CHANGE: note 1\nBREAKING CHANGE: note 2')

      expect(commit.notes).toHaveLength(2)
      expect(commit.notes[0].text).toBe('note 1')
      expect(commit.notes[1].text).toBe('note 2')
    })

    it('should handle notes followed by references', () => {
      const commit = parse('feat: subject\n\nBREAKING CHANGE: note 1\nCloses #123')
      expect(commit.notes[0].text).toBe('note 1')
      expect(commit.references[0].issue).toBe('123')
    })

    it('should handle merge commits with correspondence that are not manageable', () => {
      const parse = createParser({
        mergePattern: /^Merge branch '([\w-]+)'/,
        mergeCorrespondence: ['nonManageable'],
      })

      const commit = parse('Merge branch \'feature\'\nheader')

      expect(commit.meta.nonManageable).toBe('feature')
    })

    it('should handle parseReference returning null for malformed reference', () => {
      const parse = createParser({
        issuePrefixes: ['#'],
      })

      const commit = parse('fix: something with # but no number #abc')

      expect(commit.references).toEqual([])
    })

    it('should handle parseRevert with missing correspondence fields', () => {
      const parse = createParser({
        revertPattern: /^Revert (.*)/,
        revertCorrespondence: ['customField'],
      })

      const commit = parse('Revert some subject')

      expect(commit.revert?.customField).toBe('some subject')
    })

    it('should handle trimLineBreaks for only line breaks', () => {
      const commit = parse('\n\n')

      expect(commit.header).toBe(null)
    })
  })
})
