import { defineConfig } from 'rollup'
import alias from '@rollup/plugin-alias'
import typescript from '@rollup/plugin-typescript'
import commonjs from '@rollup/plugin-commonjs'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import terser from '@rollup/plugin-terser'
import babel from '@rollup/plugin-babel'

import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const extensions = ['.js', '.ts']

const resolveAlias = () => alias({
  entries: [
    { find: '@', replacement: path.resolve(__dirname, 'src') }
  ]
})

export default defineConfig([
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/index.esm.js',
        format: 'esm',
        exports: 'named',
        // sourcemap: 'inline',
      },
    ],
    external: [/@babel\/runtime/],
    plugins: [
      resolveAlias(),
      nodeResolve({ extensions }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        exclude: ['node_modules/**'],
      }),
      babel({
        extensions,
        babelHelpers: 'runtime',
        exclude: 'node_modules/**',
        skipPreflightCheck: true,
      }),
      terser(),
    ],
  },
])
