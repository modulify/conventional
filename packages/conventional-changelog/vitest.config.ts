import {
  mergeConfig,
} from 'vitest/config'
import { createWorkspaceVitestConfig } from '../../vitest.workspace.base'

import common from './vite.config.common'

export default mergeConfig(common, createWorkspaceVitestConfig({
  workspace: 'conventional-changelog',
  include: ['src/**'],
  exclude: ['src/**/*.njk'],
}))
