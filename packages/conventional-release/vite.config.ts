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

const packages = [
  ...Object.keys(dependencies),
  ...Object.keys(peerDependencies),
]

function isExternal (id: string) {
  return /^node:[a-zA-Z]+/.test(id)
    || packages.some((name) => id === name || id.startsWith(`${name}/`))
}

export default mergeConfig(common, defineConfig({
  build: {
    lib: {
      name,
      formats: ['es', 'cjs'],
      entry: {
        'cli': resolve(__dirname, './src/cli.ts'),
        'index': resolve(__dirname, './src/index.ts'),
      },
      fileName: (format, entryName) => {
        const ext = {
          es: 'mjs',
          cjs: 'cjs',
        }[format as 'es' | 'cjs']

        if (entryName === 'cli') {
          return `bin/cli.${ext}`
        }

        return `dist/${entryName}.${ext}`
      },
    },
    minify: false,
    rollupOptions: {
      external: isExternal,
      output: {
        exports: 'named',
        dir: join(__dirname),
      },
    },
  },

  plugins: [
    dts({
      exclude: [
        'bin/**/*.*',
        'src/cli.ts',
        'src/cli/**/*.*',
        'scripts/**/*.*',
        'tests/**/*.*',
      ],
      staticImport: true,
    }),
  ],
}))
