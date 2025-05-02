export interface Commit {
  type: string | null;
  scope: string | null;
  subject: string | null;
  merge: string | null;
  revert: CommitMeta | null;
  header: string | null;
  body: string | null;
  footer: string | null;
  notes: CommitNote[];
  mentions: string[];
  references: CommitReference[];
  fields: CommitMeta;
  meta: CommitMeta;
}

export type CommitMeta = Record<string, string | null>

export interface CommitNote {
  title: string;
  text: string;
}

export interface CommitReference {
  raw: string;
  action: string | null;
  owner: string | null;
  repository: string | null;
  issue: string;
  prefix: string;
}
