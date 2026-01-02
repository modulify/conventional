export interface ParseOptions {
  /** Character used to comment out a line. */
  commentChar?: string;
  /**
   * Pattern to match merge headers. EG: branch merge, GitHub or GitLab like pull requests headers.
   * When a merge header is parsed, the next line is used for conventional header parsing.
   */
  mergePattern?: RegExp;
  /** Used to define what capturing group of `mergePattern`. */
  mergeCorrespondence?: string[];
  /** Pattern to match what this commit reverts. */
  revertPattern?: RegExp;
  /**
   * Used to define what a capturing group of `revertPattern` captures what reverted commit fields.
   * The order of the array should correspond to the order of `revertPattern`'s capturing group.
   */
  revertCorrespondence?: string[]
  /** Pattern to match other fields. */
  fieldPattern?: RegExp
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
  fields: RegExp;
  mentions: RegExp;
  merge: RegExp;
  notes: RegExp;
  references: RegExp;
  referencesParts: RegExp;
}
