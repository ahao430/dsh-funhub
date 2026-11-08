// 持久化：$DSH_HOME/funhub/state.json + files/ 目录。
// 参照 dsh-media-desk 的存储约定：桌面端和 Web 端读同一份数据，
// 两个 Host 进程可能同时运行，写入前按 mtime 判断是否需要重读；
// 串行队列避免同一进程内的并发写互相覆盖。
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { sourceCompatibility } from './legado.js'

export function dshHome(env = process.env) {
  return env.DSH_HOME || join(homedir(), '.dsh')
}

export function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export function defaultLayout() {
  // 4 列网格满排（4+4），避免右侧留洞
  return [
    { type: 'novel', size: '2x1', show: true, source: 'recent' },
    { type: 'comic', size: '1x1', show: true, source: 'recent' },
    { type: 'gallery', size: '1x1', show: true, source: 'favorites' },
    { type: 'music', size: '1x1', show: true, source: 'recent' },
    { type: 'games', size: '2x1', show: true, source: 'recent' },
    { type: 'rss', size: '1x1', show: true, source: 'latest' },
  ]
}

/** 旧版默认布局（第二行 5 列溢出）：用于一次性迁移到新默认。 */
const OLD_DEFAULT_LAYOUT = [
  { type: 'novel', size: '2x1', show: true, source: 'recent' },
  { type: 'comic', size: '1x1', show: true, source: 'recent' },
  { type: 'gallery', size: '1x1', show: true, source: 'favorites' },
  { type: 'music', size: '1x1', show: true, source: 'recent' },
  { type: 'games', size: '2x1', show: true, source: 'recent' },
  { type: 'rss', size: '2x1', show: true, source: 'latest' },
]

export function defaultState() {
  return {
    version: 1,
    settings: {
      theme: 'dark',
      imageSources: { picsum: { enabled: true }, bing: { enabled: true }, wallhaven: { enabled: true, apiKey: '' }, artic: { enabled: true }, nasa: { enabled: true }, wikimedia: { enabled: true }, pexels: { enabled: false, apiKey: '' }, unsplash: { enabled: false, apiKey: '' }, pixabay: { enabled: false, apiKey: '' } },
      player: { mode: 'sequence', volume: 0.8, iconPos: null },
      reader: { fontSize: 18, lineHeight: 1.9, theme: 'dark', margin: 0.12 },
      proxy: { enabled: false, host: '127.0.0.1', port: 7890 }, // 出站代理（书源/图源/RSS/脚本沙箱统一走）
      lastSource: {}, // 各频道记住的源选择：{novel, comic, image}（设置页外由页面自动写）
      video: { emby: [] }, // 影视：Emby 服务器，由用户填写（TVBox 已移除）
      backgrounds: { // 各槽位背景图 URL（预置素材或用户上传 /funhub/api/bg/<slot>）
        home: '/funhub/api/asset/home-bg.webp',
        music: '/funhub/api/asset/music-bg.webp',
        novel: '/funhub/api/asset/novel-bg.webp',
        rss: '/funhub/api/asset/rss-bg.webp',
        games: '/funhub/api/asset/games-bg.webp',
      },
    },
    layout: defaultLayout(),
    favorites: [],          // {id, itemType, itemId, meta, createdAt}
    shelf: [],              // {bookId, sourceId, title, author, cover, addedAt}（小说书架）
    readingProgress: {},    // bookId -> {chapterIndex, offset, updatedAt}
    novelHistory: [],       // 小说自动阅读历史（与手动书架分离）：{bookId, sourceId, title, author, cover, chapterIndex, chapterTitle, updatedAt}
    comicFavs: [],          // {id, sourceKey, comicId, title, cover, addedAt}（漫画收藏）
    comicProgress: {},      // comicId@sourceKey -> {chapterId, chapterTitle, updatedAt}
    comicHistory: [],       // 漫画自动阅读历史：{sourceKey, comicId, title, cover, chapterId, chapterTitle, updatedAt}
    imageHistory: [],       // {id, url, thumb, w, h, author, source, addedAt}
    tracks: [],             // {id, title, artist, album, file, duration, size, addedAt}（本地上传）
    playlists: [],          // {id, name, trackIds, createdAt, updatedAt}
    playbackHistory: [],    // {trackId, at}
    rss: { feeds: [], articles: [] }, // feeds: {id,title,url,category,lastFetchedAt}; articles: {id,feedId,title,link,summary,content,publishedAt,read}
    gameRecords: {},        // gameId -> {bestScore, lastScore, playCount, lastPlayedAt,savedState}
    gameFavs: [],
    bookSources: [],        // 阅读3.0 书源：{id, raw, name, url, group, enabled, compatible, issues, addedAt}
    lxSources: [],          // 洛雪音源：{id, name, version, author, script, enabled, capabilities, error, addedAt}
    comicSources: [],       // venera 漫画源：{id, script, name, key, version, enabled, data, settings, error, addedAt}
    comics: [],             // 漫画书架：{id(comicId@sourceKey), sourceKey, comicId, title, subtitle, cover, description, addedAt}
    comicProgress: {},      // comicId@sourceKey -> {chapterId, chapterTitle, updatedAt}
    comicHistory: [],       // 漫画自动阅读历史：{sourceKey, comicId, title, cover, chapterId, chapterTitle, updatedAt}
    playerQueue: null,      // 播放队列持久化：{queue(去临时URL), index, updatedAt}
    music: { quality: '320k', channel: 'wy' },
  }
}

