// 全局播放器核心：UI 与音频引擎分离（plan §4.6）。
// - Audio 实例全局单例，挂在独立 DOM（body portal），面板切换不销毁
// - 队列 / 播放模式 / 进度 / 错误重试全部在此，UI 只读订阅
import { api } from './api.js'

const PLAYER_MODES = ['sequence', 'loop', 'single', 'shuffle']

let audio = null
let listeners = new Set()

let playerState = {
  queue: [],            // Track[]：{id, title, artist, cover, channel?, musicInfo?, audioUrl?, archiveId?}
  index: -1,
  status: 'playing' | 'paused' | 'stopped',
  position: 0,
  duration: 0,
  mode: 'sequence',
  volume: 0.9,
  error: null,
  resolving: false,     // 正在通过洛雪音源解析直链
  lyric: null,          // {trackId, lines:[{time,text}], status: 'loading'|'ok'|'none'}
  resolvedUrls: new Map(), // trackId -> {url, at}
}

/** 解析 LRC 歌词为 {time, text}[]（多时间标签行展开，按时间排序）。 */
export function parseLrc(text) {
  const out = []
  for (const raw of String(text || '').split(/\r?\n/)) {
    const times = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)]
    if (!times.length) continue
    const content = raw.replace(/\[\d+:\d+(?:\.\d+)?\]/g, '').trim()
    if (!content) continue
    for (const m of times) out.push({ time: Number(m[1]) * 60 + Number(m[2]), text: content })
  }
  return out.sort((a, b) => a.time - b.time)
}

export function getPlayerState() {
  return playerState
}

function set(patch) {
  playerState = { ...playerState, ...patch }
  for (const fn of listeners) fn()
}

export function subscribePlayer(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/* ============ 多实例互斥锁：同时只允许一个 FunHub 实例出声 ============
   场景：DSH 打开多个面板/窗口（或旧面板 webview 未销毁）时，每个实例各持一个
   Audio 元素，会出现好几路音乐叠加。协议：任何实例开始播放即广播 claim，
   其它实例收到后立即暂停自己——「最后操作者独占」，无需心跳/选主。
   BroadcastChannel 同源跨 webview 生效；不可用时静默降级（pagehide 兜底仍在）。 */
const INSTANCE_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
let playChannel = null
try {
  // 仅浏览器创建：Node 的 BroadcastChannel 会保持事件循环存活（测试进程退不出）
  if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
    playChannel = new BroadcastChannel('funhub-player-lock')
    playChannel.onmessage = (ev) => {
      const msg = ev.data
      if (msg?.type === 'claim' && msg.id !== INSTANCE_ID && playerState.status === 'playing') {
        ensureAudio().pause() // audio 的 pause 事件会把状态同步为 paused
      }
    }
  }
} catch { /* 非浏览器/受限环境 */ }

function claimPlayback() {
  try { playChannel?.postMessage({ type: 'claim', id: INSTANCE_ID }) } catch { /* ignore */ }
}

/* webview 关闭/卸载时停声并落盘队列（pagehide 比 unload 可靠）。 */
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    try {
      if (audio) {
        if (!audio.paused) audio.pause()
        persistNow()
      }
    } catch { /* ignore */ }
  })
}

function attachAudioHandlers(el) {
  // 处理器记录在元素上：插件重载接管旧元素时，先摘掉旧实例的监听再挂新的
  const prev = el.__fhHandlers
  if (prev) for (const [name, fn] of Object.entries(prev)) el.removeEventListener(name, fn)
  const handlers = {
    timeupdate: () => set({ position: el.currentTime || 0 }),
    durationchange: () => set({ duration: isFinite(el.duration) ? el.duration : 0 }),
    ended: () => { void next(true) },
    play: () => set({ status: 'playing' }),
    pause: () => set({ status: el.ended ? 'stopped' : 'paused' }),
    error: () => {
      if (!el.src) return
      set({ status: 'stopped', error: '音频加载失败，请检查音源或网络后重试' })
    },
  }
  for (const [name, fn] of Object.entries(handlers)) el.addEventListener(name, fn)
  el.__fhHandlers = handlers
}

