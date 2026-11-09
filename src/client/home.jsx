// 首页 Dashboard：顶部欢迎区（氛围图 + 问候 + 全局搜索）+ 多列内容卡片（plan §3）。
// 视觉原则：深色半透明面板 + 局部氛围背景；只有欢迎区/音乐/小说/RSS 卡片有氛围图，其余保持轻纹理。
import { useEffect, useState, createElement as h } from 'react'
import { api } from './api.js'
import { actions, getState } from './store.js'
import { player, prev, next, subscribePlayer, getPlayerState } from './player.js'
import { queueRssArticle } from './rss.jsx'
import { Icon, Empty, Btn, Input, LazyImage, coverSrc, fmtAgo } from './ui.jsx'

const CARD_META = {
  novel: { title: '小说阅读', icon: 'book', channel: 'novel' },
  comic: { title: '漫画', icon: 'comic', channel: 'comic' },
  gallery: { title: '图片广场', icon: 'image', channel: 'gallery' },
  music: { title: '音乐', icon: 'music', channel: 'music' },
  games: { title: '小游戏', icon: 'game', channel: 'games' },
  rss: { title: 'RSS 订阅', icon: 'rss', channel: 'rss' },
}

const GAME_META = { g2048: { name: '2048', emoji: '🔢' }, minesweeper: { name: '扫雷', emoji: '💣' }, sudoku: { name: '数独', emoji: '🧩' }, tetris: { name: '俄罗斯方块', emoji: '🧱' } }

const SEARCH_CHANNELS = [
  { id: 'novel', label: '小说' },
  { id: 'comic', label: '漫画' },
  { id: 'music', label: '音乐' },
  { id: 'gallery', label: '图片' },
]

function greeting() {
  const hour = new Date().getHours()
  if (hour < 5) return '夜深了'
  if (hour < 11) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

/** 首页卡片 书架/历史 切换态（localStorage 记忆；所选为空自动滑向另一栏）。 */
function useHomeCardTab(key) {
  const [tab, setTab] = useState(() => {
    try { return localStorage.getItem(key) === 'history' ? 'history' : 'shelf' } catch { return 'shelf' }
  })
  const pick = (t) => { setTab(t); try { localStorage.setItem(key, t) } catch { /* ignore */ } }
  return [tab, pick]
}

function CardTabChips({ tab, onPick, shelfN, histN }) {
  return h('div', { style: { display: 'flex', gap: 6, marginBottom: 8 } },
    h('button', { className: `fh-chip-btn${tab === 'shelf' ? ' is-on' : ''}`, onClick: () => onPick('shelf') }, `书架 ${shelfN}`),
    h('button', { className: `fh-chip-btn${tab === 'history' ? ' is-on' : ''}`, onClick: () => onPick('history') }, `历史 ${histN}`))
}

/* ---- 顶部欢迎区：氛围夜景图 + 问候语 + 全局快速搜索 ---- */
function HomeHero({ boot }) {
  const [channel, setChannel] = useState('novel')
  const [q, setQ] = useState('')
  const stats = [
    boot?.shelf?.length ? `书架 ${boot.shelf.length} 本` : null,
    (boot?.comicHistory?.length || boot?.comics?.length) ? `漫画 ${(boot.comicHistory?.length || 0) + (boot.comics?.length || 0)}` : null,
    boot?.playlists?.length ? `歌单 ${boot.playlists.length} 个` : null,
    boot?.rss?.feeds?.length ? `订阅 ${boot.rss.feeds.length} 源` : null,
  ].filter(Boolean)
  return h('section', { className: 'fh-hero' },
    h('div', { className: 'fh-hero-top' },
      h('div', null,
        h('div', { className: 'fh-hero-hi' }, `${greeting()} 👋`),
        h('div', { className: 'fh-hero-date' },
          new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }),
          stats.length ? ` · ${stats.join(' · ')}` : '')),
      h('button', { className: 'fh-btn fh-btn-ghost fh-btn-sm', onClick: () => actions.setView('settings', 'layout') },
        h(Icon, { name: 'grid', size: 13 }), ' 自定义布局')),
    h('div', { className: 'fh-hero-search' },
      SEARCH_CHANNELS.map((c) => h('button', {
        key: c.id, className: `fh-chip-btn${channel === c.id ? ' is-on' : ''}`,
        onClick: () => setChannel(c.id),
      }, c.label)),
      h('div', { className: 'fh-hero-input' },
        h(Input, { value: q, onChange: setQ, onEnter: () => actions.searchIn(channel, q),
          placeholder: channel === 'novel' ? '搜索书名 / 作者…' : channel === 'comic' ? '搜索漫画…' : channel === 'music' ? '搜索歌曲 / 歌手…' : '搜索图片（nature / 城市…）…' }),
        h(Btn, { kind: 'primary', onClick: () => actions.searchIn(channel, q), disabled: !q.trim() },
          h(Icon, { name: 'search', size: 13 }), ' 搜索'))))
}

