// 视频播放：InlinePlayer（页内嵌详情页顶部）+ VideoPlayer（全屏浮层，备用）。
// 直连 mp4 走流代理原生播放；m3u8 走宿主重写路由（分片已代理化），hls.js 直接啃该地址。
import { useEffect, useRef, useState, createElement as h } from 'react'
import { Icon } from './ui.jsx'

const HLS_CDN = 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.mjs'

/** hls.js 懒加载（动态表达式 import，不打进 bundle）；失败缓存 null。 */
async function ensureHls() {
  if (window.__fhHls !== undefined) return window.__fhHls
  try {
    const src = HLS_CDN // 变量绕开打包器静态分析
    const mod = await import(/* @vite-ignore */ src)
    window.__fhHls = mod.default || mod.Hls || mod
  } catch {
    window.__fhHls = null
  }
  return window.__fhHls
}

/** 播放内核：装载 activeUrl（直连或 HLS），致命错误进 fatal。 */
function useVideoEngine(activeUrl, isHls) {
  const videoRef = useRef(null)
  const [fatal, setFatal] = useState(null) // { kind: 'hls' | 'codec' | 'network', msg }

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let hls = null
    let alive = true
    setFatal(null)

    const onErr = () => {
      const code = video.error?.code
      if (code === 3 || code === 4) setFatal({ kind: 'codec', msg: '浏览器无法解码该视频（编码不受支持）' })
      else setFatal({ kind: 'network', msg: '播放失败：源不可达或已失效' })
    }
    video.addEventListener('error', onErr)

    ;(async () => {
      if (!isHls) {
        video.src = activeUrl
        void video.play().catch(() => { /* 首次手势限制，点播放即可 */ })
        return
      }
      const Hls = await ensureHls()
      if (!alive) return
      if (Hls && Hls.isSupported()) {
        hls = new Hls({ maxBufferLength: 30 })
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) setFatal({ kind: 'hls', msg: `HLS 播放失败：${data.details || data.type}` })
        })
        hls.loadSource(activeUrl)
        hls.attachMedia(video)
        void video.play().catch(() => { /* 手势限制 */ })
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = activeUrl // Safari 原生 HLS
        void video.play().catch(() => { /* 手势限制 */ })
      } else {
        setFatal({ kind: 'hls', msg: '无法加载 HLS 引擎（CDN 不可达），m3u8 无法播放' })
      }
    })()

    return () => {
      alive = false
      video.removeEventListener('error', onErr)
      if (hls) { try { hls.destroy() } catch { /* ignore */ } }
    }
  }, [activeUrl, isHls])

  return { videoRef, fatal }
}

/** 播放失败操作区：切换转码 / 复制链接给外部播放器。 */
function FatalPanel({ fatal, fallback, fallbackLabel = '切换转码播放', activeUrl }) {
  return h('div', { className: 'fh-video-fatal' },
    h('div', { style: { fontWeight: 700, marginBottom: 6 } }, `⚠️ ${fatal.msg}`),
    h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', fontSize: 12 } },
      fallback ? h('button', {
        className: 'fh-chip-btn', onClick: fallback,
      }, `${fallbackLabel} ›`) : null,
      h('button', {
        className: 'fh-chip-btn', onClick: () => {
          const abs = new URL(activeUrl, location.origin).href
          navigator.clipboard?.writeText(abs).catch(() => {})
          actions.toast('已复制链接，可用外部播放器打开')
        },
      }, '复制链接给外部播放器')))
}

/* ================= 页内播放器（详情页顶部，16:9，可全屏） ================= */
export function InlinePlayer({ title, url, fallbackUrl, onClose, onFallback }) {
  const [activeUrl, setActiveUrl] = useState(url)
  // 换片（切集）时重置到新地址
  useEffect(() => { setActiveUrl(url) }, [url])
  const isHls = /\/video\/m3u8\?/.test(activeUrl)
  const { videoRef, fatal } = useVideoEngine(activeUrl, isHls)
  const wrapRef = useRef(null)
  const switchFallback = fallbackUrl && activeUrl !== fallbackUrl
    ? () => { setActiveUrl(fallbackUrl); onFallback?.() }
    : null

  const goFullscreen = () => {
    const el = wrapRef.current
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen()
    else el.requestFullscreen?.().catch(() => {})
  }

  return h('div', { className: 'fh-inline-player', ref: wrapRef },
    h('div', { className: 'fh-inline-player-bar' },
      h('span', { className: 't' }, title),
      h('span', { className: 'fh-muted', style: { fontSize: 11 } }, isHls ? '转码 HLS' : '直连'),
      h('div', { className: 'fh-spacer' }),
      h('button', { className: 'fh-icon-btn', onClick: goFullscreen, title: '全屏' }, h(Icon, { name: 'full', size: 15 })),
      onClose ? h('button', { className: 'fh-icon-btn', onClick: onClose, title: '停止播放' }, h(Icon, { name: 'close', size: 15 })) : null),
    h('div', { className: 'fh-inline-player-stage' },
      h('video', { ref: videoRef, controls: true, autoPlay: true, playsInline: true }),
      fatal ? h(FatalPanel, { fatal, fallback: switchFallback, activeUrl }) : null))
}

/* ================= 全屏浮层播放器（备用：海报长按/外部入口） ================= */
export function VideoPlayer({ title, url, fallbackUrl, fallbackLabel = '切换转码播放', onClose }) {
  const [activeUrl, setActiveUrl] = useState(url)
  useEffect(() => { setActiveUrl(url) }, [url])
  const isHls = /\/video\/m3u8\?/.test(activeUrl)
  const { videoRef, fatal } = useVideoEngine(activeUrl, isHls)
  const fallback = activeUrl === url ? fallbackUrl : null

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // 影视播放期间挂 body 标记：隐藏音乐 mini 条/悬浮球（z 260 高于本浮层 z 120，会盖住播放控制）
  useEffect(() => {
    document.body.classList.add('fh-video-open')
    return () => document.body.classList.remove('fh-video-open')
  }, [])

  return h('div', { className: 'fh-video-overlay' },
    h('div', { className: 'fh-video-bar' },
      h('button', { className: 'fh-icon-btn', onClick: onClose, title: '关闭（ESC）' }, h(Icon, { name: 'close', size: 16 })),
      h('span', { className: 'fh-video-title' }, title),
      h('div', { className: 'fh-spacer' }),
      h('span', { className: 'fh-muted', style: { fontSize: 11 } }, isHls ? 'HLS' : '直连')),
    h('div', { className: 'fh-video-body' },
      h('video', { ref: videoRef, controls: true, autoPlay: true, playsInline: true, style: { maxWidth: '100%', maxHeight: '100%', background: '#000', borderRadius: 8 } }),
      fatal ? h(FatalPanel, { fatal, fallback: fallback ? () => { setActiveUrl(fallback) } : null, activeUrl }) : null))
}

// store 在此文件仅用 toast；避免与 video.jsx 循环依赖，直接延迟引入
import { actions } from './store.js'
