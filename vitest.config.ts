import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        coverage: {
            provider: 'istanbul',
            include: ['packages/*/src/**'],
            exclude: ['**/*.njk'],
        },
        projects: ['packages/*'],
    },
})
