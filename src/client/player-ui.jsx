// 全局播放器 UI：Mini 迷你条 / Icon 悬浮图标 / Fullscreen 沉浸式全屏（左右分栏）+ 队列侧抽屉。
// 挂载在 body portal 独立 React 树上：DSH 主面板切换不影响播放（plan §4）。
// 原则：UI 状态切换只换视图，绝不重建 Audio Engine（引擎在 player.js 单例里，与组件无关）。
import { useEffect, useMemo, useRef, useState, createElement as h } from 'react'
import { actions, getState } from './store.js'
import { player, prev, next, getPlayerState, subscribePlayer } from './player.js'
import { Icon, fmtTime, Spinner } from './ui.jsx'
import { CSS } from './styles.js'

export function PlayerRoot() {
  const [snap, setSnap] = useState(() => getPlayerState())
  const [ui, setUi] = useState('hidden')
  const [boot, setBoot] = useState(null)
  useEffect(() => subscribePlayer(() => setSnap(getPlayerState())), [])
  useEffect(() => {
    const tick = () => {
      const st = getState()
      const ps = getPlayerState()
      // 兜底：队列里有歌但播放器 UI 还从未显示过（如重启后恢复了持久化队列），
      // 自动弹出 Mini 条；用户主动选的状态不覆盖。
      if (ps.queue.length && st.playerUi === 'hidden') actions.setPlayerUi('mini')
      // 旧版 'expanded' 中间弹窗已移除：直接映射到沉浸式全屏
      setUi(st.playerUi === 'expanded' ? 'fullscreen' : st.playerUi)
      setBoot(st.boot)
    }
    tick()
    const timer = setInterval(tick, 600)
    return () => clearInterval(timer)
  }, [])

  const [queuePanel, setQueuePanel] = useState(false)
  const hasTrack = snap.queue.length > 0
  const track = snap.queue[snap.index]

  return h('div', { className: 'fh-player-root' },
    h('style', null, CSS),
    ui === 'mini' && hasTrack ? h(MiniPlayer, { snap, track, onToggleQueue: () => setQueuePanel((v) => !v) }) : null,
    ui === 'mini' && hasTrack && queuePanel ? h(QueuePop, { snap, onClose: () => setQueuePanel(false) }) : null,
    ui === 'icon' && hasTrack ? h(FloatingIcon, { snap, track }) : null,
    ui === 'fullscreen' && hasTrack ? h(FullscreenPlayer, { snap, track, boot }) : null,
    snap.error && hasTrack ? h('div', { className: 'fh-toast', style: { bottom: 130 } }, snap.error) : null,
  )
}

function Cover({ track, size = 42, radius = 8, onClick, title }) {
  return track?.cover
    ? h('img', { src: track.cover, alt: '', title, onClick, style: { width: size, height: size, borderRadius: radius, objectFit: 'cover', flex: 'none', background: 'var(--fh-panel-2)', cursor: onClick ? 'pointer' : null } })
    : h('span', { className: 'fh-player-cover-fallback', title, onClick, style: { width: size, height: size, borderRadius: radius, cursor: onClick ? 'pointer' : null } }, h(Icon, { name: 'music', size: Math.round(size / 2.4) }))
}

function CtrlButtons({ snap, size = 'side' }) {
  return h('div', { className: 'fh-player-ctrl' },
    h('button', { className: size === 'main' ? 'side' : 'side', style: size === 'main' ? { width: 36, height: 36 } : { width: 30, height: 30 }, onClick: () => prev(), title: '上一首' }, h(Icon, { name: 'prev', size: size === 'main' ? 17 : 14 })),
    h('button', { className: 'main', style: size === 'main' ? null : { width: 36, height: 36 }, onClick: () => player.toggle(), title: '播放/暂停' },
      h(Icon, { name: snap.status === 'playing' ? 'pause' : 'play', size: size === 'main' ? 19 : 16 })),
    h('button', { className: 'side', style: size === 'main' ? { width: 36, height: 36 } : { width: 30, height: 30 }, onClick: () => next(), title: '下一首' }, h(Icon, { name: 'next', size: size === 'main' ? 17 : 14 })),
  )
}

function ProgressBar({ snap, onSeek }) {
  return h('div', { className: 'fh-player-bar', onClick: (e) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      onSeek?.(ratio * (snap.duration || 0))
    } },
    h('i', { style: { width: snap.duration ? `${(snap.position / snap.duration) * 100}%` : 0 } }))
}