export function Home() {
  const boot = getState().boot
  const layout = boot?.layout || []
  const cards = layout.filter((c) => c.show !== false)
  return h('div', { className: 'fh-page fh-home-hero' },
    h(HomeHero, { boot }),
    cards.length
      ? h('div', { className: 'fh-grid' }, cards.map((c) => h(DashCard, { key: c.type, config: c, boot })))
      : h(Empty, { icon: 'grid', title: '首页卡片都被隐藏了', hint: '到设置 → 首页布局 重新开启卡片', action: null }),
  )
}

function DashCard({ config, boot }) {
  const meta = CARD_META[config.type]
  if (!meta) return null
  return h('div', { className: `fh-card fh-card-type-${config.type} size-${config.size || '1x1'}` },
    h('div', { className: 'fh-card-head' },
      h('button', { className: 'fh-card-title', onClick: () => actions.setView(meta.channel) },
        h(Icon, { name: meta.icon, size: 15 }), meta.title),
      h('div', { className: 'fh-spacer' }),
      config.type === 'music' ? h('span', { className: 'fh-muted', style: { fontSize: 11 } }, 'MINI PLAYER') : null),
    h('div', { className: 'fh-card-body' },
      h(CardBody, { type: config.type, source: config.source || 'recent', boot })),
  )
}

function CardBody({ type, source, boot }) {
  switch (type) {
    case 'novel': return h(NovelCardBody, { boot })
    case 'comic': return h(ComicCardBody, { boot })
    case 'gallery': return h(GalleryCardBody, { boot })
    case 'music': return h(MusicCardBody, { boot })
    case 'games': return h(GamesCardBody, { boot })
    case 'rss': return h(RssCardBody, { boot })
    default: return null
  }
}

/* ---- 小说卡片：书架 / 最近阅读 可切换 ---- */
function NovelCardBody({ boot }) {
  const shelf = boot?.shelf || []
  const history = boot?.novelHistory || []
  const [tab, pick] = useHomeCardTab('funhub.home.novelTab')
  const effTab = (tab === 'shelf' && !shelf.length && history.length) ? 'history'
    : (tab === 'history' && !history.length && shelf.length) ? 'shelf' : tab
  const list = effTab === 'shelf' ? shelf.slice(0, 8) : history.slice(0, 8)
  if (!shelf.length && !history.length) {
    return h(Empty, { icon: 'book', title: '书架还是空的',
      hint: '先到 设置 → 阅读书源 导入书源，或在小说频道搜索公版书' })
  }
  return h('div', { style: { width: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 } },
    h(CardTabChips, { tab: effTab, onPick: pick, shelfN: shelf.length, histN: history.length }),
    h('div', { className: 'fh-card-row is-scroll' },
      list.map((b) => h('button', { key: b.bookId, className: 'fh-mini-item', onClick: () => openNovelFromShelf(b), title: b.title },
        b.cover ? h('img', { className: 'fh-mini-cover', src: coverSrc(b.cover), loading: 'lazy', alt: '', onError: (e) => { e.currentTarget.style.visibility = 'hidden' } }) : h('span', { className: 'fh-mini-cover' }, '📖'),
        h('span', { className: 't' }, b.title),
        h('span', { className: 's' }, effTab === 'history' ? (b.chapterTitle || '继续阅读') : '继续阅读')))),
  )
}

export async function openNovelFromShelf(book) {
  // 历史条目 / 书架书籍：legado 源走目录，gutenberg 走分片；历史条目直达章节
  const isGutenberg = book.sourceId === 'gutenberg'
  actions.openNovel({
    mode: isGutenberg ? 'gutenberg' : 'legado',
    sourceId: book.sourceId,
    bookId: book.bookId,
    title: book.title,
    author: book.author || '', cover: book.cover || '',
    chapterIndex: book.chapterIndex ?? null, // 历史条目直接回跳章节
  })
}

