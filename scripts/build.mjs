// esbuild 打包浏览器半片：CJS 输出包在 __ModuleLoader__.load 工厂里，
// react/react-dom 由 DSH 客户端运行时在物化时通过 require 提供。
import { build, context } from 'esbuild'

const watch = process.argv.includes('--watch')

const options = {
  entryPoints: ['src/client/wrap.js'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  jsx: 'automatic',
  legalComments: 'none',
  minify: true,
  outfile: 'dist/client.js',
  external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  banner: {
    js: "window.__ModuleLoader__.load({ id: 'dsh-funhub', factory(require) {\nconst module = { exports: {} }\nconst exports = module.exports\n",
  },
  footer: {
    js: '\nreturn module.exports\n} })',
  },
  logLevel: 'info',
}

if (watch) {
  const ctx = await context(options)
  await ctx.watch()
  console.log('[funhub] watching client build…')
} else {
  await build(options)
}
