import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { PassThrough } from 'node:stream'

import {
  join,
  resolve,
} from 'node:path'

import { randomUUID } from 'node:crypto'

import fs from 'node:fs'

const __temporary = join(__dirname, 'tmp')

describe('output', () => {
  let cwd: string

  afterEach(() => {
    vi.doUnmock('node:fs')
    vi.resetModules()

    try {
      if (cwd) {
        fs.rmSync(cwd, { recursive: true })
      }

      if (fs.existsSync(__temporary) && !fs.readdirSync(__temporary).length) {
        fs.rmdirSync(__temporary)
      }
    } catch { /* empty */ }
  })

  it('handles body stream errors and removes temp file', async () => {
    cwd = join(__temporary, randomUUID())
    fs.mkdirSync(cwd, { recursive: true })

    const changelog = resolve(cwd, 'CHANGELOG.md')
    fs.writeFileSync(changelog, 'Existing release notes\n')

    vi.doMock('node:fs', async () => {
      const actual = await vi.importActual<typeof import('node:fs')>('node:fs')

      return {
        ...actual,
        createReadStream: () => {
          const stream = new PassThrough()

          process.nextTick(() => {
            stream.emit('error', 'Read failed')
          })

          return stream
        },
      }
    })

    const { createFileWritable } = await import('@/output')
    const writable = createFileWritable(changelog, '')

    const result = new Promise<void>((resolve, reject) => {
      writable.on('finish', resolve)
      writable.on('error', reject)
      writable.end('')
    })

    await expect(result).rejects.toThrow('Read failed')
  })

  it('writes changes without extra separator when header is empty', async () => {
    cwd = join(__temporary, randomUUID())
    fs.mkdirSync(cwd, { recursive: true })

    const changelog = resolve(cwd, 'CHANGELOG.md')
    const { createFileWritable } = await import('@/output')
    const writable = createFileWritable(changelog, '')

    await new Promise<void>((resolve, reject) => {
      writable.on('finish', resolve)
      writable.on('error', reject)
      writable.end('Entry')
    })

    expect(fs.readFileSync(changelog, 'utf8')).toBe('Entry\n\n')
  })
})
