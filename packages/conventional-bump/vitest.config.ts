import {
  defineConfig,
  mergeConfig,
} from 'vitest/config'
import { join } from 'node:path'

import common from './vite.config.common'

export default mergeConfig(common, defineConfig({
  test: {
    server: {
      deps: {
        cacheDir: join(__dirname, '../../artifacts/vite/conventional-bump-deps'),
      },
    },
    coverage: {
      provider: 'istanbul',
      include: ['src/**'],
    },
  },
}))