function ensureAudio() {
  if (audio) return audio
  // 插件重载场景：同一 webview 里旧模块实例的 Audio 还在播放。
  // 接管它（音乐不中断），状态回归真实播放位置；旧监听已被 attachAudioHandlers 摘除。
  const stale = typeof window !== 'undefined' ? window.__FUNHUB_AUDIO__ : null
  audio = stale || new Audio()
  audio.preload = 'auto'
  audio.volume = playerState.volume
  attachAudioHandlers(audio)
  try { window.__FUNHUB_AUDIO__ = audio } catch { /* 非浏览器 */ }
  return audio
}

/** 恢复队列后调用：若 webview 里还有旧实例在放歌，接管并把 UI 状态对齐真实音频。 */
function adoptStaleAudio() {
  const stale = typeof window !== 'undefined' ? window.__FUNHUB_AUDIO__ : null
  if (!stale || stale === audio) return false
  ensureAudio()
  if (stale.paused) return false
  set({ status: 'playing', position: stale.currentTime || 0, duration: isFinite(stale.duration) ? stale.duration : 0 })
  return true
}

let lyricToken = 0
let consecutiveFailures = 0

/** 拉取当前曲目歌词（lx 缓存优先，失败回退网易直连由宿主完成）。 */
async function fetchLyric(track) {
  const token = ++lyricToken
  set({ lyric: { trackId: track.id, lines: [], status: 'loading' } })
  try {
    const mi = encodeURIComponent(JSON.stringify(track.musicInfo || {}))
    const res = await fetch(`/funhub/api/music2/lyric?channel=${encodeURIComponent(track.channel || 'wy')}&musicInfo=${mi}`, { credentials: 'same-origin' })
    const body = await res.json()
    if (token !== lyricToken) return
    const lines = body.ok && body.lyric ? mergeLrcTranslation(parseLrc(body.lyric), body.translation) : []
    set({ lyric: { trackId: track.id, lines, status: lines.length ? 'ok' : 'none' } })
  } catch {
    if (token === lyricToken) set({ lyric: { trackId: track.id, lines: [], status: 'none' } })
  }
}

/** 按时间戳把翻译行合并进原文歌词（时间相同的行附上 trans 字段）。 */
export function mergeLrcTranslation(lines, tlyricText) {
  if (!tlyricText) return lines
  const trans = parseLrc(tlyricText)
  if (!trans.length) return lines
  const map = new Map()
  for (const t of trans) map.set(Math.round(t.time * 10) / 10, t.text)
  return lines.map((line) => {
    const key = Math.round(line.time * 10) / 10
    const tr = map.get(key)
    return tr && tr !== line.text ? { ...line, trans: tr } : line
  })
}

let persistTimer = null

/** 队列变化防抖落盘（只存元数据，恢复时重新解析 URL）。 */
function persistQueue() {
  clearTimeout(persistTimer)
  persistTimer = setTimeout(persistNow, 1200)
}

/** 立即落盘队列与播放位置（pagehide / 暂停时用，不等防抖）。 */
function persistNow() {
  const { queue, index, position } = playerState
  if (!queue.length) return
  void api.op('player_queue_save', { queue, index, position }).catch(() => {})
}

// 播放中每 5s 记一次位置：面板重载后能回到原秒数（unref：测试等无头环境允许进程自然退出）
const __persistTimer = setInterval(() => {
  if (playerState.status === 'playing' && playerState.position > 0) persistNow()
}, 5000)
if (typeof __persistTimer.unref === 'function') __persistTimer.unref()

// 音频解锁：任何一次用户手势里先 play→pause 一遍，后续异步 play() 不再被自动播放策略拦截
/* 极短静音 WAV：解锁时作占位 src（无 src 的 play() 在 Chromium 必然 NotSupportedError，解锁不会成功） */
const UNLOCK_WAV = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAEA+AAACABAAZGF0YQIAAACAgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGA='

