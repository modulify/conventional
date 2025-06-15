import {
  defineConfig,
  mergeConfig,
} from 'vitest/config'

import common from './vite.config.common'

export default mergeConfig(common, defineConfig({
  test: {
    coverage: {
      provider: 'istanbul',
      include: ['src/**'],
    },
  },
}))
