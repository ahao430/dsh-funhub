// 视频播放：InlinePlayer（页内嵌详情页顶部）+ VideoPlayer（全屏浮层，备用）。
// 直连 mp4 走流代理原生播放；m3u8 走宿主重写路由（分片已代理化），hls.js 直接啃该地址。
import { useEffect, useRef, useState, createElement as h } from 'react'
import { Icon } from './ui.jsx'
import { api } from './api.js'

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

/* ================= 字幕 ================= */

/** SRT → WebVTT（浏览器 <track> 只认 vtt；srt 时间戳逗号换点，补 WEBVTT 头）。 */
export function srtToVtt(srt) {
  const body = String(srt || '').replace(/^\uFEFF/, '').replace(/\r+/g, '')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{1,3})/g, '$1.$2')
  return `WEBVTT\n\n${body}`
}

/** 中文语言标记粗判（zh/chi/chn 及带地区后缀的变体）。 */
function isZhLang(lang) {
  return /^(zh|chi|chn|zho)\b/i.test(String(lang || ''))
}

/** 直连/转码播放的 <track> 字幕：自动选中首选中文轨；本地/网络附加轨由挂载方自行控制。 */
function useNativeSubtitles(videoRef, subtitles, selected) {
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const apply = () => {
      const tt = video.textTracks
      for (let i = 0; i < tt.length; i++) {
        if (i >= subtitles.length) continue // 附加轨（本地/公共站下载）不入此管理
        const target = selected === i ? 'showing' : 'disabled'
        if (tt[i].mode !== target) tt[i].mode = target
      }
    }
    apply()
    video.textTracks?.addEventListener?.('addtrack', apply)
    video.textTracks?.addEventListener?.('change', apply)
    return () => { video.textTracks?.removeEventListener?.('addtrack', apply); video.textTracks?.removeEventListener?.('change', apply) }
  }, [videoRef, subtitles, selected])
}