/* ---------- 迷你条上方的当前播放列表面板 ---------- */
function QueuePop({ snap, onClose }) {
  return h('div', { className: 'fh-queue-pop' },
    h('div', { className: 'head' },
      h('span', null, `当前播放列表 ${snap.queue.length}`),
      h('div', { className: 'fh-spacer' }),
      h('button', { className: 'fh-chip-btn', onClick: () => player.clearQueue() }, '清空'),
      h('button', { className: 'fh-icon-btn', onClick: onClose, title: '收起' }, h(Icon, { name: 'close', size: 14 }))),
    h('div', { className: 'list' },
      snap.queue.map((t, i) => h('button', { key: `${t.id}:${i}`, className: `fh-row${i === snap.index ? ' is-playing' : ''}`, onClick: () => player.playIndex(i) },
        h('span', { className: 'num' }, i + 1),
        h('span', { className: 't' }, t.title || t.name || '未知'),
        h('span', { className: 's' }, t.artist || ''),
        h('span', { className: 'fh-icon-btn', style: { width: 24, height: 24 }, onClick: (e) => { e.stopPropagation(); player.removeAt(i) } }, h(Icon, { name: 'close', size: 12 }))))),
  )
}

/* ---------- Mini ---------- */
function MiniPlayer({ snap, track, onToggleQueue }) {
  // 只覆盖 FunHub 面板区域：左缘对齐 .fh-root（DSH 菜单不遮挡），随布局变化自适应
  const [left, setLeft] = useState(0)
  useEffect(() => {
    const calc = () => {
      const root = document.querySelector('.fh-root')
      setLeft(root ? Math.max(0, root.getBoundingClientRect().left) : 0)
    }
    calc()
    const ro = new ResizeObserver(calc)
    const root = document.querySelector('.fh-root')
    if (root) ro.observe(root)
    window.addEventListener('resize', calc)
    return () => { ro.disconnect(); window.removeEventListener('resize', calc) }
  }, [])
  return h('div', { className: 'fh-player-mini', style: { left } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex:  1 } },
      h(Cover, { track, size: 42, title: '点击进入沉浸式播放器', onClick: () => actions.setPlayerUi('fullscreen') }),
      h('div', { className: 'fh-player-meta' },
        h('div', { className: 'fh-player-title' }, track?.title || '未在播放'),
        h('div', { className: 'fh-player-sub' }, `${track?.artist || ''}${snap.resolving ? ' · 解析直链中…' : ''}`))),
    h('span', { className: 'fh-muted', style: { fontSize: 11 } }, `${fmtTime(snap.position)} / ${fmtTime(snap.duration)}`),
    h(ProgressBar, { snap, onSeek: (s) => player.seek(s) }),
    h(CtrlButtons, { snap }),
    h('button', { className: 'fh-icon-btn', title: '当前播放列表', onClick: () => onToggleQueue?.() }, h(Icon, { name: 'list', size: 16 })),
    h('button', { className: 'fh-icon-btn', title: '沉浸式播放器', onClick: () => actions.setPlayerUi('fullscreen') }, h(Icon, { name: 'expand', size: 16 })),
    h('button', { className: 'fh-icon-btn', title: '收起为图标', onClick: () => actions.setPlayerUi('icon') }, h(Icon, { name: 'min', size: 16 })),
  )
}

