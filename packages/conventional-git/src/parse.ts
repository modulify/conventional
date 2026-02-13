import type {
  Commit,
  CommitNote,
  CommitRecord,
  CommitReference,
  CommitRevert,
} from '~types/commit'

import type {
  FieldParseResult,
  FieldParser,
  ManageableField,
  MergeParser,
  MergeParseResult,
  ParseOptions,
  ParsePatterns,
  RevertParser,
} from '~types/parse'

const MATCH_HASH = /^[0-9a-fA-F]{7,64}$/
const MATCH_HEADER = /^(\w*)(?:\(([\w@$.\-*/ ]*)\))?(!)?: (.*)$/
const MATCH_URL = /\b(?:https?):\/\/(?:www\.)?[-a-zA-Z0-9@:%_+.~#?&//=]+\b/g

const MATCH_EVERYTHING = /()(.+)/gi
const MATCH_NOTHING = /(?!.*)/
const MATCH_FIELD = /^-(.*?)-$/
const MATCH_REVERT = /^Revert\s"([\s\S]*)"\s*This reverts commit (\w*)\./

export const DEFAULTS = {
  commentChar: '',
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

export const defaultMergeParser: MergeParser = () => null
export const defaultRevertParser: RevertParser<CommitRevert> = createRegexRevertParser(MATCH_REVERT, matches => ({
  header: matches[1] || null,
  hash: matches[2] || null,
}))
export const defaultFieldParser = createRegexFieldParser(MATCH_FIELD)

export function createParser<
  TRevert extends CommitRecord = CommitRevert,
  TFields extends CommitRecord = CommitRecord,
  TMeta extends CommitRecord = CommitRecord,
> (options: ParseOptions<TRevert, TFields, TMeta> = {}) {
  const parseOptions = {
    commentChar: options.commentChar ?? DEFAULTS.commentChar,
    notesPattern: options.notesPattern ?? DEFAULTS.notesPattern,
    notesKeywords: options.notesKeywords ?? DEFAULTS.notesKeywords,
    issuePrefixes: options.issuePrefixes ?? DEFAULTS.issuePrefixes,
    issuePrefixesCaseSensitive: options.issuePrefixesCaseSensitive ?? DEFAULTS.issuePrefixesCaseSensitive,
    referenceActions: options.referenceActions ?? DEFAULTS.referenceActions,
  }
  const mergeParser = options.mergeParser ?? defaultMergeParser as MergeParser<TMeta>
  const revertParser = options.revertParser ?? defaultRevertParser as unknown as RevertParser<TRevert>
  const fieldParser = options.fieldParser ?? defaultFieldParser as FieldParser<TFields>
  const patterns = createPatterns(parseOptions)

  return (raw: string): Commit<TRevert, TFields, TMeta> => {
    const commit = createCommit<TRevert, TFields, TMeta>()
    const lines = linesOf(raw, parseOptions.commentChar)

    if (lines.length > 0 && MATCH_HASH.test(lines[0])) {
      commit.hash = lines.shift()!
    }

    const content = { lines, cursor: 0 }

    parseMerge(commit, content, mergeParser)
    parseHeader(commit, content)

    if (commit.header) commit.references = parseReferences(commit.header, patterns)

    const headless = content.lines.slice(content.cursor)

    let parsingBody = true

    while (content.cursor < content.lines.length) {
      parseMeta(commit, content, fieldParser)

      if (parseNotes(commit, content, patterns, fieldParser)) {
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

    commit.revert = revertParser(lines.join('\n'))

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

function createCommit<
  TRevert extends CommitRecord,
  TFields extends CommitRecord,
  TMeta extends CommitRecord,
> (): Commit<TRevert, TFields, TMeta> {
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
    fields: {} as TFields,
    meta: {} as TMeta,
  }
}

function createPatterns (options: {
  issuePrefixes: string[];
  issuePrefixesCaseSensitive: boolean;
  notesKeywords: string[];
  notesPattern: (text: string) => RegExp;
  referenceActions: string[];
}): ParsePatterns {
  const issuePrefixes = joinPatterns(options.issuePrefixes)
  const notesKeywords = joinPatterns(options.notesKeywords)
  const referenceActions = joinPatterns(options.referenceActions)

  return {
    mentions: /@([\w-]+)/g,
    notes: notesKeywords ? options.notesPattern(notesKeywords) : MATCH_NOTHING,
    references: referenceActions
      ? new RegExp(`(${referenceActions})(?:\\s+(.*?))(?=(?:${referenceActions})|$)`, 'gi')
      : MATCH_EVERYTHING,
    referencesParts: issuePrefixes
      ? new RegExp(`(?:.*?)??\\s*([\\w-\\.\\/]*?)??(${issuePrefixes})([\\w-]*\\d+)`, options.issuePrefixesCaseSensitive ? 'g' : 'gi')
      : MATCH_NOTHING,
  }
}

function linesOf (raw: string, commentChar: string) {
  return trimLineBreaks(raw).split(/\r?\n/).filter(line => {
    return !line.match(/^\s*gpg:/) && !(commentChar && line.charAt(0) === commentChar)
  })
}

const isManageable = (key: string): key is ManageableField => [
  'type',
  'scope',
  'subject',
  'merge',
  'header',
  'body',
  'footer',
].includes(key)

function parseMerge<
  TRevert extends CommitRecord,
  TFields extends CommitRecord,
  TMeta extends CommitRecord,
> (
  commit: Commit<TRevert, TFields, TMeta>,
  content: Content,
  parser: MergeParser<TMeta>
) {
  const line = content.lines[content.cursor]
  const parsed = line ? parser(line) : null

  if (parsed) {
    commit.merge = parsed.merge ?? line

    for (const [key, value] of Object.entries(parsed.manageable ?? {})) {
      if (isManageable(key)) {
        commit[key] = value ?? null
      }
    }

    for (const [key, value] of Object.entries(parsed.meta ?? {}) as Array<[keyof TMeta & string, string | null | undefined]>) {
      (commit.meta as CommitRecord)[key] = value ?? null
    }

    content.cursor++

    while (content.cursor < content.lines.length && !content.lines[content.cursor].trim()) {
      content.cursor++
    }
  }
}

function parseHeader<
  TRevert extends CommitRecord,
  TFields extends CommitRecord,
  TMeta extends CommitRecord,
> (commit: Commit<TRevert, TFields, TMeta>, content: Content) {
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
  const sanitized = input.replace(MATCH_URL, ' ')
  const matches = patterns.referencesParts.exec(sanitized)
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

function parseMeta<
  TRevert extends CommitRecord,
  TFields extends CommitRecord,
  TMeta extends CommitRecord,
> (
  commit: Commit<TRevert, TFields, TMeta>,
  content: Content,
  parser: FieldParser<TFields>
) {
  let field: FieldParseResult<TFields> | null = null
  let parsed = false
  let line = ''

  while (content.cursor < content.lines.length) {
    line = content.lines[content.cursor]
    const token = parser(line)

    if (token) {
      field = token.target === 'none' ? null : token
      content.cursor++
      continue
    }

    if (field) {
      parsed = true

      if (field.target === 'manageable') {
        const key = field.key
        commit[key] = appendLine(commit[key], line)
      } else {
        const key = field.key
        const fields = commit.fields as CommitRecord
        fields[key] = appendLine(fields[key], line)
      }

      content.cursor++
    } else {
      break
    }
  }

  return parsed
}

function parseNotes<
  TRevert extends CommitRecord,
  TFields extends CommitRecord,
  TMeta extends CommitRecord,
> (
  commit: Commit<TRevert, TFields, TMeta>,
  content: Content,
  patterns: ParsePatterns,
  parser: FieldParser<TFields>
) {
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
      if (parseMeta(commit, content, parser)) return true
      if (parseNotes(commit, content, patterns, parser)) return true

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

function appendLine (src: string | null | undefined, line: string) {
  return src ? `${src}\n${line}` : line
}

function joinPatterns (parts: string[]) {
  return parts
    .map(v => v.trim())
    .filter(Boolean)
    .map(escapeRegExp)
    .join('|')
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

function escapeRegExp (value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function createRegexMergeParser<TMeta extends CommitRecord = CommitRecord> (
  pattern: RegExp,
  map: (matches: RegExpMatchArray) => MergeParseResult<TMeta>
): MergeParser<TMeta> {
  return (line: string) => {
    const matches = line.match(pattern)
    return matches ? map(matches) : null
  }
}

export function createRegexRevertParser<TRevert extends CommitRecord> (
  pattern: RegExp,
  map: (matches: RegExpMatchArray) => TRevert
): RevertParser<TRevert> {
  return (input: string) => {
    const matches = input.match(pattern)
    return matches ? map(matches) : null
  }
}

export function createRegexFieldParser<TFields extends CommitRecord = CommitRecord> (
  pattern: RegExp
): FieldParser<TFields> {
  return (line: string) => {
    const matches = line.match(pattern)
    if (!matches) {
      return null
    }

    const key = matches[1] ?? null

    if (!key) {
      return {
        target: 'none',
      }
    }

    if (isManageable(key)) {
      return {
        target: 'manageable',
        key,
      }
    }

    return {
      target: 'field',
      key: key as keyof TFields & string,
    }
  }
}
