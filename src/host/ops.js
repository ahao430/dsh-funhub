// 写操作集合：所有客户端变更都收敛为 {op, ...} 单一入口，串行落盘。
// plan §15：所有用户数据模型都按 WebDAV 同步友好设计（稳定 ID + updatedAt + 软删除约定）。
import { newId } from './store.js'

const MAX = {
  favorites: 2000,
  shelf: 500,
  imageHistory: 500,
  tracks: 500,
  playbackHistory: 200,
  rssArticles: 3000,
  novelHistory: 200,
  comicHistory: 200,
}

function push(list, item, cap) {
  list.unshift(item)
  if (cap && list.length > cap) list.length = cap
}

/** rsshub:// 协议展开：rsshub://<路由> → https://rsshub.app/<路由>；
 *  rsshub://<实例域名>/<路由> → https://<实例域名>/<路由>（自建实例）。其余 URL 原样返回。 */
function expandRsshubUrl(raw) {
  const u = String(raw || '').trim()
  const m = /^rsshub:\/\/([^/?#]+)(\/.*)?$/i.exec(u)
  if (!m) return u
  const host = m[1]
  const path = m[2] || ''
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host) ? `https://${host}${path}` : `https://rsshub.app/${host}${path}`
}

export const OPS = {
  /* ---- 首页布局 ---- */
  layout_save(state, { layout }) {
    if (!Array.isArray(layout)) throw new Error('布局数据无效')
    const valid = ['novel', 'comic', 'gallery', 'music', 'games', 'rss']
    const sizes = ['1x1', '2x1', '1x2', '2x2']
    state.layout = layout
      .filter((c) => c && valid.includes(c.type))
      .map((c) => ({ type: c.type, size: sizes.includes(c.size) ? c.size : '1x1', show: c.show !== false, source: c.source || 'recent' }))
    return { layout: state.layout }
  },

  /* ---- 统一收藏 ---- */
  fav_toggle(state, { itemType, itemId, meta }) {
    const at = state.favorites.findIndex((f) => f.itemType === itemType && f.itemId === itemId)
    if (at >= 0) {
      state.favorites.splice(at, 1)
      return { favorited: false }
    }
    push(state.favorites, { id: newId(), itemType, itemId: String(itemId), meta: meta || null, createdAt: Date.now() }, MAX.favorites)
    return { favorited: true }
  },

  /* ---- 小说 ---- */
  shelf_add(state, { book }) {
    const exists = state.shelf.some((b) => b.bookId === String(book.bookId))
    if (exists) return { added: false }
    push(state.shelf, {
      bookId: String(book.bookId), sourceId: book.sourceId || 'gutenberg',
      title: book.title, author: book.author, cover: book.cover || '', addedAt: Date.now(),
    }, MAX.shelf)
    return { added: true }
  },
  shelf_remove(state, { bookId }) {
    const at = state.shelf.findIndex((b) => b.bookId === String(bookId))
    if (at >= 0) state.shelf.splice(at, 1)
    return { removed: at >= 0 }
  },
  reading_progress(state, { bookId, chapterIndex, offset, ratio }) {
    state.readingProgress[String(bookId)] = {
      chapterIndex: chapterIndex | 0,
      offset: offset | 0,
      // 章节内位置比例（0~1）：滚动模式 scrollTop 占比 / 翻页模式 页码占比，跨模式恢复用
      ratio: Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0,
      updatedAt: Date.now(),
    }
    return { ok: true }
  },
  /** 小说自动阅读历史：打开章节即记（无论是否在书架），同书去重置顶。 */
  novel_history(state, { bookId, sourceId, title, author, cover, chapterIndex, chapterTitle }) {
    const id = String(bookId)
    const at = state.novelHistory.findIndex((b) => b.bookId === id)
    if (at >= 0) state.novelHistory.splice(at, 1)
    push(state.novelHistory, {
      bookId: id, sourceId: sourceId || 'gutenberg',
      title: title || '未知书目', author: author || '', cover: cover || '',
      chapterIndex: chapterIndex | 0, chapterTitle: chapterTitle || '',
      updatedAt: Date.now(),
    }, MAX.novelHistory)
    return { ok: true }
  },

/* ---- 漫画（venera 源） ---- */
  comicsource_add(state, { script, info, error }) {
    // 同 key 视为同一源：覆盖脚本与元信息，保留 id/启用状态/账号数据；避免重复导入清单堆出几百条
    const key = info?.key || ''
    if (key) {
      const at = state.comicSources.findIndex((s) => s.key === key)
      if (at >= 0) {
        const row = state.comicSources[at]
        state.comicSources[at] = {
          ...row, script, name: info?.name || row.name, key,
          version: info?.version || '', error: error || null,
        }
        return { added: false, updated: true, comicSource: { ...state.comicSources[at], script: undefined } }
      }
    }
    const row = {
      id: newId(),
      script,
      name: info?.name || '未命名漫画源',
      key: info?.key || '',
      version: info?.version || '',
      enabled: !error,
      data: {},
      settings: {},
      error: error || null,
      addedAt: Date.now(),
    }
    state.comicSources.push(row)
    return { added: true, updated: false, comicSource: { ...row, script: undefined } }
  },
  comicsource_remove(state, { id }) {
    state.comicSources = state.comicSources.filter((s) => s.id !== id)
    return { ok: true }
  },
  /** 清空全部漫画源（不可恢复，前端需二次确认） */
  comicsource_clear(state) {
    const removed = state.comicSources.length
    state.comicSources = []
    return { removed }
  },
  comicsource_toggle(state, { id, enabled }) {
    const row = state.comicSources.find((s) => s.id === id)
    if (row) row.enabled = enabled !== false
    return { ok: true }
  },
  comicsource_status(state, { id, error }) {
    const row = state.comicSources.find((s) => s.id === id)
    if (row) row.error = error ?? null
    return { ok: true }
  },
  comicsource_data(state, { id, data }) {
    const row = state.comicSources.find((s) => s.id === id)
    if (row) row.data = data || {}
    return { ok: true }
  },
  comic_shelf_add(state, { comic }) {
    const key = `${comic.comicId}@${comic.sourceKey}`
    if (state.comics.some((c) => `${c.comicId}@${c.sourceKey}` === key)) return { added: false }
    state.comics.push({
      sourceKey: comic.sourceKey, comicId: comic.comicId,
      title: comic.title || '', subtitle: comic.subtitle || '', cover: comic.cover || '',
      description: comic.description || '', addedAt: Date.now(),
    })
    return { added: true }
  },
  comic_shelf_remove(state, { sourceKey, comicId }) {
    state.comics = state.comics.filter((c) => !(c.comicId === comicId && c.sourceKey === sourceKey))
    return { ok: true }
  },
  comic_fav_toggle(state, { comic }) {
    const key = `${comic.comicId}@${comic.sourceKey}`
    const at = state.comicFavs.findIndex((c) => `${c.comicId}@${c.sourceKey}` === key)
    if (at >= 0) {
      state.comicFavs.splice(at, 1)
      return { favorited: false }
    }
    state.comicFavs.push({
      id: newId(), sourceKey: comic.sourceKey, comicId: comic.comicId,
      title: comic.title || '', cover: comic.cover || '', addedAt: Date.now(),
    })
    return { favorited: true }
  },
  comic_progress(state, { sourceKey, comicId, chapterId, chapterTitle }) {
    state.comicProgress[`${comicId}@${sourceKey}`] = { chapterId: String(chapterId), chapterTitle: chapterTitle || '', updatedAt: Date.now() }
    return { ok: true }
  },
  /** 漫画自动阅读历史：打开章节即记（无论是否在书架/收藏），同漫画去重置顶。 */
  comic_history(state, { sourceKey, comicId, title, cover, chapterId, chapterTitle }) {
    const key = `${comicId}@${sourceKey}`
    const at = state.comicHistory.findIndex((c) => `${c.comicId}@${c.sourceKey}` === key)
    if (at >= 0) state.comicHistory.splice(at, 1)
    push(state.comicHistory, {
      sourceKey: String(sourceKey || ''), comicId: String(comicId),
      title: title || '未知漫画', cover: cover || '',
      chapterId: String(chapterId || ''), chapterTitle: chapterTitle || '',
      updatedAt: Date.now(),
    }, MAX.comicHistory)
    return { ok: true }
  },

  /* ---- 影视（Emby，用户自行添加，不内置） ---- */
  /** Emby 服务器入库（host 侧已验证连通/换取 token）。 */
  video_emby_add(state, { server }) {
    if (!server?.url || !server?.apiKey || !server?.userId) throw new Error('Emby 服务器信息不完整')
    const exists = state.settings.video.emby.find((s) => s.url.replace(/\/$/, '') === String(server.url).replace(/\/$/, ''))
    if (exists) {
      Object.assign(exists, { apiKey: String(server.apiKey), userId: String(server.userId), name: String(server.name || exists.name || 'Emby') })
      return { added: false, id: exists.id }
    }
    const row = { id: newId(), url: String(server.url).replace(/\/$/, ''), apiKey: String(server.apiKey), userId: String(server.userId), name: String(server.name || 'Emby') }
    state.settings.video.emby.push(row)
    return { added: true, id: row.id }
  },
  video_emby_remove(state, { id }) {
    state.settings.video.emby = state.settings.video.emby.filter((s) => s.id !== id)
    return { ok: true }
  },
  /** 清空全部 Emby 服务器（前端需二次确认） */
  video_emby_clear(state) {
    const removed = (state.settings.video?.emby || []).length
    state.settings.video.emby = []
    return { removed }
  },

  /* ---- 图片 ---- */
  image_seen(state, { image }) {
    const at = state.imageHistory.findIndex((i) => i.id === image.id)
    if (at >= 0) state.imageHistory.splice(at, 1)
    push(state.imageHistory, {
      id: image.id, url: image.url, thumb: image.thumb || image.url, w: image.w, h: image.h,
      author: image.author || '', source: image.source || '', title: image.title || '', addedAt: Date.now(),
    }, MAX.imageHistory)
    return { ok: true }
  },

  /* ---- 音乐 ---- */
  track_played(state, { track }) {
    const at = state.playbackHistory.findIndex((t) => t.trackId === track.id)
    if (at >= 0) state.playbackHistory.splice(at, 1)
    push(state.playbackHistory, { trackId: track.id, track, at: Date.now() }, MAX.playbackHistory)
    return { ok: true }
  },
  playlist_create(state, { name }) {
    const pl = { id: newId(), name: String(name || '新建歌单').slice(0, 40), trackIds: [], createdAt: Date.now(), updatedAt: Date.now() }
    state.playlists.push(pl)
    return { playlist: pl }
  },
  /** 网易歌单导入：曲目元数据入库 + 建歌单（同名同源跳过重建，幂等）。 */
  playlist_import(state, { name, tracks }) {
    if (!Array.isArray(tracks) || !tracks.length) throw new Error('歌单曲目为空')
    const plName = String(name || '导入歌单').slice(0, 60)
    const ids = []
    for (const t of tracks.slice(0, 300)) {
      const meta = {
        id: t.id, title: t.name || t.title || '未知曲目', artist: t.singer || t.artist || '',
        album: t.albumName || t.album || '', cover: t.cover || '',
        channel: 'wy', sourceId: 'netease',
        musicInfo: t.musicInfo || { id: String(t.id || '').replace(/^wy-/, '') },
      }
      const existing = state.tracks.find((x) => x.id === meta.id)
      if (existing) Object.assign(existing, meta)
      else state.tracks.push(meta)
      ids.push(meta.id)
    }
    if (state.tracks.length > 1500) state.tracks.splice(0, state.tracks.length - 1500)
    // 幂等：同名歌单直接替换曲目集合
    let pl = state.playlists.find((x) => x.name === plName)
    if (pl) {
      pl.trackIds = ids
      pl.updatedAt = Date.now()
    } else {
      pl = { id: newId(), name: plName, trackIds: ids, createdAt: Date.now(), updatedAt: Date.now() }
      state.playlists.push(pl)
    }
    return { playlist: pl, count: ids.length }
  },
  playlist_remove(state, { id }) {
    const at = state.playlists.findIndex((p) => p.id === id)
    if (at >= 0) state.playlists.splice(at, 1)
    return { ok: true }
  },
  playlist_add_track(state, { id, trackId, track }) {
    const pl = state.playlists.find((p) => p.id === id)
    if (!pl) throw new Error('歌单不存在')
    // 曲目元数据落库（临时 URL 不入库，播放时重新解析），歌单只存稳定 ID
    if (track && typeof track === 'object' && track.id) {
      const existing = state.tracks.find((t) => t.id === track.id)
      if (existing) Object.assign(existing, { ...track, audioUrl: track.sourceId === 'local' ? track.audioUrl : undefined })
      else state.tracks.push({ ...track, audioUrl: track.sourceId === 'local' ? track.audioUrl : undefined })
      if (state.tracks.length > 1500) state.tracks.splice(0, state.tracks.length - 1500)
    }
    if (!pl.trackIds.includes(trackId)) pl.trackIds.push(trackId)
    pl.updatedAt = Date.now()
    return { playlist: pl }
  },
  playlist_remove_track(state, { id, trackId }) {
    const pl = state.playlists.find((p) => p.id === id)
    if (!pl) throw new Error('歌单不存在')
    pl.trackIds = pl.trackIds.filter((t) => t !== trackId)
    pl.updatedAt = Date.now()
    return { playlist: pl }
  },
  player_settings(state, { player }) {
    state.settings.player = { ...state.settings.player, ...player }
    return { player: state.settings.player }
  },
  /** 播放队列持久化：只存元数据（实际播放时重新解析 URL，plan §4.7）。 */
  player_queue_save(state, { queue, index, position }) {
    if (!Array.isArray(queue)) throw new Error('队列数据无效')
    const clean = queue.slice(0, 500).map((t) => {
      const track = {
        id: t.id, title: t.title, artist: t.artist, album: t.album,
        cover: t.cover, channel: t.channel, quality: t.quality,
        sourceId: t.sourceId, musicInfo: t.musicInfo || null,
      }
      // 本地文件的 URL 稳定，直接保留；在线源 URL 为临时解析结果，恢复时重新解析
      if (t.sourceId === 'local') track.audioUrl = t.audioUrl
      return track
    })
    state.playerQueue = {
      queue: clean,
      index: Math.max(0, Math.min(index | 0, Math.max(0, clean.length - 1))),
      position: Math.max(0, Math.min(86_400, Number(position) || 0)),
      updatedAt: Date.now(),
    }
    return { count: clean.length }
  },
  reader_settings(state, { reader }) {
    state.settings.reader = { ...state.settings.reader, ...reader }
    return { reader: state.settings.reader }
  },

  /* ---- 游戏 ---- */
  game_record(state, { gameId, score, savedState }) {
    const rec = state.gameRecords[gameId] || { bestScore: 0, lastScore: 0, playCount: 0 }
    rec.lastScore = score ?? rec.lastScore
    if (typeof score === 'number' && score > (rec.bestScore || 0)) rec.bestScore = score
    rec.playCount += 1
    rec.lastPlayedAt = Date.now()
    if (savedState !== undefined) {
      const json = JSON.stringify(savedState)
      if (json.length < 200_000) rec.savedState = savedState
    }
    state.gameRecords[gameId] = rec
    return { record: rec }
  },
  game_save(state, { gameId, savedState }) {
    const rec = state.gameRecords[gameId] || { bestScore: 0, lastScore: 0, playCount: 0 }
    const json = JSON.stringify(savedState)
    if (json.length >= 200_000) throw new Error('存档过大')
    rec.savedState = savedState
    rec.lastPlayedAt = Date.now()
    state.gameRecords[gameId] = rec
    return { record: rec }
  },
  game_fav_toggle(state, { gameId }) {
    const at = state.gameFavs.indexOf(gameId)
    if (at >= 0) state.gameFavs.splice(at, 1)
    else state.gameFavs.push(gameId)
    return { favorited: at < 0 }
  },

  /* ---- RSS ---- */
  rss_add(state, { url, title, category }) {
    url = expandRsshubUrl(url)
    if (state.rss.feeds.some((f) => f.url === url)) throw new Error('该订阅已存在')
    const feed = { id: newId(), url, title: title || url, category: category || '', lastFetchedAt: 0 }
    state.rss.feeds.push(feed)
    return { feed }
  },
  rss_remove(state, { id }) {
    state.rss.feeds = state.rss.feeds.filter((f) => f.id !== id)
    state.rss.articles = state.rss.articles.filter((a) => a.feedId !== id)
    return { ok: true }
  },
  rss_read(state, { articleId }) {
    const a = state.rss.articles.find((x) => x.id === articleId)
    if (a) a.read = true
    return { ok: true }
  },
  rss_read_all(state, { feedId }) {
    for (const a of state.rss.articles) if (!feedId || a.feedId === feedId) a.read = true
    return { ok: true }
  },
  rss_store(state, { feed, articles }) {
    const existing = state.rss.feeds.find((f) => f.id === feed.id)
    if (existing) Object.assign(existing, feed)
    else state.rss.feeds.push(feed)
    const byKey = new Map(state.rss.articles.map((a) => [`${a.feedId}|${a.link}|${a.title}`, a]))
    for (const art of articles) {
      const key = `${art.feedId}|${art.link}|${art.title}`
      const old = byKey.get(key)
      if (old) {
        old.summary = art.summary || old.summary
        old.content = art.content || old.content
        old.publishedAt = art.publishedAt
      } else {
        byKey.set(key, art)
      }
    }
    let all = [...byKey.values()]
    all.sort((a, b) => b.publishedAt - a.publishedAt)
    state.rss.articles = all.slice(0, MAX.rssArticles)
    return { feed: existing || feed, count: articles.length }
  },

  /* ---- 设置 ---- */
  settings_save(state, { settings }) {
    if (settings?.imageSources) {
      for (const [k, v] of Object.entries(settings.imageSources)) {
        state.settings.imageSources[k] = { ...(state.settings.imageSources[k] || {}), ...(v && typeof v === 'object' ? v : {}) }
      }
    }
    if (settings?.theme) state.settings.theme = settings.theme
    if (settings?.accent !== undefined) state.settings.accent = String(settings.accent || '').slice(0, 32)
    if (settings?.atmosphere !== undefined) state.settings.atmosphere = Boolean(settings.atmosphere)
    if (settings?.backgrounds && typeof settings.backgrounds === 'object') {
      const allowed = ['home', 'music', 'novel', 'rss', 'games']
      for (const [k, v] of Object.entries(settings.backgrounds)) {
        if (!allowed.includes(k)) continue
        state.settings.backgrounds[k] = String(v || '').slice(0, 300)
      }
    }
    if (settings?.lastSource && typeof settings.lastSource === 'object') {
      state.settings.lastSource = { ...state.settings.lastSource, ...settings.lastSource }
    }
    if (settings?.proxy && typeof settings.proxy === 'object') {
      state.settings.proxy = {
        enabled: Boolean(settings.proxy.enabled),
        host: String(settings.proxy.host || '127.0.0.1').replace(/[^0-9a-zA-Z.:[\]-]/g, '').slice(0, 64) || '127.0.0.1',
        port: Math.max(1, Math.min(65535, Number(settings.proxy.port) || 0)) || 7890,
      }
    }
    if (settings?.music) state.music = { ...state.music, ...settings.music }
    return { settings: state.settings, music: state.music }
  },

  /* ---- 阅读3.0 书源 ---- */
  booksource_add(state, { source }) {
    if (state.bookSources.some((s) => s.url === source.bookSourceUrl)) {
      return { added: false, reason: 'duplicate' }
    }
    const row = {
      id: newId(),
      raw: source,
      name: source.bookSourceName || source.bookSourceUrl,
      url: source.bookSourceUrl,
      group: source.bookSourceGroup || '',
      enabled: source.enabled !== false,
      compatible: null, // 由宿主在测试时填充
      issues: [],
      addedAt: Date.now(),
    }
    state.bookSources.push(row)
    return { added: true, bookSource: row }
  },
  /** 书源批量导入：大书源包（几百~几千个源）一次写入单次落盘，避免逐个全量写盘。 */
  booksource_add_many(state, { sources }) {
    if (!Array.isArray(sources)) throw new Error('书源列表无效')
    const seen = new Set(state.bookSources.map((s) => s.url))
    let added = 0
    let skipped = 0
    for (const source of sources) {
      if (!source || typeof source !== 'object' || !source.bookSourceUrl) { skipped += 1; continue }
      if (seen.has(source.bookSourceUrl)) { skipped += 1; continue }
      seen.add(source.bookSourceUrl)
      state.bookSources.push({
        id: newId(),
        raw: source,
        name: source.bookSourceName || source.bookSourceUrl,
        url: source.bookSourceUrl,
        group: source.bookSourceGroup || '',
        enabled: source.enabled !== false,
        compatible: null, // 由宿主在测试时填充
        issues: [],
        addedAt: Date.now(),
      })
      added += 1
    }
    return { added, skipped }
  },
  /* 清理无效源：书源=不兼容（JS 规则等）；音源=报错或无能力 */
  booksource_clean(state) {
    const before = state.bookSources.length
    state.bookSources = state.bookSources.filter((s) => s.compatible !== false)
    return { removed: before - state.bookSources.length }
  },
  lxsource_clean(state) {
    const before = state.lxSources.length
    const seen = new Set()
    state.lxSources = state.lxSources.filter((s) => {
      if (s.error || Object.keys(s.capabilities || {}).length === 0) return false
      const k = `${s.name}|${s.version || ''}`
      if (seen.has(k)) return false // 重复导入
      seen.add(k)
      return true
    })
    return { removed: before - state.lxSources.length }
  },
  booksource_remove(state, { id }) {
    state.bookSources = state.bookSources.filter((s) => s.id !== id)
    return { ok: true }
  },
  /** 清空全部书源（不可恢复，前端需二次确认） */
  booksource_clear(state) {
    const removed = state.bookSources.length
    state.bookSources = []
    return { removed }
  },
  booksource_toggle(state, { id, enabled }) {
    const row = state.bookSources.find((s) => s.id === id)
    if (row) row.enabled = enabled !== false
    return { ok: true }
  },
  booksource_compat(state, { id, compatible, issues }) {
    const row = state.bookSources.find((s) => s.id === id)
    if (row) {
      row.compatible = compatible
      row.issues = issues || []
    }
    return { ok: true }
  },

  /* ---- 洛雪音源 ---- */
  lxsource_add(state, { script, meta, capabilities, error }) {
    // 重复导入拦截：同名同版本视为重复
    const name = meta?.name || '未命名音源'
    if (state.lxSources.some((s) => s.name === name && (s.version || '') === (meta?.version || ''))) {
      return { added: false, reason: 'duplicate' }
    }
    const row = {
      id: newId(),
      name: meta?.name || '未命名音源',
      version: meta?.version || '',
      author: meta?.author || '',
      script,
      enabled: !error,
      capabilities: capabilities || {},
      error: error || null,
      addedAt: Date.now(),
    }
    state.lxSources.push(row)
    return { added: true, lxSource: { ...row, script: undefined } }
  },
  lxsource_remove(state, { id }) {
    state.lxSources = state.lxSources.filter((s) => s.id !== id)
    return { ok: true }
  },
  lxsource_toggle(state, { id, enabled }) {
    const row = state.lxSources.find((s) => s.id === id)
    if (row) row.enabled = enabled !== false
    return { ok: true }
  },
  lxsource_status(state, { id, capabilities, error }) {
    const row = state.lxSources.find((s) => s.id === id)
    if (row) {
      row.capabilities = capabilities || row.capabilities
      row.error = error ?? null
    }
    return { ok: true }
  },

  /* ---- 数据 ---- */
  data_export(state) {
    return { snapshot: state }
  },
  data_clear(state, { scope }) {
    switch (scope) {
      case 'imageHistory': state.imageHistory = []; break
      case 'playbackHistory': state.playbackHistory = []; break
      case 'rssArticles': state.rss.articles = []; break
      case 'favorites': state.favorites = []; break
      case 'novelHistory': state.novelHistory = []; break
      case 'comicHistory': state.comicHistory = []; break
      case 'all': Object.assign(state, {
        favorites: [], shelf: [], readingProgress: {}, comicFavs: [], comicProgress: {},
        imageHistory: [], tracks: [], playlists: [], playbackHistory: [],
        rss: { feeds: [], articles: [] }, gameRecords: {}, gameFavs: [],
      }); break
      default: throw new Error('未知的清理范围')
    }
    return { ok: true }
  },
}