/** 用户手势中真正成功 play 一次 → Chromium 元素级解锁，之后异步 play() 不再被自动播放策略拦截。 */
function unlockAudio() {
  let el
  try { el = ensureAudio() } catch { return }
  if (el.__unlocked || el.src) return // 已解锁 / 正在播真实曲目（播放本身就在解锁）
  try {
    el.src = UNLOCK_WAV
    const p = el.play()
    if (p && typeof p.then === 'function') {
      p.then(() => {
        el.__unlocked = true
        el.pause()
        el.removeAttribute('src')
        el.load()
      }).catch(() => {
        el.removeAttribute('src') // 本次没解锁成功：保留监听，下次手势再试
        el.load()
      })
    } else {
      el.__unlocked = true
      el.removeAttribute('src')
    }
  } catch { /* ignore */ }
}
if (typeof window !== 'undefined') {
  const onGesture = () => {
    unlockAudio()
    if (audio?.__unlocked) { // 解锁成功才撤监听；失败保留，下次手势重试
      window.removeEventListener('pointerdown', onGesture, true)
      window.removeEventListener('keydown', onGesture, true)
    }
  }
  window.addEventListener('pointerdown', onGesture, true)
  window.addEventListener('keydown', onGesture, true)
}

/** 恢复的续播位置（仅首次播放对应曲目时应用一次）。 */
let pendingSeek = 0
let pendingSeekIndex = -1

