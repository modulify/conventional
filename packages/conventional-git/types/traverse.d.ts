import type { Commit, CommitRecord, CommitRevert } from './commit'
import type { ParseOptions } from './parse'
import type { GitLogOptions } from '@modulify/git-toolkit/types/git'

export interface TraverseRange {
  from: string | null;
  to: string;
  tagPrefix?: string | RegExp;
}

export interface TraverseCommitStats {
  total: number;
}

export interface TraverseContext {
  cwd?: string;
  range: TraverseRange;
  commits: TraverseCommitStats;
}

export interface Traverser<
  TResult = unknown,
  TRevert extends CommitRecord = CommitRevert,
  TFields extends CommitRecord = CommitRecord,
  TMeta extends CommitRecord = CommitRecord,
> {
  name: string;
  onStart?(context: TraverseContext): Promise<void> | void;
  onCommit?(commit: Commit<TRevert, TFields, TMeta>, context: TraverseContext): Promise<void> | void;
  onComplete?(context: TraverseContext): Promise<TResult> | TResult;
}

export interface TraverseOptions<
  TRevert extends CommitRecord = CommitRevert,
  TFields extends CommitRecord = CommitRecord,
  TMeta extends CommitRecord = CommitRecord,
> extends Omit<GitLogOptions, 'from' | 'to'> {
  changeset?: boolean;
  traversers: Traverser<unknown, TRevert, TFields, TMeta>[];
  fromTag?: string;
  tagPrefix?: string | RegExp;
  toRef?: string;
  ignore?: RegExp;
  parse?: ParseOptions<TRevert, TFields, TMeta>;
}

export interface TraverseResult {
  range: TraverseRange;
  commits: TraverseCommitStats;
  results: ReadonlyMap<string, unknown>;
}
