// 音乐频道：歌单（默认，含热歌推荐）/ 搜索 / 本地音乐 / 最近播放。
import { useCallback, useEffect, useRef, useState, createElement as h } from 'react'
import { api } from './api.js'
import { actions, getState } from './store.js'
import { player, getPlayerState, subscribePlayer } from './player.js'
import { Icon, Btn, Input, Select, Empty, Loading, ErrorBox, Modal, LazyImage, fmtTime } from './ui.jsx'

const QUALITIES = ['128k', '192k', '320k', 'flac', 'flac24bit', 'hires']

/** 曲目元数据入库形态（临时 URL 不入库）。 */
function trackMeta(t) {
  const meta = {
    id: t.id, title: t.title || t.name || '未知曲目', artist: t.artist || t.singer || '',
    album: t.album || t.albumName || '', cover: t.cover || '',
    channel: t.channel, quality: t.quality, sourceId: t.sourceId, musicInfo: t.musicInfo || null,
  }
  if (t.sourceId === 'local') meta.audioUrl = t.audioUrl
  return meta
}

export function MusicPage() {
  const boot = getState().boot
  const lxSources = (boot?.lxSources || []).filter((s) => s.enabled && !s.error)
  const [tab, setTab] = useState('playlists')
  const [channel, setChannel] = useState(boot?.music?.channel || 'wy')
  const [quality, setQuality] = useState(boot?.music?.quality || '320k')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState([])
  const [archiveTracks, setArchiveTracks] = useState(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(0)
  const fileRef = useRef(null)
  const [addTarget, setAddTarget] = useState(null) // 待加入歌单的曲目
  const playerSnap = usePlayerSnap()

  useEffect(() => {
    void api.op('settings_save', { settings: { music: { channel, quality } } }).catch(() => {})
  }, [channel, quality])

  const search = useCallback(async (qOverride) => {
    const q = (qOverride ?? query).trim()
    if (!q) return
    setSearching(true)
    setError(null)
    setArchiveTracks(null)
    try {
      const res = await api.get(`/music2/search?channel=${channel}&q=${encodeURIComponent(q)}&page=1`)
      setItems(res.items || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setSearching(false)
    }
  }, [query, channel])

  // 首页欢迎区全局搜索直达（archive 频道走公版库搜索）
  useEffect(() => {
    const q = actions.consumeSearch('music')
    if (q) {
      setTab('search'); setQuery(q)
      if (channel === 'archive') void searchArchive(q)
      else void search(q)
    }
    // eslint-disable-line react-hooks/exhaustive-deps
  }, [])

  const searchArchive = useCallback(async (qOverride) => {
    const q = (qOverride ?? query).trim()
    if (!q) return
    setSearching(true)
    setError(null)
    try {
      const res = await api.get(`/music/search?q=${encodeURIComponent(q)}&page=1`)
      setItems(res.items || [])
      setArchiveTracks(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setSearching(false)
    }
  }, [query])

  const openArchiveItem = async (item) => {
    setSearching(true)
    try {
      const res = await api.get(`/music/item/${encodeURIComponent(item.sourceTrackId)}`)
      setArchiveTracks(res.tracks || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setSearching(false)
    }
  }

  const playTracks = (tracks, index) => {
    player.setQueue(tracks.map((t) => ({ ...trackMeta(t), quality: t.quality || quality })), index)
    actions.setPlayerUi('mini')
  }

  const localTracks = (boot?.tracks || []).filter((t) => t.sourceId === 'local')
  const history = boot?.playbackHistory || []

  return h('div', { className: 'fh-page' },
    h('div', { className: 'fh-page-head' },
      h('div', { className: 'fh-page-title' }, '音乐'),
      h('div', { className: 'fh-spacer' }),
      h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
        h('button', { className: `fh-chip-btn${tab === 'playlists' ? ' is-on' : ''}`, onClick: () => setTab('playlists') }, `歌单 ${boot?.playlists?.length || 0}`),
        h('button', { className: `fh-chip-btn${tab === 'search' ? ' is-on' : ''}`, onClick: () => setTab('search') }, '搜索'),
        h('button', { className: `fh-chip-btn${tab === 'local' ? ' is-on' : ''}`, onClick: () => setTab('local') }, `本地 ${localTracks.length}`),
        h('button', { className: `fh-chip-btn${tab === 'recent' ? ' is-on' : ''}`, onClick: () => setTab('recent') }, `最近 ${history.length}`))),

    !lxSources.length ? h('div', { className: 'fh-error', style: { background: 'var(--fh-panel-2)' } },
      h('span', null, '尚未导入洛雪音源：搜索到的歌曲将无法解析播放直链'),
      h(Btn, { size: 'sm', onClick: () => actions.setView('settings', 'lxsource') }, '去导入')) : null,

    tab === 'playlists' ? h(PlaylistsTab, { boot, playTracks, onAdd: setAddTarget, quality }) : null,

    tab === 'search' ? h('div', null,
      h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
        h(Select, { value: channel, onChange: setChannel, options: [
          { value: 'wy', label: '网易云' }, { value: 'kw', label: '酷我' }, { value: 'archive', label: '公版库 Archive' },
        ] }),
        h(Select, { value: quality, onChange: setQuality, options: QUALITIES.map((q) => ({ value: q, label: `音质 ${q}` })) }),
        h(Input, { value: query, onChange: setQuery, onEnter: () => (channel === 'archive' ? searchArchive() : search()), placeholder: '搜索歌曲 / 歌手…', autoFocus: true, style: { flex: 1, minWidth: 200 } }),
        h(Btn, { kind: 'primary', onClick: () => (channel === 'archive' ? searchArchive() : search()), disabled: searching }, searching ? '搜索中…' : '搜索')),
      error ? h(ErrorBox, { error }) : null,
      searching && !items.length ? h(Loading, null) : null,
      archiveTracks ? h('div', null,
        h('div', { className: 'fh-page-sub', style: { margin: '6px 0' } }, `专辑内 ${archiveTracks.length} 首 · 点击播放整张`),
        h('div', { className: 'fh-rowlist' }, archiveTracks.map((t, i) => h(TrackRow, {
          key: t.id, track: t, index: i + 1, playerSnap, onAdd: setAddTarget,
          onPlay: () => playTracks(archiveTracks, i),
        })))) : null,
      !archiveTracks && items.length ? h('div', { className: 'fh-rowlist' },
        items.map((t, i) => h(TrackRow, {
          key: t.id, track: t, index: i + 1, playerSnap, onAdd: setAddTarget,
          onPlay: () => {
            if (channel === 'archive') {
              void openArchiveItem(t)
            } else {
              playTracks(items, i)
            }
          },
        }))) : null,
      !searching && !items.length && !error ? h(Empty, { icon: 'music', title: '搜索你想听的歌', hint: '播放时会通过已导入的洛雪音源解析直链' }) : null,
    ) : null,

    tab === 'local' ? h('div', null,
      h('div', { style: { display: 'flex', gap: 8 } },
        h(Btn, { kind: 'primary', onClick: () => fileRef.current?.click(), disabled: uploading > 0 }, uploading ? `上传中 ${uploading}%` : '上传本地音频'),
        localTracks.length ? h(Btn, { onClick: () => playTracks(localTracks, 0) }, '播放全部') : null,
        h('input', { ref: fileRef, type: 'file', hidden: true, accept: '.mp3,.m4a,.aac,.ogg,.opus,.wav,.flac', multiple: true,
          onChange: async (e) => {
            const files = [...e.target.files]
            e.target.value = ''
            for (const f of files) {
              try {
                await api.uploadAudio(f, (p) => setUploading(p))
              } catch (err) {
                actions.toast(`${f.name} 上传失败：${err.message}`)
              }
            }
            setUploading(0)
            await actions.reload()
            actions.toast('上传完成')
          } })),
      localTracks.length ? h('div', { className: 'fh-rowlist', style: { marginTop: 10 } },
        localTracks.map((t, i) => h(TrackRow, { key: t.id, track: t, index: i + 1, playerSnap, onAdd: setAddTarget, onPlay: () => playTracks(localTracks, i) })))
        : h(Empty, { icon: 'upload', title: '还没有本地音乐', hint: '上传 mp3 / flac 等音频文件到 FunHub' }),
    ) : null,

    tab === 'recent' ? h('div', null,
      history.length ? h('div', { className: 'fh-rowlist' },
        history.map((entry, i) => h(TrackRow, { key: entry.trackId + i, track: entry.track, index: i + 1, playerSnap, onAdd: setAddTarget, onPlay: () => playTracks(history.map((x) => x.track), i) })))
        : h(Empty, { icon: 'clock', title: '暂无播放记录' }),
    ) : null,

    addTarget ? h(AddToPlaylistModal, { track: addTarget, boot, onClose: () => setAddTarget(null) }) : null,
  )
}

/* ================= 歌单（默认 tab） ================= */
/* ================= 歌单详情（广场/我的歌单共用）：曲目列表 + 播放全部（替换队列）+ 导入 + 收藏 ================= */
function PlaylistDetail({ detail, onClose, playTracks, onAdd, quality }) {
  const boot = getState().boot
  const playerSnap = usePlayerSnap()
  const [retry, setRetry] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null) // {name, cover, count, items}（netease 详情）
  const favIds = new Set((boot?.favorites || []).filter((f) => f.itemType === 'playlist').map((f) => f.itemId))
  const isNetease = detail.kind === 'netease'
  const itemId = isNetease ? `netease:${detail.id}` : `local:${detail.pl.id}`

  useEffect(() => {
    if (!isNetease) return
    let alive = true
    setLoading(true)
    setError(null)
    setInfo(null)
    ;(async () => {
      try {
        const res = await api.get(`/music2/playlist-detail?id=${detail.id}`)
        if (!alive) return
        setInfo(res)
      } catch (err) {
        if (alive) setError(err.message)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [detail, retry])

  const name = isNetease ? (info?.name || detail.name || '歌单') : detail.pl.name
  const cover = isNetease ? (info?.cover || detail.cover) : (resolveLocalCover(detail.pl) || '')
  const items = isNetease ? (info?.items || []) : resolveLocal(detail.pl)
  const count = isNetease ? (info?.count ?? items.length) : items.length
  const imported = (boot?.playlists || []).some((p) => p.name === name)

  const importAll = async () => {
    try {
      if (isNetease) {
        if (!info?.items?.length) throw new Error('曲目还没加载完')
        const r = await api.op('playlist_import', { name, tracks: info.items })
        actions.toast(`已导入「${r.playlist.name}」${r.count} 首`)
      } else {
        actions.toast('本地歌单无需导入')
      }
      await actions.reload()
    } catch (err) {
      actions.toast(`导入失败：${err.message}`)
    }
  }

  const toggleFav = async () => {
    await api.op('fav_toggle', { itemType: 'playlist', itemId, meta: { name, cover, kind: detail.kind, pid: isNetease ? detail.id : detail.pl.id } })
    await actions.reload()
    actions.toast(favIds.has(itemId) ? '已取消收藏' : '已收藏歌单')
  }

  return h(Modal, { title: name, onClose, width: 640 },
    h('div', { style: { display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 12 } },
      cover ? h('img', { src: cover, alt: '', style: { width: 84, height: 84, borderRadius: 12, objectFit: 'cover', flex: 'none' } }) : null,
      h('div', { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 } },
        h('div', { className: 'fh-muted', style: { fontSize: 12 } }, `${count} 首${isNetease ? ' · 网易歌单' : ' · 本地歌单'}`),
        h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
          h(Btn, { kind: 'primary', size: 'sm', disabled: !items.length, onClick: () => { playTracks(items, 0); onClose() } },
            h(Icon, { name: 'play', size: 12 }), ' 播放全部（替换队列）'),
          isNetease ? h(Btn, { size: 'sm', onClick: importAll, disabled: !items.length }, imported ? '再次导入（幂等）' : '导入到我的歌单') : null,
          h(Btn, { size: 'sm', onClick: toggleFav }, h(Icon, { name: 'heart', size: 12 }), favIds.has(itemId) ? ' 已收藏' : ' 收藏歌单'))),
    ),
    error ? h(ErrorBox, { error, onRetry: () => setRetry((n) => n + 1) }) : null,
    loading ? h(Loading, { text: '正在获取歌单曲目…' }) : null,
    !loading && items.length ? h('div', { className: 'fh-rowlist', style: { maxHeight: '46vh', overflowY: 'auto' } },
      items.map((t, i) => h(TrackRow, {
        key: t.id + ':' + i, track: t, index: i + 1, playerSnap, onAdd, quality,
        onPlay: () => { playTracks(items, i); onClose() },
      }))) : null,
    !loading && !items.length && !error ? h('div', { className: 'fh-muted', style: { fontSize: 12.5 } }, '歌单为空') : null,
  )
}

/* 本地歌单辅助（resolve 已在 PlaylistsTab 作用域，这里独立实现避免闭包耦合） */
function resolveLocal(pl) {
  const all = getState().boot?.tracks || []
  return (pl.trackIds || []).map((id) => all.find((t) => t.id === id)).filter(Boolean)
}
function resolveLocalCover(pl) {
  const first = resolveLocal(pl)[0]
  return first?.cover || ''
}

/* ================= 歌单广场（网易匿名推荐歌单墙，点击打开详情） ================= */
const WALL_CATS = ['全部', '华语', '流行', '摇滚', '民谣', '电子', '说唱', '古风', '轻音乐', 'ACG']

function fmtPlayCount(n) {
  if (!n) return ''
  return n >= 1e8 ? `${(n / 1e8).toFixed(1)}亿` : n >= 1e4 ? `${Math.round(n / 1e4)}万` : String(n)
}

function PlaylistWall({ onOpen }) {
  const [cat, setCat] = useState('全部')
  const [list, setList] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async (c) => {
    setLoading(true)
    setError(null)
    try {
      const r = await api.get(`/music2/playlist-square?cat=${encodeURIComponent(c)}&limit=30`)
      setList(r.playlists || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(cat) }, [cat]) // eslint-disable-line react-hooks/exhaustive-deps

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
      h('div', { style: { fontWeight: 600, fontSize: 14, marginRight: 4 } }, '歌单广场'),
      WALL_CATS.map((c) => h('button', {
        key: c, className: `fh-chip-btn${cat === c ? ' is-on' : ''}`, onClick: () => setCat(c),
      }, c)),
      h('div', { className: 'fh-spacer' }),
      h('button', { className: 'fh-icon-btn', title: '刷新', onClick: () => load(cat) }, h(Icon, { name: 'refresh', size: 13 }))),
    h('div', { className: 'fh-muted', style: { fontSize: 12 } }, '网易热门歌单，点击封面打开歌单详情：可播放（替换队列）、导入到我的歌单、收藏'),
    error ? h(ErrorBox, { error, onRetry: () => load(cat) }) : null,
    loading && !list ? h(Loading, { text: '正在获取歌单广场…' }) : null,
    list?.length ? h('div', { className: 'fh-pl-wall' },
      list.map((p) => h('button', {
        key: p.id, className: 'fh-pl-card',
        onClick: () => onOpen({ kind: 'netease', id: p.id, name: p.name, cover: p.cover, count: p.count }), title: `${p.name} · ${p.count}首`,
      },
        h(LazyImage, { src: p.cover, alt: p.name, style: { width: '100%', aspectRatio: '1 / 1', minHeight: 0 } }),
        h('span', { className: 'name' }, p.name),
        h('span', { className: 'sub' }, `${p.count}首${p.playCount ? ` · ${fmtPlayCount(p.playCount)}播` : ''}`)))) : null,
    list && !list.length && !loading ? h('div', { className: 'fh-muted', style: { fontSize: 12.5 } }, '该分类暂无推荐歌单，换一个分类试试') : null,
  )
}

function PlaylistsTab({ boot, playTracks, onAdd, quality }) {
  const playlists = boot?.playlists || []
  const allTracks = boot?.tracks || []
  const resolve = (pl) => pl.trackIds.map((id) => allTracks.find((t) => t.id === id)).filter(Boolean)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [billboards, setBillboards] = useState([{ id: '3778678', name: '热歌榜' }])
  const [bid, setBid] = useState('3778678')
  const [toplist, setToplist] = useState(null) // {name, items}
  const [topError, setTopError] = useState(null)
  const [importOpen, setImportOpen] = useState(false)
  const [detail, setDetail] = useState(null) // 歌单详情 {kind:'netease',...} | {kind:'local', pl}
  const playerSnap = usePlayerSnap()

  const loadToplist = useCallback(async (id) => {
    setTopError(null)
    setToplist(null)
    try {
      const res = await api.get(`/music2/toplist?bid=${id}`)
      setToplist(res)
    } catch (err) {
      setTopError(err.message)
    }
  }, [])

  useEffect(() => { void loadToplist(bid) }, [bid, loadToplist])
  useEffect(() => {
    void api.get('/music2/billboards').then((r) => setBillboards(r.billboards || [])).catch(() => {})
  }, [])

  const createPlaylist = async () => {
    const n = name.trim()
    if (!n) return
    await api.op('playlist_create', { name: n })
    setName('')
    setCreating(false)
    await actions.reload()
    actions.toast(`已创建歌单「${n}」`)
  }

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 18 } },
    /* 我的歌单 */
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
      h('div', { style: { display: 'flex', alignItems: 'center' } },
        h('div', { style: { fontWeight: 600, fontSize: 14 } }, '我的歌单'),
        h('div', { className: 'fh-spacer' }),
        h(Btn, { size: 'sm', onClick: () => setImportOpen(true) }, h(Icon, { name: 'download', size: 12 }), ' 导入网易歌单'),
        h(Btn, { size: 'sm', kind: 'primary', onClick: () => setCreating(true) }, h(Icon, { name: 'plus', size: 12 }), ' 新建歌单')),
      playlists.length ? h('div', { className: 'fh-tiles', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' } },
        playlists.map((pl) => {
          const tracks = resolve(pl)
          return h('div', { key: pl.id, className: 'fh-card', style: { minHeight: 0, padding: 12, gap: 6, cursor: 'pointer' },
            onClick: () => setDetail({ kind: 'local', pl }) },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
              h('span', { className: 'fh-mini-art', style: { width: 34, height: 34, fontSize: 16 } }, '🎶'),
              h('div', { style: { flex: 1, minWidth: 0 } },
                h('div', { style: { fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, pl.name),
                h('div', { className: 'fh-muted', style: { fontSize: 11 } }, `${tracks.length} 首`)),
              h('button', { className: 'fh-icon-btn', title: '删除歌单', onClick: async (e) => {
                e.stopPropagation()
                await api.op('playlist_remove', { id: pl.id })
                await actions.reload()
              } }, h(Icon, { name: 'trash', size: 13 }))),
            h(Btn, { size: 'sm', kind: tracks.length ? 'primary' : 'default', disabled: !tracks.length, onClick: (e) => { e.stopPropagation(); playTracks(tracks, 0) } }, '播放全部'))
        })) : h('div', { className: 'fh-muted', style: { fontSize: 12.5 } },
        '新建或从下方歌单广场导入后，会出现在这里。')),

    /* 收藏的歌单（跨「收藏」中心共享） */
    (() => {
      const favPls = (boot?.favorites || []).filter((f) => f.itemType === 'playlist')
      if (!favPls.length) return null
      return h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' } },
        h('span', { className: 'fh-muted', style: { fontSize: 12 } }, '收藏的歌单：'),
        favPls.map((f) => h('button', { key: f.itemId, className: 'fh-chip-btn', title: f.meta?.name,
          onClick: () => f.meta?.kind === 'local'
            ? setDetail({ kind: 'local', pl: { id: f.meta.pid, name: f.meta.name, trackIds: [] } })
            : setDetail({ kind: 'netease', id: f.meta.pid, name: f.meta.name, cover: f.meta.cover }) },
          '♥ ', f.meta?.name || f.itemId)))
    })(),

    /* 歌单广场（推荐歌单墙） */
    h(PlaylistWall, { onOpen: setDetail }),

    /* 榜单矩阵 */
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
      h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
        billboards.map((b) => h('button', {
          key: b.id, className: `fh-chip-btn${bid === b.id ? ' is-on' : ''}`, onClick: () => setBid(b.id),
        }, b.name)),
        h('button', { className: 'fh-icon-btn', title: '刷新', onClick: () => loadToplist(bid) }, h(Icon, { name: 'refresh', size: 13 }))),
      h('div', { style: { display: 'flex', alignItems: 'center' } },
        h('div', { style: { fontWeight: 600, fontSize: 14 } }, toplist?.name || '榜单'),
        h('div', { className: 'fh-spacer' }),
        toplist?.items?.length ? h(Btn, { size: 'sm', onClick: () => playTracks(toplist.items, 0) }, '播放全部') : null),
      topError ? h(ErrorBox, { error: topError, onRetry: () => loadToplist(bid) }) : null,
      !toplist && !topError ? h(Loading, { text: '正在获取榜单…' }) : null,
      toplist?.items?.length ? h('div', { className: 'fh-rowlist' },
        toplist.items.map((t, i) => h(TrackRow, {
          key: t.id, track: t, index: i + 1, playerSnap, onAdd, quality,
          onPlay: () => playTracks(toplist.items, i),
        }))) : null,
    ),

    importOpen ? h(PlaylistImportModal, { onClose: () => setImportOpen(false) }) : null,
    detail ? h(PlaylistDetail, { detail, onClose: () => setDetail(null), playTracks, onAdd, quality }) : null,
  )
}