/** 字幕选择菜单：服务器轨 / Emby 服务端搜索 / 公共字幕站 / 本地字幕文件。 */
function SubtitleMenu({ videoRef, subtitles, selected, setSelected, serverId, itemId, msId, searchKw, season, episode, onRefresh }) {
  const [open, setOpen] = useState(false)
  const [remote, setRemote] = useState(null) // Emby 服务端搜索结果 { list, message }
  const [remoteBusy, setRemoteBusy] = useState(false)
  const [web, setWeb] = useState(null) // 公共字幕站搜索结果 { list, message }
  const [webBusy, setWebBusy] = useState(false)
  const fileRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (!menuRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const searchRemote = async () => {
    setRemoteBusy(true); setRemote(null)
    try {
      const r = await api.get(`/video/subtitles/search?server=${encodeURIComponent(serverId)}&item=${encodeURIComponent(itemId)}&lang=chi`)
      setRemote(r.list?.length ? { list: r.list } : { list: [], message: r.message || '服务器没找到可下载的字幕（需 Emby 服务器启用 OpenSubtitles 插件）', unavailable: r.unavailable })
    } catch (err) {
      setRemote({ list: [], message: `搜索失败：${err.message}` })
    } finally { setRemoteBusy(false) }
  }

  const downloadRemote = async (s) => {
    setRemoteBusy(true)
    try {
      const res = await fetch('/funhub/api/video/subtitles/download', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ server: serverId, item: itemId, providerName: s.providerName, subId: s.id, language: s.language }),
      })
      const r = await res.json()
      if (!res.ok || !r.ok) throw new Error(r.error || `HTTP ${res.status}`)
      actions.toast(r.message || '字幕已下载挂载')
      setOpen(false); setRemote(null)
      onRefresh?.()
    } catch (err) {
      actions.toast(`下载失败：${err.message}`)
    } finally { setRemoteBusy(false) }
  }

  /** 公共字幕站搜索：SubtitleCat（免 Key，两级：详情页 → 语言变体）+ OpenSubtitles（有 Key）。 */
  const searchWeb = async () => {
    setWebBusy(true); setWeb(null)
    try {
      const q = new URLSearchParams({ kw: searchKw || '' })
      if (season) q.set('season', String(season))
      if (episode) q.set('episode', String(episode))
      const r = await api.get(`/video/subtitles/web-search?${q}`)
      setWeb(r.list?.length ? { list: r.list } : { list: [], message: r.message || '没有找到匹配的字幕' })
    } catch (err) {
      setWeb({ list: [], message: `搜索失败：${err.message}` })
    } finally { setWebBusy(false) }
  }

  const attachVtt = (vttText, label) => {
    const video = videoRef.current
    if (!video) return
    const track = video.addTextTrack('subtitles', `🌐 ${label}`, 'zh')
    for (const c of parseVttCues(vttText)) track.addCue(new VTTCue(c.start, c.end, c.text))
    track.mode = 'showing'
    for (const t of video.textTracks) if (t !== track) t.mode = 'disabled'
    setSelected(`web:${label}`)
    setOpen(false)
  }

  const downloadWeb = async (s) => {
    setWebBusy(true)
    try {
      // SubtitleCat 条目：先展开详情页的语言变体
      if (s.provider === 'subtitlecat' && s.detailUrl) {
        const res = await fetch('/funhub/api/video/subtitles/web-detail', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ detailUrl: s.detailUrl }),
        })
        const r = await res.json()
        if (!res.ok || !r.ok) throw new Error(r.error || `HTTP ${res.status}`)
        setWeb((prev) => ({ list: r.list || [], back: prev?.list || [], source: s.title }))
        return
      }
      const res = await fetch('/funhub/api/video/subtitles/web-download', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(s.provider === 'subtitlecat' ? { provider: 'subtitlecat', url: s.url } : { fileId: s.fileId }),
      })
      const r = await res.json()
      if (!res.ok || !r.ok) throw new Error(r.error || `HTTP ${res.status}`)
      if (r.kind === 'vtt') {
        attachVtt(r.vtt, (r.filename || '字幕').replace(/\.[^.]+$/, ''))
        actions.toast(`字幕已挂载：${r.filename}`)
      } else {
        // zip/rar：交给浏览器落盘，解压后走「加载本地字幕」
        const bin = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0))
        const url = URL.createObjectURL(new Blob([bin], { type: 'application/octet-stream' }))
        const a = document.createElement('a')
        a.href = url; a.download = r.filename || 'subtitle.zip'; a.click()
        URL.revokeObjectURL(url)
        actions.toast(`压缩包已下载：${r.filename}（解压后用「加载本地字幕」导入）`)
        setOpen(false)
      }
    } catch (err) {
      actions.toast(`下载失败：${err.message}`)
    } finally { setWebBusy(false) }
  }

  const pickLocal = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      const vtt = /\.vtt$/i.test(file.name) ? text : srtToVtt(text)
      const url = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }))
      // 直接在 video 上挂本地轨并启用
      const video = videoRef.current
      if (!video) return
      const track = video.addTextTrack('subtitles', `本地 · ${file.name.replace(/\.[^.]+$/, '')}`, 'zh')
      const cues = parseVttCues(vtt)
      for (const c of cues) track.addCue(new VTTCue(c.start, c.end, c.text))
      track.mode = 'showing'
      for (const t of video.textTracks) if (t !== track) t.mode = 'disabled'
      setSelected(`local:${file.name}`)
      setOpen(false)
    } catch (err) { actions.toast(`本地字幕加载失败：${err.message}`) }
  }

  const hasServerTracks = subtitles.length > 0
  return h('div', { className: 'fh-sub-wrap', ref: menuRef },
    h('button', {
      className: `fh-icon-btn${typeof selected === 'number' || String(selected || '').startsWith('web:') || String(selected || '').startsWith('local:') ? ' is-on' : ''}`, title: '字幕',
      onClick: () => setOpen((o) => !o),
    }, h('span', { style: { fontSize: 13, fontWeight: 700 } }, '字')),
    open ? h('div', { className: 'fh-sub-menu' },
      hasServerTracks ? h('div', { className: 'sec' },
        subtitles.map((s, i) => h('button', {
          key: s.index, className: `item${selected === i ? ' is-on' : ''}`,
          onClick: () => { setSelected(i); setOpen(false) },
        }, `${s.label}${s.lang ? ` · ${s.lang}` : ''}${s.codec ? ` (${s.codec})` : ''}`)),
        h('button', { className: `item${selected === 'off' ? ' is-on' : ''}`, onClick: () => { setSelected('off'); setOpen(false) } }, '关闭字幕'))
      : h('div', { className: 'empty' }, '该版本没有内嵌/外挂字幕流'),
      h('div', { className: 'sep' }),
      h('button', { className: 'item', disabled: remoteBusy, onClick: searchRemote },
        remoteBusy ? '搜索中…' : '🔍 自动搜索字幕（Emby 服务器）'),
      remote?.list?.length ? h('div', { className: 'sec' },
        remote.list.slice(0, 8).map((s, i) => h('button', {
          key: `${s.id}:${i}`, className: 'item', disabled: remoteBusy,
          onClick: () => void downloadRemote(s),
        }, `${s.name}${s.providerName ? ` · ${s.providerName}` : ''}${s.downloads ? ` · ⬇${s.downloads}` : ''}`))) : null,
      remote?.message ? h('div', { className: 'empty' }, remote.message) : null,
      h('div', { className: 'sep' }),
      h('button', { className: 'item', disabled: webBusy, onClick: searchWeb },
        webBusy ? '搜索中…' : '🌐 公共字幕站搜索（免 Key · SubtitleCat）'),
      web?.back?.length ? h('button', { className: 'item', onClick: () => setWeb({ list: web.back }) }, '‹ 返回搜索结果') : null,
      web?.list?.length ? h('div', { className: 'sec' },
        web.list.slice(0, 10).map((s, i) => h('button', {
          key: `${s.provider}:${s.fileId || s.url || s.detailUrl}:${i}`, className: 'item', disabled: webBusy,
          title: s.release || s.fileName || s.title,
          onClick: () => void downloadWeb(s),
        }, s.provider === 'subtitlecat'
          ? (s.url
            ? `${s.lang} · ${s.fileName.slice(0, 36)}`
            : `[SC] ${s.title.slice(0, 44)}`)
          : `${s.fileName.slice(0, 42)}${s.downloads ? ` · ⬇${s.downloads}` : ''}${s.rating ? ` · ★${s.rating.toFixed(1)}` : ''}`))) : null,
      web?.message ? h('div', { className: 'empty' }, web.message) : null,
      h('div', { className: 'sep' }),
      h('button', { className: 'item', onClick: () => fileRef.current?.click() }, '📂 加载本地字幕（srt/vtt）'),
      h('input', { ref: fileRef, type: 'file', accept: '.srt,.vtt', style: { display: 'none' }, onChange: pickLocal }))
    : null)
}

