---
name: markdown-translations
description: Use this skill when editing user-facing markdown documentation in this repository. It keeps indexed translations in sync, treats translation indexes as the source of truth, and requires translation updates for indexable markdown files in the same change.
---

# Markdown Translations

## When To Use
Use this skill when the user asks to:
- edit or add user-facing markdown documentation;
- update README, CONTRIBUTING, Code of Conduct, or similar indexed docs;
- translate markdown content;
- keep source and translated docs in sync.

## Source Of Truth
- `docs/INDEX.md`
- `packages/*/docs/INDEX.md`

These index files define which markdown documents are translation entrypoints.

## What Counts As Indexable Markdown
Indexable markdown means user-facing markdown files that are represented in a translation index.

Current examples:
- root `README.md`
- root `CONTRIBUTING.md`
- root `CODE_OF_CONDUCT.md`
- package `README.md` files that have entries under `packages/*/docs/INDEX.md`

Non-examples unless the user explicitly asks:
- fixture `README.md` files under `tests/__fixtures__`
- `AGENTS.md`
- scratch notes
- internal skill files
- markdown files not linked from a translation index

## Publishability
For link decisions, split markdown files into two groups:

- publishable markdown:
  - package `README.md` files that are included in npm package `files`
- non-publishable markdown:
  - translation files under `docs/` and `packages/*/docs/`
  - root repository docs that are not shipped inside npm packages
  - other indexed docs outside package publish payloads

Do not guess publishability from path shape alone when `package.json#files` or repository layout can be read.

## Required Rules
- When changing an indexable source markdown file, update its indexed translations in the same task.
- When adding a new user-facing indexable markdown file, add the translation entry and create the translated file in the same task unless the user explicitly says not to.
- Do not assume only Russian forever; read the relevant `INDEX.md` and update every listed translation for that document.
- Keep structure aligned across languages:
  - heading hierarchy
  - list structure
  - code blocks
  - examples
  - link targets, unless a translated path is required
- Preserve semantics first; translation may be natural, but must not add or remove product meaning.
- Do not translate:
  - package names
  - CLI flags
  - code identifiers
  - filenames/paths
  - config keys
  - commands
- If a translation cannot be completed safely, stop and report the blocker instead of leaving a silent mismatch.

## Link Policy
Use link targets based on whether the source markdown is publishable and whether the target markdown is publishable.

Rules:
- From non-publishable markdown to non-publishable markdown:
  - prefer local relative links.
- From publishable markdown to publishable markdown:
  - prefer local relative links.
- From publishable markdown to non-publishable markdown:
  - use absolute HTTP links to the canonical GitHub location on the `main` branch.
- From non-publishable markdown to publishable markdown:
  - local relative links are allowed and preferred.

Reason:
- package `README.md` is shipped to npm;
- local links from shipped `README.md` to files that are not shipped become broken in the package consumer view.

Canonical target form for GitHub-hosted docs:
- repository root docs:
  - `https://github.com/modulify/conventional/blob/main/<path>`
- package-local docs:
  - `https://github.com/modulify/conventional/blob/main/packages/<name>/<path>`

When a publishable README links to translations or other docs that are not shipped in npm, convert those links to GitHub HTTP links instead of local relative paths.
This HTTP rule is one-way only: it exists for `publishable -> non-publishable` links.
Do not mirror it back into `non-publishable -> publishable` links unless the user explicitly asks.

## Path Mapping Heuristics
- Root docs use `docs/INDEX.md`.
- Root source file to Russian translation examples:
  - `README.md` -> `docs/ru/README.md`
  - `CONTRIBUTING.md` -> `docs/ru/CONTRIBUTING.md`
  - `CODE_OF_CONDUCT.md` -> `docs/ru/CODE_OF_CONDUCT.md`
- Package docs use `packages/<name>/docs/INDEX.md`.
- Package source README to Russian translation example:
  - `packages/<name>/README.md` -> `packages/<name>/docs/ru/README.md`

Do not infer translated paths from memory when the matching `INDEX.md` can be read.

## Workflow
1. Detect touched markdown files.
2. Check whether each touched markdown file is indexable by reading the nearest relevant `INDEX.md`.
3. If the file is a source document, locate every indexed translation target.
4. Update the source document first, then update each translation to match the same meaning and structure.
5. If a new indexable document is added, update the relevant `INDEX.md` and create translation files in the indexed locales.
6. Re-check markdown links using the publishability rules:
   - local for publishable -> publishable
   - local for non-publishable -> non-publishable
   - local for non-publishable -> publishable
   - HTTP for publishable -> non-publishable
7. Re-read the changed source and translation files to confirm they still match in:
   - headings
   - major sections
   - code samples
   - declared scope/non-goals
8. In handoff, mention that translations were updated when applicable.

## Practical Guidance
- Prefer small semantic diffs over free rewrites.
- When the source wording becomes clearer, carry the same clarification into translations rather than preserving old awkward phrasing.
- If only one language was edited by the user but the paired indexed file is now stale, bring the pair back into sync as part of the task.
- If the repository contains several locales in the future, update all locales listed in the index, not just the first one.
- When changing links in package `README.md`, think about the npm consumer view, not only the GitHub repository view.
- When working with translations and you hit a GitHub HTTP link that exists only because of the `publishable -> non-publishable` rule, resolve it mentally to the corresponding local document and maintain translation parity as if the link were local.

## Quick Check
Before finishing a docs task, verify:
- Was any indexable markdown file changed?
- If yes, were all indexed translations updated?
- If a new user-facing doc was added, was the index updated too?
- Does any publishable markdown file link to a non-publishable markdown file through a local relative path?
- Do source and translation still say the same thing?
