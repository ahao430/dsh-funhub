// jsdom 复现：完整挂载客户端（含 effect 执行），用真实存档形态进入推箱子，抓渲染/运行时错误。
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import esbuild from 'esbuild'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://127.0.0.1:1/',
  pretendToBeVisual: true,
})
const { window } = dom
for (const k of ['window', 'document', 'localStorage', 'HTMLElement', 'Element', 'Node', 'getComputedStyle', 'CustomEvent', 'Event', 'ResizeObserver', 'MutationObserver', 'Image']) {
  if (window[k] !== undefined) {
    try { globalThis[k] = window[k] } catch { /* 只读属性跳过 */ }
  }
}
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16)
window.cancelAnimationFrame = (id) => clearTimeout(id)
globalThis.requestAnimationFrame = window.requestAnimationFrame
globalThis.cancelAnimationFrame = window.cancelAnimationFrame
window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
globalThis.matchMedia = window.matchMedia

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const errors = []
window.addEventListener('error', (e) => errors.push('window.onerror: ' + (e.error?.stack || e.message)))
const origErr = console.error
console.error = (...args) => { errors.push('console.error: ' + args.map((a) => (a?.stack || String(a))).join(' ').slice(0, 500)); origErr(...args) }

/* ---- 真实形态 boot 数据（含用户当前 sokoban 存档） ---- */
const realState = JSON.parse(readFileSync('/Users/wanghao/.dsh/funhub/state.json', 'utf8'))
const boot = {
  version: 1,
  settings: (realState.settings || {}),
  layout: realState.layout || [],
  favorites: [], shelf: [], readingProgress: {}, novelHistory: [], comicHistory: [],
  comicFavs: [], comicProgress: {}, comics: [], imageHistory: [],
  tracks: [], playlists: [], playbackHistory: [], rss: { feeds: [], articles: [] },
  gameRecords: realState.gameRecords || {},
  gameFavs: [],
  bookSources: [], lxSources: [], comicSources: [],
  music: { quality: '320k', channel: 'wy' },
}
globalThis.fetch = async (url, init) => {
  const u = String(url)
  if (u.includes('/funhub/api/state')) return { ok: true, json: async () => ({ ok: true, state: boot }) }
  if (u.includes('/funhub/api/op')) return { ok: true, json: async () => ({ ok: true, result: {} }) }
  if (u.includes('/funhub/api/asset/')) return { ok: false, status: 404, json: async () => ({}) }
  return { ok: true, json: async () => ({ ok: true }) }
}

/* ---- 打包并挂载 AppShell ---- */
const bundle = await esbuild.build({
  stdin: { contents: `export { AppShell } from ${JSON.stringify(new URL('../src/client/app.jsx', import.meta.url).pathname)}\nexport { actions, getState } from ${JSON.stringify(new URL('../src/client/store.js', import.meta.url).pathname)}`, resolveDir: new URL('.', import.meta.url).pathname },
  loader: { '.jsx': 'jsx' },
  bundle: true, format: 'esm', jsx: 'automatic',
  external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  write: false, logLevel: 'silent',
})
const { writeFileSync } = await import('node:fs')
writeFileSync('node_modules/.render-test/jsdom-bundle.mjs', bundle.outputFiles[0].text)

const React = (await import('react')).default
const { createRoot } = await import('react-dom/client')
const { AppShell, actions, getState } = await import('../node_modules/.render-test/jsdom-bundle.mjs')

const root = createRoot(window.document.getElementById('root'))
await React.act(async () => {
  root.render(React.createElement(AppShell))
  await new Promise((r) => setTimeout(r, 120)) // 等 refresh 完成
})
console.log('挂载完成 ready=', getState().ready, '| 渲染错误:', errors.length)

await React.act(async () => {
  actions.openGame('sokoban')
  await new Promise((r) => setTimeout(r, 200)) // 等 GameSokoban 全部 effect 跑完
})

// 模拟玩家操作：方向键走两步 + 推箱 + 撤销 + 切关
await React.act(async () => {
  for (const key of ['ArrowRight', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'z']) {
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }))
    await new Promise((r) => setTimeout(r, 30))
  }
  // 点「下关」按钮
  const btns = [...window.document.querySelectorAll('button')].filter((b) => b.textContent.includes('下关'))
  btns[0]?.click()
  await new Promise((r) => setTimeout(r, 120))
})
const html = window.document.getElementById('root').innerHTML
const hasBoard = html.includes('fh-soko-board')
// 抓游戏台内的 ErrorBoundary 回退内容
const m = html.match(/推箱子[\s\S]{0,80}?(重试|退出)?[\s\S]{0,400}/)
const boundaryText = (html.split('fh-game-body')[1] || '').slice(0, 600)
console.log('进入推箱子: 棋盘渲染=', hasBoard, '| 游戏台内容:', boundaryText.slice(0, 300))
console.log('累计 JS 错误:', errors.length)
for (const e of errors.slice(0, 8)) console.log('---', e.slice(0, 300))
console.log('交互后步数文本:', (html.match(/👣 [0-9]+/) || ['?'])[0], '| 关卡:', (html.match(/第 [0-9]+ \/ 30 关/) || ['?'])[0])
process.exit(hasBoard && !errors.length ? 0 : 1)
