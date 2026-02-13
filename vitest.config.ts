import { defineConfig } from 'vitest/config'
import { join } from 'node:path'
import { coverageThresholds } from './vitest.workspace.base'

export default defineConfig({
    cacheDir: join(__dirname, 'artifacts/vite/root'),
    test: {
        server: {
            deps: {
                cacheDir: join(__dirname, 'artifacts/vite/root-deps'),
            },
        },
        coverage: {
            provider: 'istanbul',
            include: ['packages/*/src/**'],
            exclude: ['**/*.njk'],
            thresholds: coverageThresholds,
        },
        projects: ['packages/*'],
    },
})
