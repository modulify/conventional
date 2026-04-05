import { defineConfig } from 'vitest/config'
import { join } from 'node:path'

import { coverage } from './vitest.common'

export default defineConfig({
    cacheDir: join(__dirname, 'artifacts/vite'),
    test: {
        coverage: {
            ...coverage,
            include: ['packages/*/src/**'],
            exclude: ['**/*.njk'],
        },
        projects: ['packages/*'],
    },
})
