import { defineConfig } from 'vitest/config'
import { join } from 'node:path'

export const coverageThresholds = Object.freeze({
  statements: 100,
  branches: 100,
  functions: 100,
  lines: 100,
})

export function createWorkspaceVitestConfig ({
  workspace,
  include,
  exclude,
}: {
  workspace: string;
  include: string[];
  exclude?: string[];
}) {
  return defineConfig({
    test: {
      server: {
        deps: {
          cacheDir: join(__dirname, `artifacts/vite/${workspace}-deps`),
        },
      },
      coverage: {
        provider: 'istanbul',
        include,
        exclude,
        thresholds: coverageThresholds,
      },
    },
  })
}