/* ================= 网易歌单导入弹窗 ================= */
function PlaylistImportModal({ onClose }) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const run = async () => {
    if (!input.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/funhub/api/music2/playlist-import', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: input.trim() }),
      })
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body?.error || `HTTP ${res.status}`)
      const r = await api.op('playlist_import', { name: body.name, tracks: body.items })
      await actions.reload()
      actions.toast(`已导入「${r.playlist.name}」${r.count} 首`)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return h(Modal, { title: '导入网易歌单', onClose, width: 480 },
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
      h(Input, { value: input, onChange: setInput, onEnter: run, placeholder: '粘贴 music.163.com 歌单链接或纯数字 ID…', autoFocus: true }),
      h('div', { className: 'fh-muted', style: { fontSize: 12 } }, '公开歌单可直接导入（最多 300 首）；已收藏/私人歌单网易不开放。同名导入会刷新曲目。'),
      error ? h(ErrorBox, { error }) : null,
      h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8 } },
        h(Btn, { onClick: onClose }, '取消'),
        h(Btn, { kind: 'primary', onClick: run, disabled: loading || !input.trim() }, loading ? '导入中…' : '导入'))))
}

/* ================= 曲目行（全局复用） ================= */
function TrackRow({ track, index, onPlay, onAdd, playerSnap }) {
  const isCurrent = playerSnap.queue[playerSnap.index]?.id === track.id
  const isPlaying = isCurrent && playerSnap.status === 'playing'
  return h('button', { className: `fh-row${isCurrent ? ' is-playing' : ''}`, onClick: onPlay },
    h('span', { className: 'num' }, isPlaying ? h(Icon, { name: 'play', size: 11 }) : index),
    track.cover ? h('img', { src: track.cover, alt: '', style: { width: 30, height: 30, borderRadius: 6, objectFit: 'cover', flex: 'none' } }) : h('span', { className: 'fh-mini-art', style: { width: 30, height: 30, fontSize: 14, borderRadius: 6 } }, '🎵'),
    h('span', { className: 't' }, track.title || track.name || '未知曲目'),
    h('span', { className: 's' }, track.artist || track.singer || ''),
    track.interval ? h('span', { className: 's' }, fmtTime(track.interval)) : null,
    onAdd ? h('span', {
      className: 'fh-icon-btn', style: { width: 24, height: 24, flex: 'none' }, title: '加入歌单',
      onClick: (e) => { e.stopPropagation(); onAdd(track) },
    }, h(Icon, { name: 'plus', size: 13 })) : null,
  )
}