/* ---- 漫画卡片：书架 / 最近阅读 可切换 ---- */
function ComicCardBody({ boot }) {
  const shelf = boot?.comics || []
  const history = boot?.comicHistory || []
  const [tab, pick] = useHomeCardTab('funhub.home.comicTab')
  const effTab = (tab === 'shelf' && !shelf.length && history.length) ? 'history'
    : (tab === 'history' && !history.length && shelf.length) ? 'shelf' : tab
  const list = (effTab === 'shelf' ? shelf : history).slice(0, 8)
  if (!shelf.length && !history.length) {
    return h(Empty, { icon: 'comic', title: '还没有追的漫画',
      hint: '到 设置 → 漫画源 导入 venera 漫画源后搜索' })
  }
  return h('div', { style: { width: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 } },
    h(CardTabChips, { tab: effTab, onPick: pick, shelfN: shelf.length, histN: history.length }),
    h('div', { className: 'fh-card-row is-scroll' },
      list.map((c) => h('button', { key: `${c.sourceKey || c.sourceId}:${c.comicId}`, className: 'fh-mini-item', onClick: () => actions.openComic({ sourceId: c.sourceKey || c.sourceId, comicId: c.comicId, title: c.title, cover: c.cover || '', chapterIndex: null }) },
        c.cover ? h('img', { className: 'fh-mini-cover', src: c.cover, loading: 'lazy', alt: '', onError: (e) => { e.currentTarget.style.visibility = 'hidden' } }) : h('span', { className: 'fh-mini-cover' }, '📚'),
        h('span', { className: 't' }, c.title),
        h('span', { className: 's' }, c.chapterTitle || '继续阅读')))),
  )
}

/* ---- 图片卡片：收藏精选 ---- */
function GalleryCardBody({ boot }) {
  // 收藏（meta 内含图片信息）与浏览历史（条目即图片信息）两种形态合并展示
  const favs = (boot?.favorites || []).filter((f) => f.itemType === 'image')
  const history = boot?.imageHistory || []
  const seen = new Set()
  const merged = []
  for (const item of [...favs, ...history]) {
    const img = item.meta || item
    const src = img?.thumb || img?.url
    if (!img?.id || !src || seen.has(img.id)) continue
    seen.add(img.id)
    merged.push({ key: item.id || img.id, img })
    if (merged.length >= 9) break
  }
  if (!merged.length) {
    return h(Empty, { icon: 'image', title: '图片墙是空的', hint: '到图片广场逛逛，收藏喜欢的图片' })
  }
  // 3×3 满铺网格：行高 1fr 拉伸填满卡片 body，图片 cover 裁切不留白；不足 9 张用占位格补齐
  const cells = Array.from({ length: 9 }, (_, i) => i < merged.length ? merged[i] : null)
  return h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gridTemplateRows: 'repeat(3, minmax(0, 1fr))', gap: 6, width: '100%', height: '100%', minHeight: 0 } },
    cells.map((cell, i) => cell
      ? h('button', { key: cell.key, style: { border: 'none', padding: 0, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: 'var(--fh-panel-2)', display: 'block', width: '100%', height: '100%', minHeight: 0 },
          onClick: () => actions.openGallery(merged.map((m) => ({ url: m.img.url, thumb: m.img.thumb || m.img.url, title: m.img.title || m.img.author || '', author: m.img.author, source: m.img.source })), i) },
          h(LazyImage, { src: cell.img.thumb || cell.img.url, alt: cell.img.title || '', style: { width: '100%', height: '100%', minHeight: 0 } }))
      : h('div', { key: `pad-${i}`, style: { borderRadius: 8, background: 'color-mix(in srgb, var(--fh-panel-2) 55%, transparent)' } })),
  )
}

