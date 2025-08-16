import {
  defineConfig,
  mergeConfig,
} from 'vite'

import {
  join,
  resolve,
} from 'node:path'

import dts from 'vite-plugin-dts'

import common from './vite.config.common'

import {
  name,
} from './package.json'

import {
  dependencies,
  peerDependencies,
} from './package.json'

export default mergeConfig(common, defineConfig({
  build: {
    lib: {
      name,
      formats: ['es', 'cjs'],
      entry: {
        'index': resolve(__dirname, './src/index.ts'),
      },
      fileName: (format, name) => `${name}.${{
        es: 'mjs',
        cjs: 'cjs',
      }[format as 'es' | 'cjs']}`,
    },
    minify: false,
    rollupOptions: {
      external: [
        /node:[a-zA-Z]*/,
        ...Object.keys(dependencies),
        ...Object.keys(peerDependencies),
      ],
      output: {
        exports: 'named',
        dir: join(__dirname, '/dist'),
      },
    },
  },

  plugins: [
    dts({
      exclude: [
        'scripts/**/*.*',
        'tests/**/*.*',
      ],
      staticImport: true,
    }),
  ],
}))
