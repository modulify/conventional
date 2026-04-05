import { join } from 'node:path'
import { mergeConfig } from 'vitest/config'

import { coverage } from '../../vitest.common'

import common from './vite.config.common'

export default mergeConfig(common, {
  resolve: {
    alias: {
      '@modulify/conventional-git': join(__dirname, '../conventional-git/src/index.ts'),
    },
  },
  test: {
    server: {
      deps: { cacheDir: join(__dirname, 'artifacts/vitest') },
    },
    coverage: {
      ...coverage,
      include: ['src/**'],
      exclude: ['src/**/*.njk'],
    },
  },
})
