import {
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

  process.exit(0)
}

mkdirSync(bin, { recursive: true })
writeFileSync(esmFile, `#!/usr/bin/env node

import { main } from './cli.mjs'

try {
  await main(process.argv)
} catch {
  process.exit(1)
}
`)
writeFileSync(cjsFile, `#!/usr/bin/env node

const { main } = require('./cli.cjs')

Promise.resolve(main(process.argv)).catch(() => {
  process.exit(1)
})
`)
chmodSync(esmFile, 0o755)
chmodSync(cjsFile, 0o755)
