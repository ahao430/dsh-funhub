// 终极复现：在 jsdom 里以 DSH 相同的方式加载 dist/client.js 构建产物（用户浏览器逐字节相同的代码），
// 挂载 AppShell 并进入推箱子，抓运行时错误。与源码 bundle 复现（jsdom-sokoban-repro）互补。
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dom = new JSDOM('<!doctype html><html><body><div id="main-slot"></div></body></html>', {
  url: 'http://127.0.0.1:1/',
  pretendToBeVisual: true,
})
const { window } = dom
for (const k of ['window', 'document', 'localStorage', 'HTMLElement', 'Element', 'Node', 'getComputedStyle', 'CustomEvent', 'Event', 'Image']) {
  try { if (window[k] !== undefined) globalThis[k] = window[k] } catch { /* 只读跳过 */ }
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

/* ---- 真实 boot（用户当前 sokoban 存档 level:9 cleared:8） ---- */
const realState = JSON.parse(readFileSync('/Users/wanghao/.dsh/funhub/state.json', 'utf8'))
const boot = {
  version: 1,
  settings: realState.settings || {},
  layout: realState.layout || [],
  favorites: [], shelf: [], readingProgress: {}, novelHistory: [], comicHistory: [],
  comicFavs: [], comicProgress: {}, comics: [], imageHistory: [],
  tracks: [], playlists: [], playbackHistory: [], rss: { feeds: [], articles: [] },
  gameRecords: realState.gameRecords || {},
  gameFavs: [],
  bookSources: [], lxSources: [], comicSources: [],
  music: { quality: '320k', channel: 'wy' },
}
globalThis.fetch = async (url) => {
  const u = String(url)
  if (u.includes('/funhub/api/state')) return { ok: true, json: async () => ({ ok: true, state: boot }) }
  if (u.includes('/funhub/api/op')) return { ok: true, json: async () => ({ ok: true, result: {} }) }
  return { ok: true, json: async () => ({ ok: true }) }
}

/* ---- DSH 式加载 dist/client.js：CJS 工厂 + react require 注入 ---- */
const require_ = createRequire(import.meta.url)
const reqShim = (id) => {
  const map = {
    react: 'react',
    'react-dom/client': 'react-dom/client',
    'react/jsx-runtime': 'react/jsx-runtime',
    'react/jsx-dev-runtime': 'react/jsx-dev-runtime',
  }
  return require_(map[id] || id)
}
const dist = readFileSync(new URL('../dist/client.js', import.meta.url), 'utf8')
// dist 是 window.__ModuleLoader__.load({id, factory}) 调用；捕获 factory 并执行
let factory = null
window.__ModuleLoader__ = { load: ({ factory: f }) => { factory = f } }
new Function('window', dist)(window)
if (!factory) throw new Error('未捕获到 ModuleLoader factory')
const client = factory(reqShim)
console.log('dist 加载成功，exports:', Object.keys(client))

/* ---- ctx.slots 模拟 + apply 挂载 ---- */
const roots = {}
const slots = {
  inject: (slot, reg) => { roots[slot] = reg() },
  register: (meta, comp) => ({ ...meta, comp }),
}
const logger = { info() {}, warn() {}, error() {} }
const dispose = client.apply({ slots, logger, effect: (fn) => fn() })
console.log('apply 完成, dispose:', typeof dispose)

// 主面板挂载到 jsdom
const React = require_('react')
const { createRoot } = require_('react-dom/client')
const { act } = React // React 18 的 act 从 react 拿不到（test utils），直接手动微任务推进
const host = window.document.getElementById('main-slot')
const Comp = roots.main.comp
const root = createRoot(host)
root.render(React.createElement(Comp))
await new Promise((r) => setTimeout(r, 300)) // 等 refresh/effect

// 进入推箱子：openGame 通过 store —— 从 bundle 里拿不到 actions（dist 未导出）。
// 通过 DOM 点击：先切到小游戏页（侧栏是 DSH 的；FunHub 内部导航）——找「小游戏」按钮
const clickByText = (text) => {
  const btns = [...host.querySelectorAll('button, a')]
  const b = btns.find((x) => x.textContent.trim() === text || x.textContent.includes(text))
  if (b) { b.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); return true }
  return false
}
const clickedGames = clickByText('小游戏')
await new Promise((r) => setTimeout(r, 200))
const html1 = host.innerHTML
console.log('小游戏页:', clickedGames, '| 含游戏卡片:', html1.includes('fh-game-card'))
const clickedSoko = clickByText('推箱子')
await new Promise((r) => setTimeout(r, 300))
const html2 = host.innerHTML
const hasBoard = html2.includes('fh-soko-board')
const stageText = (html2.split('fh-game-body')[1] || '').slice(0, 260)
console.log('进入推箱子: 点击=', clickedSoko, '| 棋盘=', hasBoard, '| 累计 JS 错误:', errors.length)
if (errors.length) for (const e of errors.slice(0, 5)) console.log('---', e.slice(0, 350))
console.log('游戏台片段:', stageText.slice(0, 220))
process.exit(hasBoard && !errors.length ? 0 : 1)