export function migrate(state) {
  const next = { ...defaultState(), ...(state || {}) }
  next.settings = { ...defaultState().settings, ...(state?.settings || {}) }
  next.settings.imageSources = { ...defaultState().settings.imageSources, ...(state?.settings?.imageSources || {}) }
  next.settings.player = { ...defaultState().settings.player, ...(state?.settings?.player || {}) }
  next.settings.lastSource = { ...defaultState().settings.lastSource, ...(state?.settings?.lastSource || {}) }
  next.settings.backgrounds = { ...defaultState().settings.backgrounds, ...(state?.settings?.backgrounds || {}) }
  next.settings.reader = { ...defaultState().settings.reader, ...(state?.settings?.reader || {}) }
  next.settings.video = { emby: [], subtitleProviders: {}, ...(state?.settings?.video || {}) }
  delete next.settings.video.tvbox // TVBox 已移除：丢弃历史遗留的站点数据
  if (!Array.isArray(next.settings.video.emby)) next.settings.video.emby = []
  next.rss = { feeds: [], articles: [], ...(state?.rss || {}) }
  for (const key of ['favorites', 'shelf', 'comicFavs', 'imageHistory', 'tracks', 'playlists', 'playbackHistory', 'gameFavs', 'bookSources', 'lxSources', 'comicSources', 'comics', 'novelHistory', 'comicHistory']) {
    if (!Array.isArray(next[key])) next[key] = []
  }
  next.music = { quality: '320k', channel: 'wy', ...(state?.music || {}) }
  for (const key of ['readingProgress', 'comicProgress', 'gameRecords']) {
    if (!next[key] || typeof next[key] !== 'object') next[key] = {}
  }
  if (!Array.isArray(next.layout)) next.layout = defaultLayout()
  // 旧版默认布局（右侧留洞）一次性迁移；用户自定义过的布局不动
  if (JSON.stringify(next.layout) === JSON.stringify(OLD_DEFAULT_LAYOUT)) {
    next.layout = defaultLayout()
  }
  // 漫画源按 key 去重（历史版本导入不去重，同一清单可能堆出几百条）；同 key 保留最新一份，
  // 无 key 的行（解析失败的脚本）逐条保留，便于单独删除
  if (next.comicSources.length > 1) {
    const seen = new Map()
    for (const s of next.comicSources) {
      const k = s.key || `id:${s.id}`
      const prev = seen.get(k)
      if (!prev || (s.addedAt || 0) >= (prev.addedAt || 0)) seen.set(k, s)
    }
    next.comicSources = [...seen.values()]
  }
  // 兼容判定升级（JS 规则已由沙箱子集支持）：重算书源兼容标记，旧版被判死的 JS 源恢复参与探测
  if (Array.isArray(next.bookSources)) {
    for (const b of next.bookSources) {
      if (b?.raw && typeof b.raw === 'object') {
        try {
          const c = sourceCompatibility(b.raw)
          b.compatible = c.compatible
          b.issues = c.issues
        } catch { /* 单个源计算失败保持原值 */ }
      }
    }
  }
  return next
}

export class Store {
  constructor(root = join(dshHome(), 'funhub')) {
    this.root = root
    this.file = join(root, 'state.json')
    this.filesDir = join(root, 'files')
    this.cacheDir = join(root, 'cache')
    this.backgroundsDir = join(root, 'backgrounds')
    this.state = null
    this.mtimeMs = 0
    this.queue = Promise.resolve()
  }

  async refresh() {
    await mkdir(this.filesDir, { recursive: true })
    await mkdir(this.cacheDir, { recursive: true })
    await mkdir(this.backgroundsDir, { recursive: true })
    let info = null
    try {
      info = await stat(this.file)
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
    if (!info) {
      this.state = defaultState()
      await this.persist()
      return
    }
    if (this.state && info.mtimeMs === this.mtimeMs) return
    const raw = await readFile(this.file, 'utf8').catch(() => null)
    this.state = migrate(raw ? JSON.parse(raw) : null)
    this.mtimeMs = info.mtimeMs
  }

  async persist() {
    const tmp = `${this.file}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(this.state))
    await rename(tmp, this.file)
    this.mtimeMs = (await stat(this.file)).mtimeMs
  }

  /** 串行执行，避免同一进程内的并发写互相覆盖。 */
  run(task) {
    const next = this.queue.then(task, task)
    this.queue = next.catch(() => {})
    return next
  }

  read() {
    return this.run(async () => {
      await this.refresh()
      return this.state
    })
  }

  async write(mutate) {
    return this.run(async () => {
      await this.refresh()
      const result = await mutate(this.state)
      await this.persist()
      return result
    })
  }
}
