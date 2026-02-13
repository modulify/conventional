import { defineConfig } from 'vite'
import { join } from 'node:path'

export default defineConfig({
  cacheDir: join(__dirname, '../../artifacts/vite/conventional-changelog'),
  resolve: {
    alias: {
      '@': join(__dirname, './src/'),
      '~tests': join(__dirname, './tests/'),
      '~types': join(__dirname, './types/'),
    },
  },
})