/* ---------- Icon ---------- */
function FloatingIcon({ snap, track }) {
  const ref = useRef(null)
  const [pos, setPos] = useState(() => {
    try { return JSON.parse(localStorage.getItem('funhub.iconPos')) || { right: 28, bottom: 88 } } catch { return { right: 28, bottom: 88 } }
  })
  const drag = useRef(null)

  useEffect(() => {
    const onMove = (e) => {
      if (!drag.current) return
      const x = Math.max(8, Math.min(window.innerWidth - 60, e.clientX - drag.current.dx))
      const y = Math.max(8, Math.min(window.innerHeight - 60, e.clientY - drag.current.dy))
      drag.current.moved = true
      setPos({ left: x, top: y })
    }
    const onUp = () => {
      if (drag.current?.moved) {
        const { left, top } = ref.current?.getBoundingClientRect() || {}
        if (left != null) localStorage.setItem('funhub.iconPos', JSON.stringify({ left, top }))
      }
      drag.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  const style = pos.left != null ? { left: pos.left, top: pos.top } : { right: pos.right, bottom: pos.bottom }
  return h('button', {
    className: 'fh-player-icon', ref, style,
    onPointerDown: (e) => {
      const rect = e.currentTarget.getBoundingClientRect()
      drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, moved: false }
    },
    onPointerUp: () => { /* 拖拽后不触发点击 */ },
    onClick: () => { if (!drag.current?.moved) actions.setPlayerUi('mini') },
    title: `${track?.title || ''} · 点击展开`,
  },
    track?.cover ? h('img', { src: track.cover, alt: '' }) : h(Icon, { name: 'music', size: 20 }),
    snap.status === 'playing' ? h('span', { style: { position: 'absolute', right: 2, bottom: 2, width: 9, height: 9, borderRadius: '50%', background: 'var(--fh-good)', border: '2px solid var(--fh-panel)' } }) : null,
  )
}

/* ---------- 歌词滚动视图（沉浸式全屏用：宽栏 + 点击跳转 + 手动滚动暂停跟随 + 双语） ---------- */
const LYRIC_FOLLOW_RESUME_MS = 4000

function LyricsView({ snap, fontSize = 24, onFontSize }) {
  const lines = snap.lyric?.lines || []
  const boxRef = useRef(null)
  const activeRef = useRef(null)
  const userScrollUntil = useRef(0) // 手动滚动后暂停自动跟随，静置几秒恢复
  const activeIndex = useMemo(() => {
    let idx = -1
    for (let i = 0; i < lines.length; i++) if (snap.position >= lines[i].time - 0.25) idx = i
    return idx
  }, [lines, snap.position])

  useEffect(() => {
    if (Date.now() < userScrollUntil.current) return
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeIndex, lines])

  const pauseFollow = () => { userScrollUntil.current = Date.now() + LYRIC_FOLLOW_RESUME_MS }

  if (snap.lyric?.status === 'loading') {
    return h('div', { className: 'fh-lyrics-wide' },
      h('div', { className: 'fh-lyr-hint' }, h(Spinner, { size: 14 }), ' 正在获取歌词…'))
  }
  if (!lines.length) {
    return h('div', { className: 'fh-lyrics-wide' },
      h('div', { className: 'fh-lyr-empty' },
        h('div', { className: 'big' }, snap.lyric?.status === 'none' ? '暂无歌词' : '纯音乐欣赏'),
        h('div', { className: 'sub' }, snap.resolving ? '正在解析播放直链…' : '这首歌没有可用的歌词，闭上眼睛听吧')))
  }
  return h('div', {
    className: 'fh-lyrics-wide', ref: boxRef,
    style: { '--fh-lyr-fs': `${fontSize}px` },
    onWheel: pauseFollow,
    onTouchStart: pauseFollow,
  },
    onFontSize ? h('div', { className: 'fh-lyr-size' },
      h('button', { onClick: () => onFontSize(-1), title: '减小歌词字号' }, 'A−'),
      h('button', { onClick: () => onFontSize(1), title: '增大歌词字号' }, 'A+')) : null,
    lines.map((line, i) => h('button', {
      key: `${i}:${line.time}`,
      ref: i === activeIndex ? activeRef : null,
      className: `fh-lyr-line${i === activeIndex ? ' is-active' : ''}`,
      onClick: () => player.seek(Math.max(0, line.time - 0.1)),
      title: '跳转到此处',
    },
      h('span', { className: 'txt' }, line.text),
      line.trans ? h('span', { className: 'trans' }, line.trans) : null)),
  )
}

/* ---------- 队列侧抽屉（从沉浸式播放器呼出，不遮挡主体） ---------- */
function QueueDrawer({ snap, open, onClose }) {
  return h('div', { className: `fh-fs-queue${open ? ' is-open' : ''}` },
    h('div', { className: 'head' },
      h('span', null, `播放队列 ${snap.queue.length}`),
      h('div', { className: 'fh-spacer' }),
      snap.queue.length ? h('button', { className: 'fh-chip-btn', onClick: () => player.clearQueue() }, '清空') : null,
      h('button', { className: 'fh-icon-btn', onClick: onClose, title: '收起队列' }, h(Icon, { name: 'close', size: 14 }))),
    h('div', { className: 'list' },
      snap.queue.map((t, i) => h('button', { key: `${t.id}:${i}`, className: `fh-row${i === snap.index ? ' is-playing' : ''}`, onClick: () => player.playIndex(i) },
        h('span', { className: 'num' }, i + 1),
        h('span', { className: 't' }, t.title || t.name || '未知'),
        h('span', { className: 's' }, t.artist || ''),
        h('span', { className: 'fh-icon-btn', style: { width: 24, height: 24 }, onClick: (e) => { e.stopPropagation(); player.removeAt(i) } }, h(Icon, { name: 'close', size: 12 }))))),
  )
}

/* ---------- 沉浸式全屏：左栏封面+控制（35%） / 右栏宽歌词（65%） ---------- */
function FullscreenPlayer({ snap, track, boot }) {
  const [queueOpen, setQueueOpen] = useState(false)
  const [lyricSize, setLyricSize] = useState(() => {
    try { return JSON.parse(localStorage.getItem('funhub.lyricSize')) || 24 } catch { return 24 }
  })
  const favIds = useMemo(() => new Set((boot?.favorites || []).filter((f) => f.itemType === 'track').map((f) => f.itemId)), [boot])

  /* ESC 收起回 Mini；空格播放暂停（不与输入框冲突） */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); actions.setPlayerUi('mini') }
      if (e.key === ' ' && !/input|textarea|select/i.test(document.activeElement?.tagName || '')) {
        e.preventDefault(); player.toggle()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const changeLyricSize = (delta) => {
    const n = Math.max(15, Math.min(40, lyricSize + delta * 2))
    setLyricSize(n)
    try { localStorage.setItem('funhub.lyricSize', JSON.stringify(n)) } catch { /* 忽略 */ }
  }

  return h('div', { className: 'fh-fs' },
    /* 背景：当前封面大幅模糊 + 深色渐变压暗（等效于取封面主色的柔和渐变，且无 CORS 限制） */
    track?.cover ? h('img', { className: 'fh-fs-bg', src: track.cover, alt: '' }) : null,
    h('div', { className: 'fh-fs-veil' }),

    /* 左栏：歌曲信息 + 控制 */
    h('div', { className: 'fh-fs-left' },
      track?.cover
        ? h('img', { className: 'fh-fs-cover', src: track.cover, alt: '' })
        : h('div', { className: 'fh-fs-cover ph' }, h(Icon, { name: 'music', size: 64 })),
      h('div', { className: 'fh-fs-title' }, track?.title || '未在播放'),
      h('div', { className: 'fh-fs-sub' }, `${track?.artist || ''}${track?.album ? ` · ${track.album}` : ''}`),
      h('div', { className: 'fh-fs-progress' },
        h('span', null, fmtTime(snap.position)),
        h(ProgressBar, { snap, onSeek: (s) => player.seek(s) }),
        h('span', null, fmtTime(snap.duration))),
      h(CtrlButtons, { snap, size: 'main' }),
      h('div', { className: 'fh-fs-tools' },
        h('button', { className: 'fh-chip-btn', title: '播放模式', onClick: () => player.cycleMode() }, modeLabel(snap.mode)),
        h('button', { className: `fh-chip-btn${favIds.has(track?.id) ? ' is-on' : ''}`, title: '收藏',
          style: favIds.has(track?.id) ? { color: 'var(--fh-danger)' } : null,
          onClick: async () => {
            const { api } = await import('./api.js')
            await api.op('fav_toggle', { itemType: 'track', itemId: track.id, meta: track })
            await actions.reload()
          } }, h(Icon, { name: 'heart', size: 12 }), ' 收藏'),
        h('button', { className: `fh-chip-btn${queueOpen ? ' is-on' : ''}`, onClick: () => setQueueOpen(!queueOpen) }, `队列 ${snap.queue.length}`),
        h('span', { style: { flex: 1 } }),
        h(Icon, { name: 'volume', size: 15 }),
        h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: snap.volume, style: { width: 88, accentColor: 'var(--fh-accent)' },
          onChange: (e) => player.setVolume(Number(e.target.value)) }))),

    /* 右栏：宽歌词 */
    h('div', { className: 'fh-fs-right' },
      h(LyricsView, { snap, fontSize: lyricSize, onFontSize: changeLyricSize })),

    /* 收起按钮 */
    h('button', { className: 'fh-icon-btn fh-fs-collapse', onClick: () => actions.setPlayerUi('mini'), title: '收起为迷你条（ESC）' }, h(Icon, { name: 'shrink', size: 18 })),

    h(QueueDrawer, { snap, open: queueOpen, onClose: () => setQueueOpen(false) }),
  )
}

function modeLabel(mode) {
  return { sequence: '顺序', loop: '列表循环', single: '单曲循环', shuffle: '随机' }[mode] || mode
}
