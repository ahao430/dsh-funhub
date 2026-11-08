// 影视频道：Emby 媒体服务器。
// 服务器不内置：在 设置 → 影视源 添加（账密登录或 API Key）。
// 交互：内容墙（电影/剧集）→ 点海报进入页内详情页（非弹窗）→ 播放嵌在详情页顶部（可全屏）。
// 播放：mp4/h264 走 Static 直连流代理；mkv/hevc 等走 Emby 转码 HLS（h264/aac）经宿主 m3u8 重写。
import { useCallback, useEffect, useState, createElement as h } from 'react'
import { api } from './api.js'
import { actions, getState } from './store.js'
import { Icon, Btn, Select, Empty, Loading, ErrorBox } from './ui.jsx'
import { InlinePlayer } from './video-player.jsx'

/* ================= 页面 ================= */
export function VideoPage() {
  const boot = getState().boot
  const embyServers = boot?.settings?.video?.emby || []

  if (!embyServers.length) {
    return h('div', { className: 'fh-page' },
      h('div', { className: 'fh-page-head' },
        h('div', { className: 'fh-page-title' }, '影视'),
        h('div', { className: 'fh-spacer' }),
        h('span', { className: 'fh-page-sub' }, 'Emby 影音库')),
      h(Empty, {
        icon: 'film', title: '还没有 Emby 服务器',
        hint: 'FunHub 不内置影视源：添加你自己的 Emby 服务器即可浏览与播放',
        action: h(Btn, { kind: 'primary', onClick: () => actions.setView('settings', 'video') }, '去添加 Emby'),
      }))
  }

  return h('div', { className: 'fh-page' },
    h('div', { className: 'fh-page-head' },
      h('div', { className: 'fh-page-title' }, '影视'),
      h('div', { className: 'fh-spacer' }),
      h('button', { className: 'fh-chip-btn', onClick: () => actions.setView('settings', 'video') }, '⚙️ 源管理')),
    h(EmbyTab, { servers: embyServers }),
  )
}

