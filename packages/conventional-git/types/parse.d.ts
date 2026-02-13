import type {
  CommitRecord,
  CommitRevert,
  CommitValue,
} from './commit'

export type ManageableField =
  | 'type'
  | 'scope'
  | 'subject'
  | 'merge'
  | 'header'
  | 'body'
  | 'footer'

export interface MergeParseResult<TMeta extends CommitRecord = CommitRecord> {
  merge?: string;
  manageable?: Partial<Record<ManageableField, CommitValue>>;
  meta?: Partial<TMeta>;
}

export type MergeParser<TMeta extends CommitRecord = CommitRecord> = (line: string) => MergeParseResult<TMeta> | null
export type RevertParser<TRevert extends CommitRecord = CommitRevert> = (input: string) => TRevert | null

export type FieldParseResult<TFields extends CommitRecord = CommitRecord> =
  | { target: 'none' }
  | { target: 'manageable'; key: ManageableField }
  | { target: 'field'; key: keyof TFields & string }

export type FieldParser<TFields extends CommitRecord = CommitRecord> = (line: string) => FieldParseResult<TFields> | null

export interface ParseOptions<
  TRevert extends CommitRecord = CommitRevert,
  TFields extends CommitRecord = CommitRecord,
  TMeta extends CommitRecord = CommitRecord,
> {
  /** Character used to comment out a line. */
  commentChar?: string;
  /** Custom parser for merge headers. */
  mergeParser?: MergeParser<TMeta>;
  /** Custom parser for revert metadata. */
  revertParser?: RevertParser<TRevert>;
  /** Custom parser for extra fields. */
  fieldParser?: FieldParser<TFields>;
  /** The prefixes of an issue. EG: In `gh-123` `gh-` is the prefix. */
  issuePrefixes?: string[]
  /** Used to define if `issuePrefixes` should be considered case-sensitive. */
  issuePrefixesCaseSensitive?: boolean
  /** Keywords for important notes. This value is case **insensitive**. */
  notesKeywords?: string[]
  /** A function that takes `noteKeywordsSelection` and returns a `RegExp` to be matched against the notes. */
  notesPattern? (text: string): RegExp
  /** Keywords to reference an issue. This value is case **insensitive**. */
  referenceActions?: string[]
}

export interface ParsePatterns {
  mentions: RegExp;
  notes: RegExp;
  references: RegExp;
  referencesParts: RegExp;
}
