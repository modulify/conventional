import { ReleaseAdvisor } from '@/index'

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'

import { execSync } from 'node:child_process'

import {
  join,
  resolve,
} from 'node:path'

import { randomUUID } from 'node:crypto'

import fs from 'fs'

const __temporary = join(__dirname, 'tmp')

describe('ReleaseAdvisor', () => {
  let cwd: string

  const exec = (command: string) => execSync(command, {
    cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
  })

  const lastHash = () => exec('git rev-parse HEAD').trim()

  beforeEach(() => {
    cwd = join(__temporary, randomUUID())

    fs.mkdirSync(cwd, { recursive: true })
    fs.mkdirSync(resolve(cwd, 'git-templates'))

    exec('git init --template=./git-templates --initial-branch=main')
    exec('git config user.name "Tester"')
    exec('git config user.email "tester.modulify@gmail.com"')
  })

  afterEach(() => {
    try {
      if (cwd) {
        fs.rmSync(cwd, { recursive: true })
      }

      if (!fs.readdirSync(__temporary).length) {
        fs.rmdirSync(__temporary)
      }
    } catch { /* empty */ }
  })

  it('creates release recommendation', async () => {
    const advisor = new ReleaseAdvisor({ cwd })

    exec('git commit -m "feat: Added feature #1" --allow-empty --no-gpg-sign')
    exec('git commit -m "feat: Added feature #2" --allow-empty --no-gpg-sign')
    exec('git tag v1.0.0')

    exec('git commit -m "feat: Added feature #3" --allow-empty --no-gpg-sign')
    exec('git commit -m "feat: Added feature #4" --allow-empty --no-gpg-sign')
    exec('git commit -m "fix: Fixed issue #5" --allow-empty --no-gpg-sign')

    const recommendation = await advisor.advise()

    expect(recommendation).not.toBeNull()
    expect(recommendation!.type).toBe('minor')
  })

  it('creates release recommendation for breaking changes', async () => {
    const advisor = new ReleaseAdvisor({ cwd })

    exec('git commit -m "feat: Added feature #1" --allow-empty --no-gpg-sign')
    exec('git commit -m "feat: Added feature #2" --allow-empty --no-gpg-sign')
    exec('git tag v1.0.0')

    exec('git commit -m "feat!: Added feature #3" --allow-empty --no-gpg-sign')

    const recommendation = await advisor.advise()

    expect(recommendation).not.toBeNull()
    expect(recommendation!.type).toBe('major')
  })

  it('ignores reverted commits when creating recommendation', async () => {
    const advisor = new ReleaseAdvisor({ cwd })

    exec('git commit -m "feat: Base feature" --allow-empty --no-gpg-sign')
    exec('git tag v1.0.0')

    exec('git commit -m "feat: Added feature #A" --allow-empty --no-gpg-sign')
    exec(`git commit -m 'Revert "feat: Added feature #A"' -m 'This reverts commit ${lastHash()}.' --allow-empty --no-gpg-sign`)

    const recommendation = await advisor.advise()

    expect(recommendation).not.toBeNull()
    expect(recommendation!.type).toBe('patch')
  })

  it('restores feature after revert of revert', async () => {
    const advisor = new ReleaseAdvisor({ cwd })

    exec('git commit -m "feat: Initial" --allow-empty --no-gpg-sign')
    exec('git tag v1.0.0')

    exec('git commit -m "feat: Added feature #B" --allow-empty --no-gpg-sign')
    const featHash = lastHash()

    exec(`git commit -m 'Revert "feat: Added feature #B"' -m 'This reverts commit ${featHash}.' --allow-empty --no-gpg-sign`)
    const revertHash = lastHash()

    exec(`git commit -m 'Revert "Revert "feat: Added feature #B""' -m 'This reverts commit ${revertHash}.' --allow-empty --no-gpg-sign`)

    const recommendation = await advisor.advise()

    expect(recommendation).not.toBeNull()
    expect(recommendation!.type).toBe('minor')
  })

  it('handles multiple alternating reverts correctly', async () => {
    const advisor = new ReleaseAdvisor({ cwd })

    exec('git commit -m "feat: Seed" --allow-empty --no-gpg-sign')
    exec('git tag v1.0.0')

    exec('git commit -m "feat: Added feature #C" --allow-empty --no-gpg-sign')
    const featHash = lastHash()

    exec(`git commit -m 'Revert "feat: Added feature #C"' -m 'This reverts commit ${featHash}.' --allow-empty --no-gpg-sign`)
    const revert1Hash = lastHash()

    exec(`git commit -m 'Revert "Revert "feat: Added feature #C""' -m 'This reverts commit ${revert1Hash}.' --allow-empty --no-gpg-sign`)
    const revert2Hash = lastHash()

    exec(`git commit --allow-empty --no-gpg-sign -m 'Revert "Revert "Revert "feat: Added feature #C"""' -m 'This reverts commit ${revert2Hash}.'`)

    const recommendation = await advisor.advise()

    expect(recommendation).not.toBeNull()
    expect(recommendation!.type).toBe('patch')
  })
})
