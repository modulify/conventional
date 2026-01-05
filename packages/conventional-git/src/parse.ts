import {
  Commit,
  CommitMeta,
  CommitNote,
  CommitReference,
} from '~types/commit'

import type {
  ParseOptions,
  ParsePatterns,
} from '~types/parse'

const MATCH_HASH = /^[0-9a-fA-F]{7,64}$/
const MATCH_HEADER = /^(\w*)(?:\(([\w@$.\-*/ ]*)\))?(!)?: (.*)$/
const MATCH_URL = /\b(?:https?):\/\/(?:www\.)?([-a-zA-Z0-9@:%_+.~#?&//=])+\b/

const MATCH_EVERYTHING = /()(.+)/gi
const MATCH_NOTHING = /(?!.*)/

export const DEFAULTS: Required<ParseOptions> = {
  mergePattern: MATCH_NOTHING,
  mergeCorrespondence: [],
  revertPattern: /^Revert\s"([\s\S]*)"\s*This reverts commit (\w*)\./,
  revertCorrespondence: ['header', 'hash'],
  commentChar: '',
  fieldPattern: /^-(.*?)-$/,
  notesPattern: (text: string): RegExp => new RegExp(`^[\\s|*]*(${text})[:\\s]+(.*)`, 'i'),
  notesKeywords: ['BREAKING CHANGE', 'BREAKING-CHANGE'],
  issuePrefixes: ['#'],
  issuePrefixesCaseSensitive: false,
  referenceActions: [
    'close',
    'closes',
    'closed',
    'fix',
    'fixes',
    'fixed',
    'resolve',
    'resolves',
    'resolved',
  ],
}

export function createParser (options: ParseOptions = {}) {
  const _options = { ...DEFAULTS, ...options } as Required<ParseOptions>
  const patterns = createPatterns(_options)

  return (raw: string): Commit => {
    const commit = createCommit()
    const lines = linesOf(raw, _options)

    if (lines.length > 0 && MATCH_HASH.test(lines[0])) {
      commit.hash = lines.shift() || null
    }

    const content = { lines, cursor: 0 }

    parseMerge(commit, content, patterns, _options.mergeCorrespondence)
    parseHeader(commit, content)

    if (commit.header) commit.references = parseReferences(commit.header, patterns)

    const headless = content.lines.slice(content.cursor)

    let parsingBody = true

    while (content.cursor < content.lines.length) {
      parseMeta(commit, content, patterns)

      if (parseNotes(commit, content, patterns)) {
        parsingBody = false
      }

      if (content.cursor < content.lines.length) {
        const line = content.lines[content.cursor]
        const references = parseReferences(line, patterns)

        if (parsingBody && !references.length) {
          commit.body = appendLine(commit.body, line)
        } else {
          commit.references.push(...references)
          commit.footer = appendLine(commit.footer, line)
          parsingBody = false
        }

        content.cursor++
      }
    }

    headless.forEach(line => commit.mentions.push(...parseMentions(line, patterns)))

    commit.revert = parseRevert(lines.join('\n'), _options.revertPattern, _options.revertCorrespondence)

    if (commit.body) commit.body = trimLineBreaks(commit.body)
    if (commit.footer) commit.footer = trimLineBreaks(commit.footer)

    commit.notes.forEach(note => note.text = trimLineBreaks(note.text))

    return commit
  }
}

type Content = {
  lines: string[];
  cursor: number;
}

function createCommit (): Commit {
  return {
    hash: null,
    type: null,
    scope: null,
    subject: null,
    merge: null,
    revert: null,
    header: null,
    body: null,
    footer: null,
    notes: [],
    mentions: [],
    references: [],
    fields: {},
    meta: {},
  }
}

function createPatterns (options: Required<ParseOptions>): ParsePatterns {
  const issuePrefixes = join(options.issuePrefixes, '|')
  const notesKeywords = join(options.notesKeywords, '|')
  const referenceActions = join(options.referenceActions, '|')

  return {
    fields: options.fieldPattern,
    mentions: /@([\w-]+)/g,
    merge: options.mergePattern,
    notes: notesKeywords ? options.notesPattern(notesKeywords) : MATCH_NOTHING,
    references: referenceActions
      ? new RegExp(`(${referenceActions})(?:\\s+(.*?))(?=(?:${referenceActions})|$)`, 'gi')
      : MATCH_EVERYTHING,
    referencesParts: issuePrefixes
      ? new RegExp(`(?:.*?)??\\s*([\\w-\\.\\/]*?)??(${issuePrefixes})([\\w-]*\\d+)`, options.issuePrefixesCaseSensitive ? 'g' : 'gi')
      : MATCH_NOTHING,
  }
}

function linesOf (raw: string, options: Required<ParseOptions>) {
  return trimLineBreaks(raw).split(/\r?\n/).filter(line => {
    return !line.match(/^\s*gpg:/) && !(options.commentChar && line.charAt(0) === options.commentChar)
  })
}

type Manageable =
  | 'type'
  | 'scope'
  | 'subject'
  | 'merge'
  | 'header'
  | 'body'
  | 'footer'

const isManageable = (key: string): key is Manageable => [
  'type',
  'scope',
  'subject',
  'merge',
  'header',
  'body',
  'footer',
].includes(key)

function parseMerge (commit: Commit, content: Content, patterns: ParsePatterns, correspondence: string[] = []) {
  const line = content.lines[content.cursor]
  const matches = line ? line.match(patterns.merge) : null

  if (matches) {
    commit.merge = matches[0] ?? null

    correspondence.forEach((key, index) => {
      const value = matches[index + 1] ?? null
      if (isManageable(key)) {
        commit[key] = value
      } else {
        commit.meta[key] = value
      }
    })

    content.cursor++

    while (content.cursor < content.lines.length && !content.lines[content.cursor].trim()) {
      content.cursor++
    }
  }
}

function parseHeader (commit: Commit, content: Content) {
  const header = commit.header ?? content.lines[content.cursor++] ?? null
  if (header) {
    commit.header = header
  }

  const matches = header?.match(MATCH_HEADER) ?? null
  if (matches) {
    const [, type, scope, breaking, subject] = matches

    if (type) commit.type = type
    if (scope) commit.scope = scope
    if (subject) commit.subject = subject
    if (breaking) commit.notes.push({ title: 'BREAKING CHANGE', text: subject })
  }
}

function parseReference (input: string, action: string | null, patterns: ParsePatterns) {
  if (MATCH_URL.test(input)) {
    return null
  }

  const matches = patterns.referencesParts.exec(input)
  if (!matches) {
    return null
  }

  const [raw,, prefix, issue] = matches

  let owner: string | null = null
  let repository = matches[1] ?? null
  if (repository) {
    const slashIndex = repository.indexOf('/')

    if (slashIndex !== -1) {
      owner = repository.slice(0, slashIndex)
      repository = repository.slice(slashIndex + 1)
    }
  }

  return {
    raw,
    action,
    owner,
    repository,
    prefix,
    issue,
  } satisfies CommitReference
}

function parseReferences (input: string, patterns: ParsePatterns) {
  if (!input || !patterns.references) return []

  const regex = input.match(patterns.references) ? patterns.references : MATCH_EVERYTHING
  const references: CommitReference[] = []

  let matches: RegExpExecArray | null
  let action: string | null
  let sentence: string
  let reference: CommitReference | null

  while (true) {
    matches = regex.exec(input)
    if (!matches) {
      break
    }

    action = matches[1] || null
    sentence = matches[2] || ''

    while (true) {
      reference = parseReference(sentence, action, patterns)
      if (!reference) {
        break
      }

      references.push(reference)
    }
  }

  return references
}

function parseMeta (commit: Commit, content: Content, patterns: ParsePatterns) {
  let field: string | null = null
  let matches: RegExpMatchArray | null
  let parsed = false
  let line = ''

  while (content.cursor < content.lines.length) {
    line = content.lines[content.cursor]
    matches = line.match(patterns.fields)

    if (matches) {
      field = matches[1] ?? null
      content.cursor++
      continue
    }

    if (field) {
      parsed = true

      if (isManageable(field)) {
        commit[field] = appendLine(commit[field], line)
      } else {
        commit.fields[field] = appendLine(commit.fields[field], line)
      }

      content.cursor++
    } else {
      break
    }
  }

  return parsed
}

function parseNotes (commit: Commit, content: Content, patterns: ParsePatterns) {
  if (content.cursor >= content.lines.length) return false

  let line = content.lines[content.cursor]
  let references: CommitReference[] = []

  const matches = line.match(patterns.notes)
  if (matches) {
    const note: CommitNote = {
      title: matches[1],
      text: matches[2],
    }

    commit.notes.push(note)
    commit.footer = appendLine(commit.footer, line)
    content.cursor++

    while (content.cursor < content.lines.length) {
      if (parseMeta(commit, content, patterns)) return true
      if (parseNotes(commit, content, patterns)) return true

      line = content.lines[content.cursor]
      references = parseReferences(line, patterns)

      if (references.length) {
        commit.references.push(...references)
      } else {
        note.text = appendLine(note.text, line)
      }

      commit.footer = appendLine(commit.footer, line)
      content.cursor++

      if (references.length) {
        break
      }
    }

    return true
  }

  return false
}

function parseMentions (input: string, patterns: ParsePatterns) {
  const mentions = [] as string[]

  let match: RegExpExecArray | null
  while ((match = patterns.mentions.exec(input)) !== null) {
    mentions.push(match[1])
  }

  return mentions
}

function parseRevert (input: string, pattern: RegExp, correspondence: string[] = []) {
  const matches = input.match(pattern)
  if (matches) {
    return correspondence.reduce<CommitMeta>((meta, key, index) => {
      meta[key] = matches[index + 1] || null

      return meta
    }, {})
  }

  return null
}

function appendLine (src: string | null, line: string) {
  return src ? `${src}\n${line}` : line
}

function join (parts: string[], separator: string) {
  return parts
    .map(v => v.trim())
    .filter(Boolean)
    .join(separator)
}

function trimLineBreaks (text: string) {
  const matches = text.match(/[^\r\n]/)
  if (typeof matches?.index !== 'number') {
    return ''
  }

  let end = text.length - 1
  while (text[end] === '\r' || text[end] === '\n') {
    end--
  }

  return text.substring(matches.index, end + 1)
}