/** 极简 VTT 解析（本地字幕挂 cue 用；容错跳过无法解析的块）。 */
function parseVttCues(vtt) {
  const cues = []
  const toSec = (t) => {
    const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/.exec(String(t).trim())
    if (!m) return NaN
    return (Number(m[1]) || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(String(m[4]).padEnd(3, '0')) / 1000
  }
  const lines = String(vtt).split('\n')
  for (let i = 0; i < lines.length; i++) {
    // WEBVTT 时间戳允许 h:mm:ss.mmm 与 mm:ss.mmm 两种形态
    const m = /(\d{1,3}:\d{2}:\d{2}[.,]\d{1,3}|\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*(\d{1,3}:\d{2}:\d{2}[.,]\d{1,3}|\d{1,2}:\d{2}[.,]\d{1,3})/.exec(lines[i])
    if (!m) continue
    const start = toSec(m[1]); const end = toSec(m[2])
    const text = []
    for (let j = i + 1; j < lines.length && lines[j].trim(); j++) text.push(lines[j].replace(/<[^>]+>/g, ''))
    if (!text.length || Number.isNaN(start) || Number.isNaN(end)) continue
    cues.push({ start, end, text: text.join('\n') })
    i += text.length
  }
  return cues
}

/* ================= 页内播放器（详情页顶部，16:9，可全屏） ================= */
export function InlinePlayer({ title, url, fallbackUrl, onClose, onFallback, subtitles = [], serverId, itemId, msId, searchKw, season, episode, onRefresh }) {
  const [activeUrl, setActiveUrl] = useState(url)
  const [selected, setSelected] = useState(null) // null=未选（挂轨后自动选）；'off' | index | 'local:n'
  // 换片（切集）时重置到新地址与选轨
  useEffect(() => { setActiveUrl(url); setSelected(null) }, [url])
  const isHls = /\/video\/m3u8\?/.test(activeUrl)
  const { videoRef, fatal } = useVideoEngine(activeUrl, isHls)
  const wrapRef = useRef(null)
  const switchFallback = fallbackUrl && activeUrl !== fallbackUrl
    ? () => { setActiveUrl(fallbackUrl); onFallback?.() }
    : null

  /* 首次挂轨自动选中文字幕轨（用户没手动选过时）；直连与转码播放都走 <track> 渲染 */
  useEffect(() => {
    if (selected !== null || !subtitles.length) return
    const zh = subtitles.findIndex((s) => isZhLang(s.lang))
    setSelected(zh >= 0 ? zh : 0)
  }, [subtitles]) // eslint-disable-line react-hooks/exhaustive-deps

  useNativeSubtitles(videoRef, subtitles, selected, null)

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
      subtitles.length ? h('span', { className: 'fh-muted', style: { fontSize: 11 } }, `· ${subtitles.length} 条字幕`) : null,
      h('div', { className: 'fh-spacer' }),
      serverId && itemId && msId ? h(SubtitleMenu, {
        videoRef, subtitles, selected, setSelected, serverId, itemId, msId, searchKw, season, episode, onRefresh,
      }) : null,
      h('button', { className: 'fh-icon-btn', onClick: goFullscreen, title: '全屏' }, h(Icon, { name: 'full', size: 15 })),
      onClose ? h('button', { className: 'fh-icon-btn', onClick: onClose, title: '停止播放' }, h(Icon, { name: 'close', size: 15 })) : null),
    h('div', { className: 'fh-inline-player-stage' },
      h('video', { ref: videoRef, controls: true, autoPlay: true, playsInline: true },
        subtitles.map((s) => h('track', {
          key: `${s.index}:${s.label}`, kind: 'subtitles', src: s.url, label: s.label,
          srclang: s.lang || 'und',
        })),
      ),
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