/* ---- 音乐卡片：常驻迷你播放器（封面/控制/进度），空闲时显示最近播放 ---- */
function MusicCardBody({ boot }) {
  const [snap, setSnap] = useState(() => getPlayerState())
  useEffect(() => subscribePlayer(() => setSnap(getPlayerState())), [])
  const track = snap.queue?.[snap.index]
  if (track) {
    const dur = snap.duration || track.duration || 0
    const pct = dur > 0 ? Math.min(100, (snap.position / dur) * 100) : 0
    const fmt = (s) => !s ? '0:00' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
    return h('div', { className: 'fh-hero-player' },
      h('div', { className: 'row' },
        track.cover
          ? h('img', { className: 'cover', src: track.cover, alt: '', onError: (e) => { e.currentTarget.style.display = 'none' } })
          : h('span', { className: 'cover ph' }, '🎵'),
        h('div', { className: 'meta' },
          h('button', { className: 'title', onClick: () => actions.setView('music'), title: '打开音乐频道' }, track.title || '未知曲目'),
          h('div', { className: 'artist' }, track.artist || '—', ' · ', snap.status === 'playing' ? '播放中' : snap.status === 'paused' ? '已暂停' : '就绪')),
        h('div', { className: 'ctrls' },
          h('button', { className: 'side', onClick: () => prev(), title: '上一首' }, h(Icon, { name: 'prev', size: 15 })),
          h('button', { className: 'main', onClick: () => player.toggle(), title: snap.status === 'playing' ? '暂停' : '播放' },
            h(Icon, { name: snap.status === 'playing' ? 'pause' : 'play', size: 16 })),
          h('button', { className: 'side', onClick: () => next(), title: '下一首' }, h(Icon, { name: 'next', size: 15 })))),
      h('div', { className: 'progress' },
        h('span', { className: 't' }, fmt(snap.position)),
        h('div', { className: 'bar', onClick: (e) => {
          if (!dur) return
          const rect = e.currentTarget.getBoundingClientRect()
          player.seek?.(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * dur)
        } },
          h('div', { className: 'fill', style: { width: `${pct}%` } })),
        h('span', { className: 't' }, fmt(dur))))
  }
  const history = boot?.playbackHistory || []
  if (!history.length) {
    return h(Empty, { icon: 'music', title: '还没有播放记录', hint: '搜索歌曲并播放，播放器会常驻底部' })
  }
  return h('div', { className: 'fh-card-row is-scroll', style: { width: '100%' } },
    history.slice(0, 8).map((t) => h('button', { key: t.trackId, className: 'fh-mini-item', onClick: () => player.setQueue([t.track], 0) },
      h('span', { className: 'fh-mini-art' }, '🎵'),
      h('span', { className: 't' }, t.track?.title || t.trackId),
      h('span', { className: 's' }, fmtAgo(t.at)))),
  )
}

/* ---- 小游戏卡片 ---- */
function GamesCardBody({ boot }) {
  const records = boot?.gameRecords || {}
  const favs = boot?.gameFavs || []
  const entries = Object.entries(records)
  const list = (favs.length ? favs.map((id) => [id, records[id]]) : entries).filter(Boolean).slice(0, 6)
  const show = list.length ? list : Object.keys(GAME_META).slice(0, 4).map((id) => [id, records[id]])
  return h('div', { className: 'fh-card-scroll', style: { width: '100%' } },
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, width: '100%' } },
    show.map(([id, rec]) => h('button', { key: id, className: 'fh-mini-item', style: { flexDirection: 'column', gap: 4, padding: '10px 4px', alignItems: 'center' },
      onClick: () => { actions.setView('games'); actions.openGame(id) } },
      h('span', { className: 'fh-mini-art', style: { width: 44, height: 44, fontSize: 22 } }, GAME_META[id]?.emoji || '🎮'),
      h('span', { style: { fontSize: 12 } }, GAME_META[id]?.name || id),
      h('span', { className: 'fh-muted', style: { fontSize: 10.5 } }, rec?.bestScore ? `最高 ${rec.bestScore}` : '未玩过')),
    )),
  )
}

/* ---- RSS 卡片 ---- */
function RssCardBody({ boot }) {
  const articles = (boot?.rss?.articles || []).slice(0, 12)
  const feeds = boot?.rss?.feeds || []
  if (!feeds.length) {
    return h(Empty, { icon: 'rss', title: '还没有订阅', hint: '添加你喜欢的博客或资讯 RSS 源' })
  }
  if (!articles.length) {
    return h(Empty, { icon: 'rss', title: '订阅还未刷新', hint: '到 RSS 频道点击刷新拉取最新文章' })
  }
  const feedName = (id) => feeds.find((f) => f.id === id)?.title || ''
  return h('div', { className: 'fh-card-row is-scroll', style: { width: '100%' } },
    articles.map((a) => h('button', { key: a.id, className: 'fh-mini-item', onClick: () => queueRssArticle(a) },
      h('span', { className: `fh-feed-dot${a.read ? ' is-read' : ''}` }),
      h('span', { className: 't' }, a.title),
      h('span', { className: 's' }, feedName(a.feedId).slice(0, 8)))),
  )
}
