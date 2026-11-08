// 共享 UI 原语：DSH 主题令牌（--dsw-alias-*）+ 少量 FunHub 自有变量。
import { Component, useEffect, useState, useRef, createElement as h } from 'react'
import { createPortal } from 'react-dom'

/**
 * 局部错误边界：子树渲染崩溃只降级为一块可重试的错误框，不波及兄弟区域。
 * 重试按钮通过 key 重建整棵子树。
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, attempt: 0 }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    console.error(`[funhub] ${this.props.label || '组件'} 渲染崩溃:`, error, info?.componentStack)
  }
  render() {
    if (this.state.error) {
      return h('div', { className: 'fh-error', style: { flexDirection: 'column', alignItems: 'flex-start', gap: 8, margin: 12 } },
        h('div', null, `⚠ ${this.props.label || '组件'} 崩溃：${this.state.error?.message || this.state.error}`),
        h('button', { className: 'fh-btn fh-btn-sm', onClick: () => this.setState((s) => ({ error: null, attempt: s.attempt + 1 })) }, '重试'))
    }
    // attempt 变化时强制重建子树
    return h('span', { key: this.state.attempt, style: { display: 'contents' } }, this.props.children)
  }
}

/** 游戏精灵图（assets/ 目录，/funhub/api/asset 伺服）；加载失败回退到 fallback（通常为 emoji）。 */
export function Sprite({ name, alt = '', style, className = '', fallback = null }) {
  const [failed, setFailed] = useState(false)
  if (failed) return fallback
  return h('img', {
    src: `/funhub/api/asset/${name}.webp`, alt, className, draggable: false,
    style: { width: '100%', height: '100%', objectFit: 'cover', ...style },
    onError: () => setFailed(true),
  })
}

export function Icon({ name, size = 16, style }) {
  const paths = {
    home: 'M3 10.5 12 3l9 7.5V21h-6v-6h-6v6H3z',
    book: 'M4 3h11a3 3 0 0 1 3 3v15H7a3 3 0 0 1-3-3zm3 3v3h8V6a1 1 0 0 0-1-1z',
    comic: 'M3 5h18v10H8l-5 4zM7 9h10M7 12h6',
    film: 'M3 5h18v14H3zM7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4',
    image: 'M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6',
    music: 'M9 18V6l10-2v12M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0m10-2a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0',
    game: 'M7 8h10a5 5 0 0 1 0 10H7A5 5 0 0 1 7 8m2 5H7m1-1v2m7-1h.01M17 11h.01',
    rss: 'M5 19a1 1 0 1 0 0-.01M5 12a7 7 0 0 1 7 7M5 5a14 14 0 0 1 14 14',
    star: 'M12 3l2.7 5.6 6.3.8-4.6 4.3 1.2 6.1L12 16.9 6.4 19.8l1.2-6.1L3 9.4l6.3-.8z',
    gear: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8m8.4 4 1.5-1.2-1.4-3.4-1.9.4a7.7 7.7 0 0 0-1.7-1L16 4.9h-3.6l-.9 1.9a7.7 7.7 0 0 0-1.7 1l-1.9-.4-1.4 3.4L8 12l-1.5 1.2 1.4 3.4 1.9-.4a7.7 7.7 0 0 0 1.7 1l.9 1.9H16l.9-1.9a7.7 7.7 0 0 0 1.7-1l1.9.4 1.4-3.4z',
    play: 'M7 4.5v15l13-7.5z',
    pause: 'M6 4h4v16H6zm8 0h4v16h-4z',
    prev: 'M18 5v14l-9-7zM5 5h2v14H5z',
    next: 'M6 5v14l9-7zM17 5h2v14h-2z',
    expand: 'M7 14l5 5 5-5M7 10l5-5 5 5',
    shrink: 'M12 19l5-5M17 14H7m5-9L7 10h10',
    full: 'M4 9V4h5M20 9V4h-5M4 15v5h5m11-5v5h-5',
    close: 'M5 5l14 14M19 5L5 19',
    search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13m5 11.5L21 21',
    plus: 'M12 5v14M5 12h14',
    trash: 'M4 7h16M9 7V4h6v3m-8 0 1 14h8l1-14',
    refresh: 'M20 12a8 8 0 1 1-2.3-5.6M20 3v5h-5',
    check: 'M4 12.5l5 5L20 6.5',
    back: 'M14 6l-6 6 6 6',
    heart: 'M12 20s-8-5.3-8-11a4.6 4.6 0 0 1 8-3 4.6 4.6 0 0 1 8 3c0 5.7-8 11-8 11z',
    doc: 'M6 3h9l4 4v14H6zM15 3v4h4M9 12h6M9 16h6',
    upload: 'M12 16V5m-5 5 5-5 5 5M5 19h14',
    clock: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16m0 4v4l3 3',
    grid: 'M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z',
    chevronL: 'M14 6l-6 6 6 6',
    chevronR: 'M10 6l6 6-6 6',
    volume: 'M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6',
    list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
    min: 'M5 12h14',
    drag: 'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01',
    download: 'M12 4v10m-5-4 5 5 5-5M5 20h14',
  }
  return h('svg', {
    viewBox: '0 0 24 24', width: size, height: size, style,
    fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
    'aria-hidden': true,
  }, h('path', { d: paths[name] || paths.doc }))
}

