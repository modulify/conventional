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
    } catch { /* empty */
    }
  })

  it('creates release recommendation', async () => {
    const advisor = new ReleaseAdvisor({ cwd })

    exec('git commit -m "feat: Added feature #1" --allow-empty --no-gpg-sign')
    exec('git commit -m "feat: Added feature #2" --allow-empty --no-gpg-sign')
    exec('git tag v1.0.0')

    exec('git commit -m "feat: Added feature #3" --allow-empty --no-gpg-sign')
    exec('git commit -m "feat: Added feature #4" --allow-empty --no-gpg-sign')
    exec('git commit -m "fix: Fixed issue #5" --allow-empty --no-gpg-sign')

    expect(await advisor.advise()).toEqual(
      expect.objectContaining({ type: 'minor' })
    )
  })

  it('creates release recommendation for breaking changes', async () => {
    const advisor = new ReleaseAdvisor({ cwd })

    exec('git commit -m "feat: Added feature #1" --allow-empty --no-gpg-sign')
    exec('git commit -m "feat: Added feature #2" --allow-empty --no-gpg-sign')
    exec('git tag v1.0.0')

    exec('git commit -m "feat!: Added feature #3" --allow-empty --no-gpg-sign')

    expect(await advisor.advise()).toEqual(
      expect.objectContaining({ type: 'major' })
    )
  })

  it('ignores reverted commits when creating recommendation', async () => {
    const advisor = new ReleaseAdvisor({ cwd })

    exec('git commit -m "feat: Base feature" --allow-empty --no-gpg-sign')
    exec('git tag v1.0.0')

    exec('git commit -m "feat: Added feature #A" --allow-empty --no-gpg-sign')
    exec(`git commit -m 'Revert "feat: Added feature #A"' -m 'This reverts commit ${lastHash()}.' --allow-empty --no-gpg-sign`)

    expect(await advisor.advise()).toEqual(
      expect.objectContaining({ type: 'patch' })
    )
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

    expect(await advisor.advise()).toEqual(
      expect.objectContaining({ type: 'minor' })
    )
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

    expect(await advisor.advise()).toEqual(
      expect.objectContaining({ type: 'patch' })
    )
  })

  it('supports strict mode', async () => {
    const advisor = new ReleaseAdvisor({ cwd })

    exec('git commit -m "chore: some chore" --allow-empty --no-gpg-sign')

    expect(await advisor.advise({ strict: true })).toBeNull()

    exec('git commit -m "fix: some fix" --allow-empty --no-gpg-sign')

    expect(await advisor.advise({ strict: true })).toEqual(
      expect.objectContaining({ type: 'patch' })
    )
  })

  it('supports preMajor mode', async () => {
    const advisor = new ReleaseAdvisor({ cwd })

    exec('git commit -m "feat: some feature" --allow-empty --no-gpg-sign')

    expect(await advisor.advise({ preMajor: true })).toEqual(
      expect.objectContaining({ type: 'patch' })
    )

    exec('git commit -m "feat!: breaking feature" --allow-empty --no-gpg-sign')

    expect(await advisor.advise({ preMajor: true })).toEqual(
      expect.objectContaining({ type: 'minor' })
    )
  })

  it('supports custom hidden types in strict mode', async () => {
    const advisor = new ReleaseAdvisor({
      cwd,
      types: [
        { type: 'feat', section: 'Features' },
        { type: 'custom', section: 'Custom', hidden: true },
      ],
    })

    exec('git commit -m "custom: hidden change" --allow-empty --no-gpg-sign')

    expect(await advisor.advise({ strict: true })).toBeNull()

    exec('git commit -m "feat: visible change" --allow-empty --no-gpg-sign')

    expect(await advisor.advise({ strict: true })).toEqual(
      expect.objectContaining({ type: 'minor' })
    )
  })

  describe('next', () => {
    it('returns next version based on recommendation', async () => {
      const advisor = new ReleaseAdvisor({ cwd })

      exec('git commit -m "feat: some feature" --allow-empty --no-gpg-sign')

      expect(await advisor.next('1.0.0')).toEqual({
        type: 'minor',
        version: '1.1.0',
      })
    })

    it('supports forced version type', async () => {
      const advisor = new ReleaseAdvisor({ cwd })

      expect(await advisor.next('1.0.0', { type: 'major' })).toEqual({
        type: 'major',
        version: '2.0.0',
      })
    })

    it('supports prerelease', async () => {
      const advisor = new ReleaseAdvisor({ cwd })

      exec('git commit -m "feat: some feature" --allow-empty --no-gpg-sign')

      expect(await advisor.next('1.0.0', { prerelease: 'alpha' })).toEqual({
        type: 'preminor',
        version: '1.1.0-alpha.1',
      })
    })

    it('handles prerelease to stable transition', async () => {
      const advisor = new ReleaseAdvisor({ cwd })

      exec('git commit -m "fix: some fix" --allow-empty --no-gpg-sign')

      expect(await advisor.next('1.1.0-alpha.1', { prerelease: 'alpha' })).toEqual(
        expect.objectContaining({ version: '1.1.0-alpha.2' })
      )
    })

    it('handles major prerelease', async () => {
      const advisor = new ReleaseAdvisor({ cwd })

      exec('git commit -m "feat!: breaking" --allow-empty --no-gpg-sign')

      expect(await advisor.next('1.0.0', { prerelease: 'beta' })).toEqual({
        type: 'premajor',
        version: '2.0.0-beta.1',
      })
    })

    it('handles unknown recommendation', async () => {
      const advisor = new ReleaseAdvisor({ cwd })

      exec('git commit -m "chore: some chore" --allow-empty --no-gpg-sign')

      expect(await advisor.next('1.0.0')).toEqual({
        type: 'patch',
        version: '1.0.1',
      })
    })

    it('handles invalid version', async () => {
      const advisor = new ReleaseAdvisor({ cwd })

      exec('git commit -m "feat: some feature" --allow-empty --no-gpg-sign')

      expect(await advisor.next('invalid-version')).toEqual(
        expect.objectContaining({ version: 'invalid-version' })
      )
    })

    it('uses loose semver if option provided', async () => {
      const advisor = new ReleaseAdvisor({ cwd })

      exec('git commit -m "feat: some feature" --allow-empty --no-gpg-sign')

      expect(await advisor.next('v1.0.0', { loose: true })).toEqual(
        expect.objectContaining({ version: '1.1.0' })
      )
    })

    it('detects type of version, automatically calculates if it is pre-major', async () => {
      const advisor = new ReleaseAdvisor({ cwd })

      exec('git commit -m "feat: some feature" --allow-empty --no-gpg-sign')

      expect(await advisor.next('1.1.0', { prerelease: 'alpha' })).toEqual({
        type: 'preminor',
        version: '1.2.0-alpha.1',
      })

      expect(await advisor.next('1.1.1', { prerelease: 'alpha' })).toEqual({
        type: 'preminor',
        version: '1.2.0-alpha.1',
      })

      expect(await advisor.next('0.0.1', { prerelease: 'alpha' })).toEqual({
        type: 'prepatch',
        version: '0.0.2-alpha.1',
      })

      expect(await advisor.next('0.1.0', { prerelease: 'alpha' })).toEqual({
        type: 'prepatch',
        version: '0.1.1-alpha.1',
      })
    })
  })
})