/* ================= Emby：内容墙 + 页内详情页 ================= */
function EmbyTab({ servers }) {
  const boot = getState().boot
  const lastEmby = boot?.settings?.lastSource?.embyServer
  const [serverId, setServerId] = useState(lastEmby && servers.some((s) => s.id === lastEmby) ? lastEmby : (servers[0]?.id || ''))
  const [views, setViews] = useState([])
  const [viewId, setViewId] = useState('')
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  // 详情页状态：{ loading, it(墙上的条目), d(详情), episodes, error }
  const [detail, setDetail] = useState(null)
  // 播放状态：{ title, url, fallbackUrl, epId }（epId 用于剧集当前集高亮）
  const [playing, setPlaying] = useState(null)

  const pickServer = (id) => {
    setServerId(id)
    setDetail(null); setPlaying(null)
    void api.op('settings_save', { settings: { lastSource: { embyServer: id } } }).catch(() => {})
  }

  useEffect(() => {
    if (!serverId) return
    let alive = true
    setViews([]); setViewId(''); setItems([]); setError(null); setDetail(null)
    ;(async () => {
      try {
        const r = await api.get(`/video/emby/views?server=${encodeURIComponent(serverId)}`)
        if (!alive) return
        setViews(r.views || [])
        setViewId(r.views?.[0]?.id || '')
      } catch (err) { if (alive) setError(err.message) }
    })()
    return () => { alive = false }
  }, [serverId])

  const loadItems = useCallback(async (start = 0, append = false) => {
    if (!serverId || !viewId) return
    setLoading(true); setError(null)
    try {
      const r = await api.get(`/video/emby/items?server=${encodeURIComponent(serverId)}&parent=${encodeURIComponent(viewId)}&start=${start}`)
      setTotal(r.total || 0)
      setItems((prev) => (append ? [...prev, ...r.items] : r.items))
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [serverId, viewId])

  useEffect(() => { if (!detail) void loadItems(0, false) }, [loadItems, detail])

  // 进入详情页：剧集拉单集；电影/单集拉播放版本
  const openDetail = async (it) => {
    setDetail({ loading: true, it })
    try {
      if (it.type === 'series') {
        const r = await api.get(`/video/emby/episodes?server=${encodeURIComponent(serverId)}&series=${encodeURIComponent(it.id)}`)
        setDetail((prev) => ({ ...prev, loading: false, episodes: r.items || [], total: r.total || 0 }))
      } else {
        const r = await api.get(`/video/emby/detail?server=${encodeURIComponent(serverId)}&id=${encodeURIComponent(it.id)}`)
        setDetail((prev) => ({ ...prev, loading: false, d: r.detail }))
      }
    } catch (err) { setDetail((prev) => ({ ...prev, loading: false, error: err.message })) }
  }

  // 点单集：拉该集详情并直接在顶部开播
  const playEpisode = async (ep) => {
    setDetail((prev) => ({ ...prev, epLoading: ep.id }))
    try {
      const r = await api.get(`/video/emby/detail?server=${encodeURIComponent(serverId)}&id=${encodeURIComponent(ep.id)}`)
      const d = r.detail
      const ms = (d.sources || [])[0]
      if (!ms) throw new Error('该集没有可播放的版本')
      const direct = ms.directPlay !== false
      setPlaying({
        title: `${detail.it.name} · ${ep.name}`,
        url: direct ? ms.url : ms.hlsUrl,
        fallbackUrl: direct ? ms.hlsUrl : null,
        epId: ep.id,
      })
      setDetail((prev) => ({ ...prev, epLoading: null }))
    } catch (err) {
      setDetail((prev) => ({ ...prev, epLoading: null }))
      actions.toast(`播放失败：${err.message}`)
    }
  }

  // 详情页：直接开演（电影/单集）
  const startPlay = (d, ms) => {
    const direct = ms.directPlay !== false
    setPlaying({
      title: d.name,
      url: direct ? ms.url : ms.hlsUrl,
      fallbackUrl: direct ? ms.hlsUrl : null,
      epId: d.id,
    })
  }

  const closeDetail = () => { setDetail(null); setPlaying(null) }

  /* ---- 详情页（页内，非弹窗） ---- */
  if (detail) {
    const { it, d, episodes, loading: dLoading, error: dError, total: epTotal, epLoading } = detail
    const isSeries = it.type === 'series'
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
      h('div', { className: 'fh-page-head' },
        h('button', { className: 'fh-chip-btn', onClick: closeDetail }, '‹ 返回内容墙'),
        h('span', { style: { fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, it.name),
        isSeries && it.episodes ? h('span', { className: 'fh-muted', style: { fontSize: 12 } }, `${it.episodes} 集`) : null),

      /* 播放器：详情页顶部，点播放/点单集即挂载 */
      playing ? h(InlinePlayer, {
        title: playing.title, url: playing.url, fallbackUrl: playing.fallbackUrl,
        onClose: () => setPlaying(null),
      }) : null,

      /* 信息区：海报 + 元信息 + 简介 + （电影）播放按钮 */
      dLoading ? h(Loading, { text: '正在加载详情…' }) : dError ? h(ErrorBox, { error: dError }) : h('div', { style: { display: 'flex', gap: 14 } },
        (d?.poster || it.poster) ? h('img', { src: d?.poster || it.poster, alt: '', style: { width: 108, height: 152, objectFit: 'cover', borderRadius: 10, flex: 'none', background: 'var(--fh-panel-2)' }, onError: (e) => { e.currentTarget.style.visibility = 'hidden' } }) : null,
        h('div', { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 } },
          h('div', { style: { fontWeight: 700, fontSize: 15 } }, it.name),
          h('div', { className: 'fh-muted', style: { fontSize: 12 } },
            [it.category === 'series' ? '剧集' : '电影', it.year, ...(d?.sources?.length ? [`${d.sources[0].container || '?'}${d.sources[0].videoCodec ? ' · ' + d.sources[0].videoCodec : ''}`] : [])].filter(Boolean).join(' · ')),
          (it.overview || d?.overview) ? h('div', { className: 'fh-muted', style: { fontSize: 12, lineHeight: 1.7 } }, d?.overview || it.overview) : null,
          !isSeries && (d?.sources || []).length ? h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 } },
            d.sources.map((ms, i) => {
              const direct = ms.directPlay !== false
              return h(Btn, {
                key: ms.id, kind: i === 0 ? 'primary' : 'default', size: 'sm',
                title: direct ? '直接播放原始文件' : `转码播放（${ms.container} 浏览器放不了）`,
                onClick: () => startPlay(d, ms),
              }, h(Icon, { name: 'play', size: 12 }), ` ${d.sources.length > 1 ? ms.name + ' · ' : ''}${direct ? '播放' : '转码播放'}`)
            })) : null,
          !isSeries && (d?.sources || []).length ? h('div', { className: 'fh-muted', style: { fontSize: 11 } }, 'mkv/hevc 自动走服务器转码；直连失败可一键切换') : null)),

      /* 剧集：单集列表（当前播放集高亮，点即切换播放） */
      isSeries ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
        episodes?.length ? episodes.map((ep) => h('button', {
          key: ep.id,
          className: `fh-row${playing?.epId === ep.id ? ' is-playing' : ''}`,
          onClick: () => void playEpisode(ep),
          disabled: detail.epLoading === ep.id,
          title: ep.overview || '',
        },
          h('span', { className: 't' }, `${ep.season && ep.episode ? `S${String(ep.season).padStart(2, '0')}E${String(ep.episode).padStart(2, '0')} ` : ''}${ep.name}`),
          h('span', { className: 's' }, detail.epLoading === ep.id ? '加载中…' : (playing?.epId === ep.id ? '▶ 播放中' : (ep.runtime || ''))))) : (!dLoading && !dError ? h(Empty, { icon: 'film', title: '没有单集', hint: '该剧集下未发现 Episode' }) : null),
        epTotal > (episodes?.length || 0) ? h('div', { className: 'fh-muted', style: { fontSize: 11.5, textAlign: 'center' } }, `共 ${epTotal} 集，当前显示前 ${episodes.length} 集`) : null) : null,
    )
  }

  /* ---- 内容墙 ---- */
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
    h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
      servers.length > 1 ? h(Select, { value: serverId, onChange: pickServer, options: servers.map((s) => ({ value: s.id, label: s.name })), style: { maxWidth: 210 } }) : null,
      views.length > 1 ? h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
        views.map((v) => h('button', {
          key: v.id, className: `fh-chip-btn${viewId === v.id ? ' is-on' : ''}`,
          onClick: () => { setViewId(v.id); setPlaying(null) },
        }, v.name))) : null),
    error ? h(ErrorBox, { error, onRetry: () => loadItems(0, false) }) : null,
    loading && !items.length ? h(Loading, { text: '正在加载媒体库…' }) : null,
    items.length ? h('div', { className: 'fh-tiles' },
      items.map((it) => h(PosterTile, {
        key: it.id, v: { id: it.id, name: it.name, pic: it.poster, remarks: it.type === 'series' ? (it.episodes ? `${it.episodes} 集` : '') : it.runtime, category: it.type === 'series' ? '剧集' : '电影', year: it.year },
        onClick: () => void openDetail(it),
      }))) : null,
    items.length && items.length < total
      ? h('div', { style: { display: 'flex', justifyContent: 'center' } },
          h(Btn, { onClick: () => loadItems(items.length, true), disabled: loading }, loading ? '加载中…' : `加载更多（${items.length}/${total}）`)) : null,
    !loading && !items.length && !error ? h(Empty, { icon: 'film', title: '媒体库是空的', hint: '到 Emby 添加媒体后再来' }) : null,
  )
}

function PosterTile({ v, onClick }) {
  return h('div', { className: 'fh-tile', onClick },
    h('div', { className: 'fh-tile-cover', style: { display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, position: 'relative' } },
      h('span', { style: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' } }, '🎬'),
      v.pic ? h('img', { src: v.pic, loading: 'lazy', alt: '', style: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }, onError: (e) => { e.currentTarget.style.display = 'none' } }) : null,
      v.remarks ? h('span', { style: { position: 'absolute', right: 4, bottom: 4, fontSize: 10, padding: '1px 6px', borderRadius: 6, background: 'rgba(0,0,0,.6)', color: '#fff' } }, v.remarks.slice(0, 12)) : null),
    h('div', { className: 'fh-tile-title' }, v.name),
    h('div', { className: 'fh-tile-sub' }, [v.category, v.year].filter(Boolean).join(' · ')))
}
