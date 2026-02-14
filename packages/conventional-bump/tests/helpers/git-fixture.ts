import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import {
  join,
  resolve,
} from 'node:path'

type GitFixtureStep = {
  patch: string
  message: string
  tags?: string[]
}

type GitFixtureScenario = {
  description?: string
  steps: GitFixtureStep[]
}

const FIXTURES_ROOT = join(__dirname, '../__fixtures__/git-history')

function readScenario (fixture: string): {
  root: string
  scenario: GitFixtureScenario
} {
  const root = join(FIXTURES_ROOT, fixture)
  const path = join(root, 'scenario.json')

  if (!fs.existsSync(path)) {
    throw new Error(`Fixture scenario was not found: ${path}`)
  }

  const scenario = JSON.parse(
    fs.readFileSync(path, 'utf-8')
  ) as GitFixtureScenario

  if (!Array.isArray(scenario.steps) || !scenario.steps.length) {
    throw new Error(`Fixture scenario has no steps: ${path}`)
  }

  return { root, scenario }
}

export function applyGitFixture ({ cwd, fixture }: {
  cwd: string
  fixture: string
}) {
  const { root, scenario } = readScenario(fixture)

  for (const [index, step] of scenario.steps.entries()) {
    if (!step.patch || !step.message) {
      throw new Error(`Fixture step ${index + 1} is invalid in ${fixture}`)
    }

    const patchPath = resolve(root, step.patch)

    if (!fs.existsSync(patchPath)) {
      throw new Error(`Fixture patch was not found: ${patchPath}`)
    }

    execFileSync('git', [ 'apply', '--index', patchPath ], {
      cwd,
      stdio: 'pipe',
    })

    execFileSync('git', [ 'commit', '-m', step.message, '--no-gpg-sign' ], {
      cwd,
      stdio: 'pipe',
    })

    for (const tag of step.tags ?? []) {
      execFileSync('git', [ 'tag', tag ], {
        cwd,
        stdio: 'pipe',
      })
    }
  }
}
