// 客户端全局状态：宿主引导数据 + UI 视图状态，useSyncExternalStore 订阅。
import { api } from './api.js'

let state = {
  ready: false,
  error: null,
  boot: null,          // /state 返回的宿主数据（settings/layout/favorites/...）
  view: 'home',        // 当前频道：home/novel/comic/gallery/music/games/rss/favorites/settings
  settingsSection: null, // 设置页当前分区（快捷入口直达）：appearance/booksource/lxsource/comicsource/imagesource/layout/data
  novel: null,         // 阅读器会话 {mode:'legado'|'gutenberg', ...}
  comic: null,         // 漫画阅读会话
  game: null,          // 当前游戏 {id}
  galleryView: null,   // 全屏看图 {images, index}
  playerUi: 'hidden',  // hidden/mini/icon/expanded/fullscreen
  toast: null,         // {text, at}
  pendingSearch: null, // 首页欢迎区全局搜索意图 {channel, q, at}，目标频道挂载时消费
}

const listeners = new Set()

export function getState() {
  return state
}

function set(patch) {
  state = { ...state, ...patch }
  for (const fn of listeners) fn()
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export const actions = {
  /** 切换频道；view 为 settings 时可带 section 直达分区（见 settingsSection）。 */
  setView: (view, section) => {
    set({ view, settingsSection: view === 'settings' ? (section || null) : null })
    // 回首页时轻量刷新：小说/漫画阅读历史等在其它页写入的数据即时可见
    if (view === 'home') void actions.reload()
  },

  openNovel: (session) => set({ view: 'novel', novel: session }),
  closeNovel: () => set({ novel: null }),

  openComic: (session) => set({ view: 'comic', comic: session }),
  closeComic: () => set({ comic: null }),

  openGame: (id) => set({ game: id ? { id } : null }),
  openGallery: (images, index) => set({ galleryView: { images, index } }),
  closeGallery: () => set({ galleryView: null }),

  setPlayerUi: (playerUi) => set({ playerUi }),

  /** 首页欢迎区全局搜索：跳到目标频道并携带关键词，频道页挂载时 consumeSearch 取走。 */
  searchIn: (channel, q) => {
    if (!q.trim()) return
    set({ view: channel, pendingSearch: { channel, q: q.trim(), at: Date.now() } })
  },
  /** 频道页消费搜索意图（返回后即清除，避免残留）。 */
  consumeSearch: (channel) => {
    const p = state.pendingSearch
    if (p && p.channel === channel) {
      set({ pendingSearch: null })
      return p.q
    }
    return null
  },

  toast: (text) => {
    set({ toast: { text, at: Date.now() } })
    setTimeout(() => {
      if (Date.now() - state.toast?.at >= 2600) set({ toast: null })
    }, 2800)
  },

  /** 拉取宿主引导数据。 */
  refresh: async () => {
    try {
      const res = await api.get('/state')
      set({ boot: res.state, ready: true, error: null })
      return res.state
    } catch (err) {
      set({ ready: true, error: err.message })
      return null
    }
  },

  /** 写操作后局部刷新（轻量：只同步引导数据）。 */
  reload: async () => {
    try {
      const res = await api.get('/state')
      set({ boot: res.state })
      return res.state
    } catch { /* 静默 */ }
    return null
  },
}
