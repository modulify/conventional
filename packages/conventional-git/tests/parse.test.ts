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
  })
})