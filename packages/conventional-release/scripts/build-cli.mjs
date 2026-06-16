import {
  readdirSync,
  chmodSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const bin = join(root, 'bin')
const dist = join(root, 'dist')
const esmFile = join(bin, 'index.js')
const cjsFile = join(bin, 'index.cjs')

if (process.argv.includes('--prepare')) {
  rmSync(bin, { recursive: true, force: true })
  rmSync(dist, { recursive: true, force: true })

  for (const entry of readdirSync(root)) {
    if (/^src-[A-Za-z0-9_-]+\.(?:cjs|js|mjs)$/.test(entry)) {
      rmSync(join(root, entry), { force: true })
    }
  }

  process.exit(0)
}

mkdirSync(bin, { recursive: true })
writeFileSync(esmFile, `#!/usr/bin/env node

import { main } from './cli.mjs'

function flush (stream) {
  return new Promise((resolve) => {
    if (!stream.writable) {
      resolve()
      return
    }

    stream.write('', () => resolve())
  })
}

async function exit (code) {
  process.exitCode = code
  await Promise.all([
    flush(process.stdout),
    flush(process.stderr),
  ])
  process.exit(code)
}

try {
  await main(process.argv)
  await exit(0)
} catch {
  await exit(1)
}
`)
writeFileSync(cjsFile, `#!/usr/bin/env node

const { main } = require('./cli.cjs')

function flush (stream) {
  return new Promise((resolve) => {
    if (!stream.writable) {
      resolve()
      return
    }

    stream.write('', () => resolve())
  })
}

async function exit (code) {
  process.exitCode = code
  await Promise.all([
    flush(process.stdout),
    flush(process.stderr),
  ])
  process.exit(code)
}

Promise.resolve(main(process.argv))
  .then(() => exit(0))
  .catch(() => exit(1))
`)
chmodSync(esmFile, 0o755)
chmodSync(cjsFile, 0o755)