export function Btn({ children, onClick, kind = 'default', size = 'md', disabled, title, style, type = 'button' }) {
  return h('button', {
    type, onClick, disabled, title, style,
    className: `fh-btn fh-btn-${kind}${size === 'sm' ? ' fh-btn-sm' : ''}`,
  }, children)
}

export function Empty({ icon = 'doc', title, hint, action }) {
  return h('div', { className: 'fh-empty' },
    h(Icon, { name: icon, size: 34 }),
    h('div', { className: 'fh-empty-title' }, title),
    hint ? h('div', { className: 'fh-empty-hint' }, hint) : null,
    action || null,
  )
}

export function Spinner({ size = 18 }) {
  return h('span', { className: 'fh-spinner', style: { width: size, height: size } })
}

export function Loading({ text = '加载中…' }) {
  return h('div', { className: 'fh-loading' }, h(Spinner), h('span', null, text))
}

export function ErrorBox({ error, onRetry }) {
  return h('div', { className: 'fh-error' },
    h('span', null, `⚠ ${error}`),
    onRetry ? h(Btn, { size: 'sm', onClick: onRetry }, '重试') : null,
  )
}

export function Modal({ title, onClose, width = 520, children, footer }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  // portal 到 body：面板容器可能带 transform 动画，fixed 相对它定位会跑出视口
  return createPortal(
    h('div', { className: 'fh-modal-mask', onMouseDown: (e) => { if (e.target === e.currentTarget) onClose?.() } },
      h('div', { className: 'fh-modal', style: width ? { width: Math.min(width, 920) } : null },
        h('div', { className: 'fh-modal-head' },
          h('span', { className: 'fh-modal-title' }, title),
          h('button', { className: 'fh-icon-btn', onClick: onClose, 'aria-label': '关闭' }, h(Icon, { name: 'close', size: 15 }))),
        h('div', { className: 'fh-modal-body' }, children),
        footer ? h('div', { className: 'fh-modal-foot' }, footer) : null,
      )),
    document.body)
}

/** 外部存储钩子：订阅 store.js 的状态。 */
export function useStore(storeModule) {
  const [snap, setSnap] = useState(() => storeModule.getState())
  useEffect(() => storeModule.subscribe(() => setSnap(storeModule.getState())), [storeModule])
  return snap
}

/** 书封等外链图片统一走宿主代理（已在 /funhub/img 或本地 data 的原样返回），自动修复防盗链直连失败。 */
export function coverSrc(url) {
  const u = String(url || '').trim()
  if (!u || u.startsWith('/funhub/') || u.startsWith('data:') || u.startsWith('/assets/')) return u
  if (!/^https?:/i.test(u)) return u
  return `/funhub/img?u=${encodeURIComponent(u)}`
}

/** 懒加载图片：原生 loading=lazy 推迟网络请求，加载前显示微光骨架占位，完成后淡入。 */
export function LazyImage({ src, alt = '', className, style, imgStyle, onError, onLoaded }) {
  const [state, setState] = useState('loading') // loading | ok | error
  useEffect(() => { setState('loading') }, [src])
  return h('div', { className: `fh-lazy-img is-${state}${className ? ` ${className}` : ''}`, style },
    state !== 'ok' ? h('span', { className: 'fh-lazy-ph', 'aria-hidden': 'true' }) : null,
    h('img', {
      src, alt, loading: 'lazy', decoding: 'async',
      onLoad: (e) => { setState('ok'); onLoaded?.(e.currentTarget) },
      onError: () => { setState('error'); onError?.() },
      style: { ...imgStyle, opacity: state === 'ok' ? 1 : 0 },
    }),
  )
}

/** 输入框（回车触发）。 */
export function Input({ value, onChange, onEnter, placeholder, autoFocus, style, type = 'text' }) {
  const ref = useRef(null)
  useEffect(() => { if (autoFocus) ref.current?.focus() }, [autoFocus])
  return h('input', {
    ref, type, value, placeholder, style, className: 'fh-input',
    onChange: (e) => onChange?.(e.target.value),
    onKeyDown: (e) => { if (e.key === 'Enter') onEnter?.() },
  })
}

export function Select({ value, onChange, options, style }) {
  return h('select', {
    className: 'fh-select', value, style,
    onChange: (e) => onChange?.(e.target.value),
  }, options.map((opt) => h('option', { key: opt.value, value: opt.value }, opt.label)))
}

export function Toggle({ checked, onChange, title }) {
  return h('button', {
    className: `fh-toggle${checked ? ' is-on' : ''}`, onClick: () => onChange?.(!checked),
    role: 'switch', 'aria-checked': checked, title,
  }, h('span', { className: 'fh-toggle-dot' }))
}

export function fmtTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function fmtBytes(size) {
  if (!size) return ''
  if (size > 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${Math.round(size / 1024)} KB`
}

export function fmtAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`
  if (diff < 30 * 86400_000) return `${Math.floor(diff / 86400_000)} 天前`
  return new Date(ts).toLocaleDateString('zh-CN')
}
