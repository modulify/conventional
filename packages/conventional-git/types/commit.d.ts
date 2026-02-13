export type CommitValue = string | null
export type CommitRecord = Record<string, CommitValue>

export type CommitRevert = {
  header: string | null;
  hash: string | null;
}

export interface Commit<
  TRevert extends CommitRecord = CommitRevert,
  TFields extends CommitRecord = CommitRecord,
  TMeta extends CommitRecord = CommitRecord,
> {
  hash: string | null;
  type: string | null;
  scope: string | null;
  subject: string | null;
  merge: string | null;
  revert: TRevert | null;
  header: string | null;
  body: string | null;
  footer: string | null;
  notes: CommitNote[];
  mentions: string[];
  references: CommitReference[];
  fields: TFields;
  meta: TMeta;
}

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
