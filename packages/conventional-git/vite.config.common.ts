import { defineConfig } from 'vite'
import { join } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': join(__dirname, './src/'),
      '~tests': join(__dirname, './tests/'),
      '~types': join(__dirname, './types/'),
    },
  },
})
