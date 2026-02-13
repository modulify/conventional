# Contributing

Thanks for contributing to `modulify/conventional`.

This document describes our expectations for contribution quality.  
We keep a high engineering bar in this repository and expect the same level of
discipline from every contribution.

## Repository Context

`modulify/conventional` is a Yarn workspaces monorepo:

- `packages/conventional-git`
- `packages/conventional-bump`
- `packages/conventional-changelog`

We treat workspace boundaries as an important design constraint.  
Changes are expected to stay well-scoped and logically separated.

## Local Setup

Before working on changes, we use:

```bash
make .yarnrc.yml
yarn install
```

## Quality Expectations

Before handoff or PR, we expect the contribution to pass:

- Tests:
```bash
make test
```
- Coverage:
```bash
make test-coverage
```
- Type checks:
```bash
make typecheck
```
- Eslint when changed files include linted code (`*.ts`, `*.js`, etc.):
```bash
make eslint
```

Coverage thresholds are strict and enforced in configuration:
- `100%` statements
- `100%` branches
- `100%` functions
- `100%` lines

External contributions that reduce coverage quality are not accepted.

## Definition of Done

A contribution is considered done when all points below are satisfied:

- The change is scoped clearly to the intended workspace and behavior.
- Required checks pass (`test`, `test-coverage`, `typecheck`, and `eslint` when applicable).
- Documentation is updated when behavior or public API changed.
- Commits are split by logical intent and workspace boundaries.

## Coverage Philosophy

Coverage in this repository is a quality gate, not a vanity metric.

For external contributions, we expect this order of work:

1. Cover real public API scenarios first.
2. Add missing realistic scenarios that were overlooked.
3. Treat remaining uncovered code as a quality signal:
   - potential bug source,
   - redundant/dead logic,
   - architecture smell.
4. Add controlled failure scenarios for defensive branches.
5. Prefer removing redundant logic or improving architecture over artificial tests for impossible paths.

This philosophy is codified in:
- `skills/coverage-recovery/SKILL.md`

## Practical Advice For AI Pairing

When working with AI agents in this repository, do not make your agents walk in circles.

If progress stalls after reasonable attempts, ask for escalation instead of another brute-force pass:

1. Request an exact report of uncovered paths and why they remain.
2. Ask for concrete options and tradeoffs:
   - keep defensive code and accept the gap,
   - refactor architecture for testability,
   - remove redundant/impossible branches.
3. Make the architecture decision explicitly before continuing.

Final decisions on controversial architectural tradeoffs remain with the human developer.

## Flaky Tests

Flaky tests are not acceptable in external contributions.

- Do not submit known flaky behavior.
- Do not mark unstable behavior as acceptable because coverage passes.
- Stabilize the scenario before expecting review/merge.

## PR Checklist

Before opening or updating a PR, verify:

- [ ] Scope is correct and workspace boundaries are respected.
- [ ] Public API behavior is covered by tests.
- [ ] `make typecheck` passes.
- [ ] `make test-coverage` passes.
- [ ] `make eslint` passes when linted code files were changed.
- [ ] Related docs are updated.
- [ ] Commit messages follow repository conventions.

## Commit Rules

We expect all commits to follow repository conventions:

- Conventional Commits format.
- English commit messages by default.
- Completed historical wording (concise, changelog-friendly).
- Workspace scope for workspace-local changes:
  - `conventional-git`
  - `conventional-bump`
  - `conventional-changelog`
- No synthetic scope for global/manual commits (scope is usually omitted).
- Logical split by workspace and intent.
- `yarn.lock` in a separate commit with exact header:
  - `chore: Updated yarn.lock`

For detailed commit flow:
- `skills/commit-workflow/SKILL.md`
