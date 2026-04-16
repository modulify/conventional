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
      entry: {
        'cli': resolve(__dirname, './src/cli.ts'),
        'index': resolve(__dirname, './src/index.ts'),
      },
    },
    minify: false,
    rolldownOptions: {
      external: isExternal,
      output: [
        {
          assetFileNames: 'dist/assets/[name]-[hash][extname]',
          dir: join(__dirname),
          entryFileNames: ({ name }) => name === 'cli'
              ? 'bin/cli.mjs'
              : 'dist/[name].mjs',
          exports: 'named',
          format: 'es',
          preserveModules: true,
          preserveModulesRoot: 'src',
        },
        {
          assetFileNames: 'dist/assets/[name]-[hash][extname]',
          dir: join(__dirname),
          entryFileNames: ({ name }) => name === 'cli'
            ? 'bin/cli.cjs'
            : 'dist/[name].cjs',
          exports: 'named',
          format: 'cjs',
          preserveModules: true,
          preserveModulesRoot: 'src',
        },
      ],
    },
  },

  plugins: [
    dts({
      entryRoot: 'src',
      exclude: [
        'bin/**/*.*',
        'src/cli.ts',
        'src/cli/**/*.*',
        'scripts/**/*.*',
        'tests/**/*.*',
      ],
      staticImport: true,
      tsconfigPath: './tsconfig.build.json',
    }),
  ],
}))