export const player = {
  modes: PLAYER_MODES,

  setQueue(tracks, startIndex = 0) {
    set({ queue: [...tracks], index: startIndex, error: null })
    persistQueue()
    void player.playIndex(startIndex)
  },

  enqueue(track) {
    const queue = [...playerState.queue, track]
    set({ queue })
    persistQueue()
    if (playerState.index < 0) void player.playIndex(0)
  },

  async playIndex(index) {
    const { queue } = playerState
    if (!queue.length || index < 0 || index >= queue.length) {
      ensureAudio().pause()
      set({ status: 'stopped' })
      return
    }
    const track = queue[index]
    set({ index, position: 0, duration: 0, error: null })
    void api.op('track_played', { track }).catch(() => {})

    let url = track.audioUrl
    if (!url) {
      // 洛雪音源解析（或 Internet Archive 回退）
      set({ resolving: true })
      try {
        const res = await fetch('/funhub/api/music2/url', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ channel: track.channel || 'wy', musicInfo: track.musicInfo, quality: track.quality }),
        })
        const body = await res.json()
        if (!res.ok || !body.ok) throw new Error(body?.error || `HTTP ${res.status}`)
        url = body.url
      } catch (err) {
        set({ resolving: false, error: `《${track.title}》${err.message}` })
        // 多曲队列自动跳下一首（整队列连续失败则停止，避免无限跳歌）；单曲失败只报错
        if (playerState.queue.length > 1) {
          consecutiveFailures += 1
          if (consecutiveFailures >= playerState.queue.length) {
            set({ error: `连续 ${consecutiveFailures} 首解析失败，已停止自动跳歌（检查音源或网络）` })
            return
          }
          setTimeout(() => {
            if (playerState.error && playerState.index === index) void next()
          }, 2500)
        }
        return
      }
      set({ resolving: false })
    }
    // 远程音频统一走宿主同源代理（自定义协议页面直连外链媒体可能被拦，且代理支持 Range 拖动）
    if (/^https?:\/\//i.test(url)) {
      url = `/funhub/api/stream?u=${encodeURIComponent(url)}`
    }
    if (playerState.index !== index) return // 已切歌
    consecutiveFailures = 0
    const el = ensureAudio()
    if (el.src !== url) {
      el.src = url
      el.load()
      // 恢复场景：同曲目且有待续位置，加载后跳过去
      if (pendingSeek > 3 && index === pendingSeekIndex) {
        const target = pendingSeek
        pendingSeek = 0
        pendingSeekIndex = -1
        el.addEventListener('loadedmetadata', () => {
          try { el.currentTime = Math.min(target, (el.duration || target) - 0.5) } catch { /* ignore */ }
        }, { once: true })
      }
    } else {
      pendingSeek = 0
      pendingSeekIndex = -1
    }
    void fetchLyric(track)
    claimPlayback() // 多实例互斥：本实例即将出声，其余实例静音
    try {
      await el.play()
    } catch {
      set({ error: '浏览器阻止了自动播放，请点击播放按钮' })
    }
  },

  play() {
    const { queue, index } = playerState
    if (!queue.length) return
    if (index < 0) return player.playIndex(0)
    claimPlayback()
    const el = ensureAudio()
    if (!el.src) return player.playIndex(index) // 面板重载后音频是空的：完整走解析链
    void el.play().catch(() => set({ error: '播放被浏览器阻止，请再点一次' }))
  },

  pause() {
    ensureAudio().pause()
  },

  toggle() {
    if (playerState.status === 'playing') player.pause()
    else player.play()
  },

  seek(seconds) {
    if (audio && isFinite(seconds)) {
      audio.currentTime = seconds
      set({ position: seconds })
    }
  },

  setVolume(volume) {
    const v = Math.max(0, Math.min(1, volume))
    if (audio) audio.volume = v
    set({ volume: v })
    void api.op('player_settings', { player: { volume: v } }).catch(() => {})
  },

  cycleMode() {
    const nextMode = PLAYER_MODES[(PLAYER_MODES.indexOf(playerState.mode) + 1) % PLAYER_MODES.length]
    set({ mode: nextMode })
    void api.op('player_settings', { player: { mode: nextMode } }).catch(() => {})
  },

  removeAt(index) {
    const { queue, index: current } = playerState
    const nextQueue = queue.filter((_, i) => i !== index)
    const nextIndex = index < current ? current - 1 : (index === current ? Math.min(current, nextQueue.length - 1) : current)
    set({ queue: nextQueue, index: nextIndex })
    persistQueue()
  },

  clearQueue() {
    ensureAudio().pause()
    audio.removeAttribute('src')
    set({ queue: [], index: -1, status: 'stopped', position: 0, duration: 0, lyric: null })
    clearTimeout(persistTimer)
    void api.op('player_queue_save', { queue: [], index: -1 }).catch(() => {})
  },

  /** 恢复宿主持久化的播放器偏好与队列（不自动播放，恢复后点击播放即续播）。 */
  restore(prefs, savedQueue) {
    if (prefs) {
      set({
        mode: PLAYER_MODES.includes(prefs.mode) ? prefs.mode : 'sequence',
        volume: typeof prefs.volume === 'number' ? prefs.volume : 0.9,
      })
      if (audio) audio.volume = playerState.volume
    }
    if (savedQueue && Array.isArray(savedQueue.queue) && savedQueue.queue.length) {
      const idx = Math.max(0, Math.min(savedQueue.index ?? 0, savedQueue.queue.length - 1))
      set({
        queue: savedQueue.queue,
        index: idx,
        position: Math.max(0, Number(savedQueue.position) || 0),
        status: 'paused', // 面板重载后回显：已暂停 + 原位置（点击播放从此处续）
      })
      pendingSeek = Math.max(0, Number(savedQueue.position) || 0)
      pendingSeekIndex = idx
    }
    // 插件重载：旧实例若还在出声，接管之并把状态对齐真实播放（而不是显示已暂停）
    if (adoptStaleAudio()) {
      pendingSeek = 0
      pendingSeekIndex = -1
    }
  },
}

async function next(auto = false) {
  const { queue, index, mode } = playerState
  if (!queue.length) return
  if (mode === 'single' && auto) {
    void player.playIndex(index)
    return
  }
  let nextIndex
  if (mode === 'shuffle') {
    nextIndex = queue.length > 1 ? (() => {
      let n = index
      while (n === index) n = Math.floor(Math.random() * queue.length)
      return n
    })() : 0
  } else {
    nextIndex = index + 1
    if (nextIndex >= queue.length) {
      if (mode === 'sequence' && auto) {
        player.pause()
        return
      }
      nextIndex = 0
    }
  }
  void player.playIndex(nextIndex)
}

export function prev() {
  const { queue, index } = playerState
  if (!queue.length) return
  const prevIndex = index <= 0 ? queue.length - 1 : index - 1
  void player.playIndex(prevIndex)
}

export { next }