/* ================= 加入歌单弹窗 ================= */
function AddToPlaylistModal({ track, boot, onClose }) {
  const playlists = boot?.playlists || []
  const [name, setName] = useState('')
  const meta = trackMeta(track)

  const addTo = async (plId, plName) => {
    await api.op('playlist_add_track', { id: plId, trackId: meta.id, track: meta })
    await actions.reload()
    actions.toast(`已加入「${plName}」`)
    onClose()
  }

  return h(Modal, { title: `加入歌单 · ${meta.title}`, onClose, width: 420 },
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
      playlists.length ? playlists.map((pl) => h('button', { key: pl.id, className: 'fh-btn', style: { justifyContent: 'flex-start' }, onClick: () => addTo(pl.id, pl.name) },
        h(Icon, { name: 'music', size: 13 }), ` ${pl.name}（${pl.trackIds.length} 首）`)) : null,
      h('div', { style: { display: 'flex', gap: 8 } },
        h(Input, { value: name, onChange: setName, placeholder: '新建歌单并加入…', style: { flex: 1 } }),
        h(Btn, { kind: 'primary', onClick: async () => {
          const n = name.trim()
          if (!n) return
          const created = await api.op('playlist_create', { name: n })
          await addTo(created.playlist.id, n)
        }, disabled: !name.trim() }, '创建并加入'))),
  )
}

export function usePlayerSnap() {
  const [snap, setSnap] = useState(() => getPlayerState())
  useEffect(() => subscribePlayer(() => setSnap(getPlayerState())), [])
  return snap
}
