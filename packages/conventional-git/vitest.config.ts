import { join } from 'node:path'
import { mergeConfig } from 'vitest/config'

import { coverage } from '../../vitest.common'

import common from './vite.config.common'

export default mergeConfig(common, {
  test: {
    server: {
      deps: { cacheDir: join(__dirname, 'artifacts/vitest') },
    },
    coverage: {
      ...coverage,
      include: ['src/**'],
    },
  },
})
