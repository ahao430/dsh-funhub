// /funhub/* HTTP 路由：引导数据 / 写操作单入口 / 各内容源代理 / 文件与图片服务。
import { createReadStream, existsSync } from 'node:fs'
import { rm, stat, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { OPS } from './ops.js'
import { newId } from './store.js'
import { safeFetchBuffer, safeFetchJson, safeFetchLx, safeFetchText, assertSafeUrl, assertPublicHost, FetchError, setOutboundProxy, makeProxyDispatcher, fetchViaProxy } from './fetcher.js'
import { parseFeed, repairEscapedHtml } from './rss.js'
import { embyValidate, embyAuthByName, embyViews, embyItems, embyEpisodes, embyDetail, embyStreamUrl, embyHlsUrl, embyPosterUrl, rewriteM3u8 } from './video.js'
import { sanitizeHtml } from './sanitize.js'
import { novelSearch, novelPopular, novelDetail, novelContent, imageFeed, musicSearch, musicTracks } from './proxy.js'
import { legadoSearch, legadoExplore, exploreCategories, legadoDetail, legadoToc, legadoContent, sourceCompatibility } from './legado.js'
import { LxRuntime, parseScriptMeta } from './lx-runtime.js'
import { VeneraRuntime } from './venera-runtime.js'
import { SEARCH_CHANNELS } from './music-search.js'

const MAX_JSON = 2_000_000
// 书源整包导入例外：阅读3.0 书源包常见几 MB ~ 几十 MB，走单独上限
const MAX_IMPORT_JSON = 100_000_000
const MAX_UPLOAD = 100_000_000
const MAX_SCRIPT = 2_000_000
const ASSETS_DIR = join(new URL('.', import.meta.url).pathname, '..', '..', 'assets')
const BG_SLOTS = ['home', 'music', 'novel', 'rss', 'games']
const AUDIO_MIME = { '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.opus': 'audio/opus', '.wav': 'audio/wav', '.flac': 'audio/flac' }

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

async function readBuffer(req, limit) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw Object.assign(new Error('内容太大'), { status: 413 })
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function readJson(req, limit = MAX_JSON) {
  const raw = await readBuffer(req, limit)
  if (!raw.length) return {}
  try {
    return JSON.parse(raw.toString('utf8'))
  } catch {
    throw Object.assign(new Error('请求不是有效的 JSON'), { status: 400 })
  }
}

/** 支持 Range，音频才能正常拖动。 */
async function sendFile(req, res, file, mime) {
  let info
  try {
    info = await stat(file)
  } catch {
    return json(res, 404, { error: '文件不存在' })
  }
  res.setHeader('content-type', mime)
  res.setHeader('accept-ranges', 'bytes')
  res.setHeader('cache-control', mime.startsWith('image/') ? 'private, max-age=604800' : 'private, max-age=3600')
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '')
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]))
    const end = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1
    if (start >= info.size || start > end) {
      res.statusCode = 416
      res.setHeader('content-range', `bytes */${info.size}`)
      return res.end()
    }
    res.statusCode = 206
    res.setHeader('content-range', `bytes ${start}-${end}/${info.size}`)
    res.setHeader('content-length', end - start + 1)
    return createReadStream(file, { start, end }).pipe(res)
  }
  res.setHeader('content-length', info.size)
  return createReadStream(file).pipe(res)
}

/** 引导状态（源脚本不回传，节省体积）。 */
function publicState(state) {
  return {
    ...state,
    bookSources: state.bookSources.map((s) => ({ ...s, raw: undefined, exploreCount: exploreCategories(s.raw).length })),
    lxSources: state.lxSources.map((s) => ({ ...s, script: undefined })),
    comicSources: state.comicSources.map((s) => ({ ...s, script: undefined, data: undefined })),
    // 出口兜底：旧版本入库的转义/双重转义正文；修复出真实标签后必须重新消毒（原样者此前已消毒）
    rss: {
      ...state.rss,
      articles: (state.rss?.articles || []).map((a) => {
        if (!a?.content) return a
        const fixed = repairEscapedHtml(a.content)
        if (fixed === a.content) return a
        return { ...a, content: sanitizeHtml(fixed, { proxyImages: true }) }
      }),
    },
    // Emby apiKey 只留在宿主，客户端只见服务器元数据
    settings: {
      ...state.settings,
      video: {
        emby: (state.settings?.video?.emby || []).map((s) => ({ ...s, apiKey: undefined })),
      },
    },
  }
}

/* ============ 运行时缓存（内存） ============ */
const lxRuntimes = new Map()      // lxSourceId -> LxRuntime
const veneraRuntimes = new Map()  // comicSourceId -> VeneraRuntime

/* runtime 日志出口（route 时绑定真实 logger；模块级函数不能闭包引用 route 的 ctx） */
let runtimeLogger = { warn: () => {} }

/* 清单导入后台任务进度（易失状态，不入盘） */
const manifestImport = { running: false, total: 0, done: 0, added: 0, skipped: 0, failed: [], startedAt: 0, finishedAt: 0 }

/* 书源在线探测清理进度（易失状态） */
const bookClean = { running: false, stop: false, total: 0, done: 0, removed: 0, kept: 0, skipped: 0, current: '', removedNames: [], startedAt: 0, updatedAt: 0, finishedAt: 0 }

/* 漫画源在线探测清理进度（易失状态） */
const comicClean = { running: false, total: 0, done: 0, removed: 0, kept: 0, current: '', removedNames: [], startedAt: 0, finishedAt: 0 }
const videoClean = { running: false, stop: false, total: 0, done: 0, ok: 0, failed: 0, failedNames: [], current: '', startedAt: 0, updatedAt: 0, finishedAt: 0 }

/* 当前出站代理 URL（route 时随 state 同步；供子进程沙箱启动时携带） */
let currentProxyUrl = ''

function getLxRuntime(store, row) {
  let runtime = lxRuntimes.get(row.id)
  if (!runtime || runtime.scriptText !== row.script) {
    runtime?.dispose()
    runtime = new LxRuntime(row.script, { onLog: (level, line) => runtimeLogger.warn(`[funhub:lx ${row.name}] ${line}`), proxy: currentProxyUrl })
    lxRuntimes.set(row.id, runtime)
  }
  return runtime
}

function getVeneraRuntime(store, row) {
  let runtime = veneraRuntimes.get(row.id)
  if (!runtime || runtime.scriptText !== row.script) {
    runtime?.dispose()
    runtime = new VeneraRuntime(row.script, {
      data: row.data || {}, settings: row.settings || {},
      onLog: (level, line) => runtimeLogger.warn(`[funhub:comic ${row.name}] ${line}`),
      proxy: currentProxyUrl,
    })
    runtime.onDataChange = () => {
      // 脚本数据落盘（防抖由串行队列天然保证一致性即可）
      void store.write((state) => OPS.comicsource_data(state, { id: row.id, data: runtime.data })).catch(() => {})
    }
    veneraRuntimes.set(row.id, runtime)
  }
  return runtime
}

/** 代理配置变更后：丢弃全部脚本沙箱（下次使用按新代理重启子进程）。 */
function disposeRuntimes() {
  for (const rt of lxRuntimes.values()) rt.dispose()
  for (const rt of veneraRuntimes.values()) rt.dispose()
  lxRuntimes.clear()
  veneraRuntimes.clear()
}

/* ============ 网易云榜单矩阵（公开歌单 API，实测可用） ============ */
const NETEASE_BILLBOARDS = [
  { id: '3778678', name: '热歌榜' },
  { id: '19723756', name: '飙升榜' },
  { id: '3779629', name: '新歌榜' },
  { id: '2884035', name: '原创榜' },
  { id: '71385702', name: 'ACG 榜' },
  { id: '745956260', name: '韩语榜' },
  { id: '10520166', name: '国电榜' },
]

/* ============ RSS 热门推荐（实测可达的公开源，用户可选添加） ============ */
// 热门推荐（参考 Folo 发现页头部源 + 社区经典清单；全部经本机实测可用后上架）
const RSS_RECOMMENDATIONS = [
  /* AI */
  { category: 'AI', title: '量子位', url: 'https://www.qbitai.com/feed', desc: '中文 AI 资讯，前沿动态与产业跟踪' },
  { category: 'AI', title: 'Hacker News · AI', url: 'https://hnrss.org/newest?q=AI', desc: 'HN 社区 AI 主题聚合（英文）' },
  { category: 'AI', title: 'The Decoder', url: 'https://www.the-decoder.com/feed/', desc: '专注 AI 新闻报道（英文）' },
  { category: 'AI', title: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/', desc: 'LLM 实战派一手博客（英文）' },
  { category: 'AI', title: 'Andrej Karpathy', url: 'https://karpathy.bearblog.dev/feed/', desc: '大牛视角看 AI 与模型（英文）' },
  /* 科技资讯 */
  { category: '科技资讯', title: 'IT之家', url: 'https://www.ithome.com/rss/', desc: '快节奏科技新闻，更新量大' },
  { category: '科技资讯', title: '爱范儿', url: 'https://www.ifanr.com/feed', desc: '消费科技与产品设计' },
  { category: '科技资讯', title: '极客公园', url: 'https://www.geekpark.net/rss', desc: '前沿科技与商业观察' },
  { category: '科技资讯', title: '月光博客', url: 'https://www.williamlong.info/rss.xml', desc: '老牌科技博客，互联网观察' },
  { category: '科技资讯', title: 'TechCrunch', url: 'https://techcrunch.com/feed/', desc: '硅谷科技与创投（英文）' },
  { category: '科技资讯', title: 'Ars Technica', url: 'https://arstechnica.com/feed/', desc: '深度科技报道（英文）' },
  { category: '科技资讯', title: 'The Verge', url: 'https://theverge.com/rss/index.xml', desc: '科技文化消费电子（英文）' },
  /* 娱乐 */
  { category: '娱乐', title: 'Solidot', url: 'https://www.solidot.org/index.rss', desc: '奇客趣闻，科技圈乐子' },
  { category: '娱乐', title: 'xkcd', url: 'https://xkcd.com/rss.xml', desc: '经典极客英文漫画' },
  { category: '娱乐', title: 'V2EX · 每日精选', url: 'https://www.v2ex.com/index.xml', desc: '创意工作者社区热帖' },
  { category: '娱乐', title: 'Hacker News · 首页', url: 'https://hnrss.org/frontpage', desc: '全球开发者社区头条（英文）' },
  /* 摄影美图 */
  { category: '摄影美图', title: 'PetaPixel', url: 'https://petapixel.com/feed/', desc: '摄影社区，人像与器材大片' },
  { category: '摄影美图', title: 'Fubiz', url: 'https://fubiz.net/feed/', desc: '法系美学，时尚人像与视觉设计' },
  { category: '摄影美图', title: 'Colossal', url: 'https://www.thisiscolossal.com/feed/', desc: '当代艺术与视觉文化' },
  { category: '摄影美图', title: 'Bored Panda', url: 'https://www.boredpanda.com/feed/', desc: '创意设计与趣味图集' },
  { category: '摄影美图', title: 'Designboom', url: 'https://www.designboom.com/feed/', desc: '建筑与产品设计前沿' },
  { category: '摄影美图', title: 'My Modern Met', url: 'https://mymodernmet.com/feed/', desc: '艺术创作与创意灵感' },
  /* 开发者 */
  /* 开发者 */
  { category: '开发者', title: '阮一峰的网络日志', url: 'http://www.ruanyifeng.com/blog/atom.xml', desc: '每周科技爱好者周刊' },
  { category: '开发者', title: '美团技术团队', url: 'https://tech.meituan.com/feed/', desc: '工程实践博客' },
  { category: '开发者', title: '云风的 BLOG', url: 'https://blog.codingnow.com/atom.xml', desc: '游戏与编程随笔' },
  /* 数字生活 */
  { category: '数字生活', title: '少数派', url: 'https://sspai.com/feed', desc: '效率工具与数字生活' },
  { category: '数字生活', title: '小众软件', url: 'https://www.appinn.com/feed/', desc: '发现好用的小工具' },
  /* 长文阅读 */
  { category: '长文阅读', title: 'Aeon', url: 'https://aeon.co/feed.rss', desc: '哲学·科学·文化长文（英文）' },
  { category: '长文阅读', title: 'Longreads', url: 'https://longreads.com/feed/', desc: '深度长篇报道精选（英文）' },
]

/* ============ 漫画封面代理（走 onImageLoad 的 Referer 等头，规避防盗链） ============ */
async function withProxiedCovers(runtime, comics) {
  if (!Array.isArray(comics) || !comics.length) return comics
  const urls = [...new Set(comics.map((c) => c?.cover).filter((u) => typeof u === 'string' && /^https?:/i.test(u)))]
  if (!urls.length) return comics
  const configs = await runtime.call('imageConfigs', [urls]).catch(() => [])
  const map = new Map()
  urls.forEach((u, i) => map.set(u, configs?.[i] || { url: u, headers: {} }))
  return comics.map((c) => {
    if (!c?.cover || !map.has(c.cover)) return c
    const conf = map.get(c.cover)
    const h = Object.keys(conf.headers || {}).length ? `&h=${encodeURIComponent(Buffer.from(JSON.stringify(conf.headers)).toString('base64'))}` : ''
    return { ...c, cover: `/funhub/img?u=${encodeURIComponent(conf.url)}${h}` }
  })
}

/* ============ 音质回退 ============ */
function pickQuality(qualitys, wanted) {
  if (!Array.isArray(qualitys) || !qualitys.length) return wanted
  if (qualitys.includes(wanted)) return wanted
  const priority = [wanted, '320k', '192k', '128k', 'flac', 'hires', 'master']
  for (const q of priority) if (qualitys.includes(q)) return q
  return qualitys[0]
}

export async function route(ctx, store, req, res) {
  runtimeLogger = ctx.logger || runtimeLogger
  const url = new URL(req.url, 'http://localhost')
  const path = url.pathname.replace(/^\/funhub\/?/, '').replace(/^api\/?/, '')
  const method = req.method

  // 每请求同步出站代理（store.read 带 mtime 缓存，开销一次 stat）
  try {
    const st = await store.read()
    const cfg = st?.settings?.proxy
    const key = cfg?.enabled && cfg?.port ? `http://${cfg.host || '127.0.0.1'}:${cfg.port}` : ''
    if (key !== currentProxyUrl) {
      currentProxyUrl = key
      disposeRuntimes() // 脚本沙箱在旧代理里启动的，按新代理重启
    }
    setOutboundProxy(cfg)
  } catch { /* state 读取失败按直连 */ }

  try {
    /* ---------- 网络连通性测试（设置 → 网络） ---------- */
    if (path === 'network/check' && method === 'POST') {
      const st = await store.read()
      const cfg = st?.settings?.proxy
      const dispatcher = makeProxyDispatcher(cfg)
      const via = dispatcher ? `代理 http://${cfg.host || '127.0.0.1'}:${cfg.port}` : '直连'
      const started = Date.now()
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 8000)
        const r = await fetch('https://cp.cloudflare.com/generate_204', {
          signal: controller.signal,
          ...(dispatcher ? { dispatcher } : {}),
          headers: { 'user-agent': 'Mozilla/5.0 FunHub/0.1' },
        })
        clearTimeout(timer)
        return json(res, 200, { ok: r.status === 204, status: r.status, ms: Date.now() - started, via })
      } catch (err) {
        return json(res, 200, { ok: false, error: err?.name === 'AbortError' ? '超时（8s）' : (err?.message || '连接失败'), ms: Date.now() - started, via })
      }
    }

    /* ---------- 引导数据 ---------- */
    if (path === 'state' && method === 'GET') {
      return json(res, 200, { ok: true, state: publicState(await store.read()) })
    }

    /* ---------- 写操作单入口 ---------- */
    if (path === 'op' && method === 'POST') {
      const body = await readJson(req)
      const handler = OPS[body.op]
      if (!handler) return json(res, 400, { error: `未知操作：${body.op}` })
      const result = await store.write((state) => handler(state, body, ctx))
      return json(res, 200, { ok: true, result })
    }

    /* ================= 小说：Gutenberg 公版书 ================= */
    if (path === 'novel/search' && method === 'GET') {
      const q = (url.searchParams.get('q') || '').trim()
      const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
      if (!q) return json(res, 400, { error: '缺少搜索词' })
      return json(res, 200, { ok: true, ...(await novelSearch(q, page)) })
    }
    let m
    if ((m = /^novel\/book\/(\d+)$/.exec(path)) && method === 'GET') {
      return json(res, 200, { ok: true, book: await novelDetail(m[1]) })
    }
    if (path === 'novel/popular' && method === 'GET') {
      const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
      return json(res, 200, { ok: true, ...(await novelPopular(page)) })
    }
    if ((m = /^novel\/book\/(\d+)\/content$/.exec(path)) && method === 'GET') {
      const text = await novelContent(store.cacheDir, m[1])
      return json(res, 200, { ok: true, bookId: m[1], text, length: text.length })
    }

    /* ================= 小说：阅读3.0 书源 ================= */
    if (path === 'booksource/import' && method === 'POST') {
      const body = await readJson(req, MAX_IMPORT_JSON)
      let text = (body.text || '').trim()
      if (body.url) {
        assertSafeUrl(body.url)
        text = await safeFetchText(body.url, { timeout: 60_000, maxSize: MAX_IMPORT_JSON })
      }
      if (!text) return json(res, 400, { error: '缺少书源内容' })
      let arr
      try {
        arr = JSON.parse(text)
      } catch {
        return json(res, 400, { error: '书源内容不是有效 JSON（阅读3.0 书源为 JSON 数组）' })
      }
      if (!Array.isArray(arr)) arr = [arr]
      const compat = []
      const valid = []
      for (const source of arr) {
        if (!source || typeof source !== 'object' || !source.bookSourceUrl) continue
        const check = sourceCompatibility(source)
        compat.push({ name: source.bookSourceName || source.bookSourceUrl, ...check })
        valid.push(source)
      }
      // 批量单次落盘：大包几千个源时避免逐个全量写盘
      const result = await store.write((state) => OPS.booksource_add_many(state, { sources: valid }))
      return json(res, 200, { ok: true, added: result.added, skipped: result.skipped, compat: compat.slice(0, 40) })
    }
    if (path === 'booksource/explore-categories' && method === 'GET') {
      const sourceId = url.searchParams.get('sourceId') || ''
      const state = await store.read()
      const source = state.bookSources.find((s) => s.url === sourceId && s.enabled)
      if (!source) return json(res, 400, { error: '书源不存在或未启用' })
      return json(res, 200, { ok: true, sourceId, categories: exploreCategories(source.raw) })
    }
    if (path === 'booksource/explore' && method === 'GET') {
      const sourceId = url.searchParams.get('sourceId') || ''
      const catUrl = url.searchParams.get('url') || ''
      const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
      const state = await store.read()
      const source = state.bookSources.find((s) => s.url === sourceId && s.enabled)
      if (!source) return json(res, 400, { error: '书源不存在或未启用' })
      return json(res, 200, { ok: true, books: await legadoExplore(source.raw, catUrl, page) })
    }
    if (path === 'booksource/search' && method === 'GET') {
      const sourceId = url.searchParams.get('sourceId') || ''
      const q = (url.searchParams.get('q') || '').trim()
      const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
      if (!q) return json(res, 400, { error: '缺少搜索词' })
      const state = await store.read()
      const source = state.bookSources.find((s) => s.url === sourceId && s.enabled)
      if (!source) return json(res, 400, { error: '书源不存在或未启用' })
      const compat = sourceCompatibility(source.raw)
      if (!compat.compatible) return json(res, 400, { error: `书源不兼容：${compat.issues.join('；')}` })
      return json(res, 200, { ok: true, books: await legadoSearch(source.raw, q, page) })
    }
    if (path === 'booksource/detail' && method === 'GET') {
      const sourceId = url.searchParams.get('sourceId') || ''
      const bookUrl = url.searchParams.get('bookUrl') || ''
      const state = await store.read()
      const source = state.bookSources.find((s) => s.url === sourceId && s.enabled)
      if (!source) return json(res, 400, { error: '书源不存在' })
      return json(res, 200, { ok: true, book: await legadoDetail(source.raw, bookUrl) })
    }
    if (path === 'booksource/toc' && method === 'GET') {
      const sourceId = url.searchParams.get('sourceId') || ''
      const tocUrl = url.searchParams.get('tocUrl') || ''
      const state = await store.read()
      const source = state.bookSources.find((s) => s.url === sourceId && s.enabled)
      if (!source) return json(res, 400, { error: '书源不存在' })
      return json(res, 200, { ok: true, chapters: await legadoToc(source.raw, tocUrl) })
    }
    if (path === 'booksource/content' && method === 'GET') {
      const sourceId = url.searchParams.get('sourceId') || ''
      const chapterUrl = url.searchParams.get('chapterUrl') || ''
      const state = await store.read()
      const source = state.bookSources.find((s) => s.url === sourceId && s.enabled)
      if (!source) return json(res, 400, { error: '书源不存在' })
      const result = await legadoContent(source.raw, chapterUrl)
      return json(res, 200, { ok: true, ...result })
    }

    /* ================= 漫画：venera 源 ================= */
    /* ---------- 书源：在线探测并清理失效源（后台任务） ---------- */
    if (path === 'booksource/clean-progress' && method === 'GET') {
      return json(res, 200, { ok: true, progress: bookClean })
    }
    if (path === 'booksource/clean-stop' && method === 'POST') {
      if (bookClean.running) bookClean.stop = true
      return json(res, 200, { ok: true, stopping: bookClean.running })
    }
    if (path === 'booksource/clean-dead' && method === 'POST') {
      // 已有任务且仍在推进（90s 内有心跳）→ 409 带进度；疑似僵死（长时间无心跳）→ 允许接管重启
      if (bookClean.running && Date.now() - bookClean.updatedAt < 90_000) {
        return json(res, 409, { error: '已有检测任务进行中', progress: { ...bookClean, removedNames: bookClean.removedNames.slice(0, 12) } })
      }
      const st = await store.read()
      const now = Date.now()
      const PROBE_TTL = 12 * 3600_000 // 12h 内验证过存活的源视为已检测（中断续跑不再重测）
      const rows = st.bookSources.map((r) => ({ id: r.id, name: r.name, url: r.url, compatible: r.compatible, probedAt: r.probedAt || 0 }))
      Object.assign(bookClean, { running: true, stop: false, total: rows.length, done: 0, removed: 0, kept: 0, skipped: 0, current: '', removedNames: [], startedAt: now, updatedAt: now, finishedAt: 0 })
      const rawById = new Map(st.bookSources.map((r) => [r.id, r]))
      void (async () => {
        const CONCURRENCY = 6
        const BATCH = 20 // 删除/打标批量落盘：避免上千次全量写盘
        let pendingDead = []
        let pendingProbed = []
        let idx = 0
        const flush = async () => {
          const dead = pendingDead; pendingDead = []
          const probed = pendingProbed; pendingProbed = []
          if (!dead.length && !probed.length) return
          await store.write((state) => {
            for (const id of dead) OPS.booksource_remove(state, { id })
            for (const id of probed) { const r = state.bookSources.find((x) => x.id === id); if (r) r.probedAt = now }
          }).catch(() => {})
        }
        async function probeOne(row) {
          // 中断续跑：近期已验证存活的直接跳过
          if (now - row.probedAt < PROBE_TTL) { bookClean.skipped += 1; bookClean.done += 1; return }
          bookClean.current = row.name
          // 引擎不兼容的书源无法探测（脚本规则），交给「清理不兼容」按钮
          if (row.compatible === false) { bookClean.kept += 1; bookClean.done += 1; return }
          try {
            const src = rawById.get(row.id)
            const r = await legadoSearch(src?.raw, '我的', 1)
            // legadoSearch 成功时直接返回书目数组（不是 {books} 包装）；
            // 只要接口有响应即视为存活（0 结果也可能是关键词冷门，不判死）
            if (Array.isArray(r) || Array.isArray(r?.books)) { bookClean.kept += 1; pendingProbed.push(row.id) }
            else { bookClean.removed += 1; pendingDead.push(row.id); bookClean.removedNames.push(row.name) }
          } catch (err) {
            // 只把「网络级/HTTP 级失败」判失效（403/429/5xx/超时/解析失败）；
            // 400（缺 searchUrl/列表规则/JS 规则）是引擎能力限制，不是源死了 → 保留
            const status = err?.status || 0
            const msg = String(err?.message || '')
            const dead4sure = status >= 401 || status === 502 || status === 503 || status === 504
              || /网络请求失败|请求超时|域名解析失败|fetch failed|ENOTFOUND|ECONNREFUSED/.test(msg)
            if (dead4sure) {
              bookClean.removed += 1
              pendingDead.push(row.id)
              bookClean.removedNames.push(`${row.name}（${msg.slice(0, 30)}）`)
            } else {
              // 引擎限制（缺 searchUrl / 缺规则）不算死；但若连发现能力也没有，
              // 此源在 FunHub 永远无法使用（搜索、发现两路皆空）→ 一并清理
              const full = rawById.get(row.id)
              if (!full || exploreCategories(full.raw || {}).length === 0) {
                bookClean.removed += 1
                pendingDead.push(row.id)
                bookClean.removedNames.push(`${row.name}（无搜索/发现规则）`)
              } else {
                // 发现可用而搜索不可用：引擎能力是静态的，重测结果不会变 → 同样标记已验证
                bookClean.kept += 1
                pendingProbed.push(row.id)
              }
            }
          }
          bookClean.done += 1
        }
        const workers = Array.from({ length: Math.min(CONCURRENCY, Math.max(rows.length, 1)) }, async () => {
          while (!bookClean.stop) {
            const i = idx++
            if (i >= rows.length) break
            await probeOne(rows[i])
            if (pendingDead.length + pendingProbed.length >= BATCH) await flush()
            bookClean.updatedAt = Date.now()
            if (bookClean.removedNames.length > 100) bookClean.removedNames.length = 100
          }
        })
        await Promise.all(workers)
        await flush() // 收尾/停止时把最后一批落盘
        bookClean.running = false
        bookClean.current = ''
        bookClean.finishedAt = Date.now()
      })()
      return json(res, 200, { ok: true, started: true, total: rows.length })
    }

    if (path === 'comicsource/clean-progress' && method === 'GET') {
      return json(res, 200, { ok: true, progress: { ...comicClean, removedNames: comicClean.removedNames.slice(-12) } })
    }
    if (path === 'comicsource/clean-test' && method === 'POST') {
      if (comicClean.running) return json(res, 409, { error: '已有清理任务进行中' })
      const state = await store.read()
      const rows = state.comicSources.map((r) => ({ id: r.id, name: r.name, key: r.key || r.name, error: r.error }))
      Object.assign(comicClean, { running: true, total: rows.length, done: 0, removed: 0, kept: 0, current: '', removedNames: [], startedAt: Date.now(), finishedAt: 0 })
      /* 后台逐源探测：重复 / 脚本坏 / 网络不可达 / 接口全挂 → 删除；正常 → 保留 */
      const seenKeys = new Set()
      void (async () => {
        for (const row of rows) {
          comicClean.current = row.name
          // 0) 重复导入的副本（同 key/name，保留首个）直接删
          if (seenKeys.has(row.key)) {
            await store.write((st) => OPS.comicsource_remove(st, { id: row.id })).catch(() => {})
            comicClean.removed += 1
            comicClean.removedNames.push(`${row.name}（重复导入）`)
            comicClean.done += 1
            continue
          }
          seenKeys.add(row.key)
          // 1) 导入时就报错的直接删（不浪费探测时间）
          if (row.error) {
            await store.write((st) => OPS.comicsource_remove(st, { id: row.id })).catch(() => {})
            comicClean.removed += 1
            comicClean.removedNames.push(`${row.name}（${String(row.error).slice(0, 24)}）`)
          } else {
            let ok = false
            let reason = ''
            try {
              const full = (await store.read()).comicSources.find((r) => r.id === row.id)
              if (!full) { ok = true } // 已被手动删除，跳过
              else {
                const runtime = getVeneraRuntime(store, full)
                const info = await runtime.ensureReady()
                if (info?.loadError) throw new Error(info.loadError)
                // 探测：优先 search，失败再试 explore（部分源只提供发现页）
                try {
                  await runtime.call('search', ['test', 1], { timeoutMs: 20_000 })
                  ok = true
                } catch (err) {
                  reason = err.message
                  if (runtime.exploreList().length) {
                    try {
                      await runtime.loadExplore(0, 1)
                      ok = true
                    } catch (err2) {
                      reason = err2.message
                    }
                  }
                }
                runtime.dispose?.()
                // 探测后从缓存移除，避免长驻子进程堆积
                veneraRuntimes.delete(row.id)
              }
            } catch (err) {
              reason = err.message
            }
            if (ok) comicClean.kept += 1
            else {
              await store.write((st) => OPS.comicsource_remove(st, { id: row.id })).catch(() => {})
              comicClean.removed += 1
              comicClean.removedNames.push(`${row.name}（${String(reason).slice(0, 24)}）`)
            }
          }
          comicClean.done += 1
        }
      })().catch(() => {}).finally(() => {
        comicClean.running = false
        comicClean.current = ''
        comicClean.finishedAt = Date.now()
      })
      return json(res, 200, { ok: true, started: true, total: rows.length })
    }
    if (path === 'comicsource/progress' && method === 'GET') {
      return json(res, 200, { ok: true, progress: { ...manifestImport, failed: manifestImport.failed.slice(-8) } })
    }
    if (path === 'comicsource/import' && method === 'POST') {
      const body = await readJson(req)
      let script = (body.script || '').trim()
      if (body.url) {
        assertSafeUrl(body.url)
        script = (await safeFetchText(body.url, { timeout: 30_000, maxSize: MAX_SCRIPT })).trim()
      }
      if (!script) return json(res, 400, { error: '缺少漫画源脚本' })

      /* 单脚本导入 */
      const importOne = async (text, label = '') => {
        if (!/class\s+\w+\s+extends\s+ComicSource/.test(text)) {
          return { ok: false, name: label, error: '不是有效的 venera 漫画源（未找到 ComicSource 子类）' }
        }
        const probe = new VeneraRuntime(text, {})
        const info = await probe.ensureReady().catch(() => ({}))
        const error = info.loadError || (info.hasSearch ? null : '脚本未提供 search.load 接口')
        probe.dispose()
        const result = await store.write((state) => OPS.comicsource_add(state, { script: text, info, error }))
        if (result.added === false) return { ok: true, skipped: true, updated: true, name: label || result.comicSource.name }
        return { ok: true, id: result.comicSource.id, name: result.comicSource.name, error }
      }

      /* 清单批量导入：URL 指向 index.json 形态的数组（每项含 fileName）时，
         以清单 URL 为基准目录逐个抓取脚本导入。清单 URL 由用户自行提供，不做内置。 */
      let manifest = null
      try {
        const parsed = JSON.parse(script)
        if (Array.isArray(parsed) && parsed.length && parsed.every((e) => e && typeof e === 'object' && typeof e.fileName === 'string')) {
          manifest = parsed
        }
      } catch { /* 非清单，按单脚本处理 */ }

      if (manifest) {
        const baseDir = body.url ? body.url.replace(/[^/]*$/, '') : ''
        if (!baseDir) return json(res, 400, { error: '清单导入需要提供清单 URL（脚本地址按清单 URL 所在目录解析）' })
        if (manifestImport.running) return json(res, 409, { error: '已有清单导入任务进行中，请等待完成' })
        const items = manifest.slice(0, 40)
        Object.assign(manifestImport, { running: true, total: items.length, done: 0, added: 0, skipped: 0, failed: [], startedAt: Date.now(), finishedAt: 0 })
        /* 后台串行导入：立即响应，客户端轮询 /comicsource/progress 拿进度。
           串行避免几十个脚本同时探测的 CPU 峰值与写盘竞争。 */
        void (async () => {
          for (const entry of items) {
            try {
              const text = (await safeFetchText(baseDir + entry.fileName, { timeout: 30_000, maxSize: MAX_SCRIPT })).trim()
              const r = await importOne(text, entry.name || entry.fileName)
              if (r.ok && r.skipped) manifestImport.skipped += 1
              else if (r.ok) manifestImport.added += 1
              else manifestImport.failed.push({ name: r.name || entry.fileName, error: r.error })
            } catch (err) {
              manifestImport.failed.push({ name: entry.name || entry.fileName, error: err.message })
            }
            manifestImport.done += 1
          }
        })().catch(() => {}).finally(() => {
          manifestImport.running = false
          manifestImport.finishedAt = Date.now()
        })
        return json(res, 200, { ok: true, manifest: true, started: true, total: items.length })
      }

      const result = await importOne(script)
      if (!result.ok) return json(res, 400, { error: result.error })
      return json(res, 200, { ok: true, comicSource: { id: result.id, name: result.name }, error: result.error || null })
    }
    if (path === 'comic/search' && method === 'GET') {
      const sourceId = url.searchParams.get('sourceId') || ''
      const q = (url.searchParams.get('q') || '').trim()
      const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
      const state = await store.read()
      const row = state.comicSources.find((s) => s.id === sourceId && s.enabled)
      if (!row) return json(res, 400, { error: '漫画源不存在或未启用' })
      const runtime = getVeneraRuntime(store, row)
      const raw = await runtime.search(q, page)
      return json(res, 200, { ok: true, comics: await withProxiedCovers(runtime, raw?.comics || []), maxPage: raw?.maxPage || 1 })
    }
    if (path === 'comic/detail' && method === 'GET') {
      const sourceId = url.searchParams.get('sourceId') || ''
      const comicId = url.searchParams.get('comicId') || ''
      const state = await store.read()
      const row = state.comicSources.find((s) => s.id === sourceId && s.enabled)
      if (!row) return json(res, 400, { error: '漫画源不存在' })
      const runtime = getVeneraRuntime(store, row)
      const comic = await runtime.getComic(comicId)
      return json(res, 200, { ok: true, comic: (await withProxiedCovers(runtime, [comic]))[0] || comic })
    }
    if (path === 'comic/chapters' && method === 'GET') {
      const sourceId = url.searchParams.get('sourceId') || ''
      const comicId = url.searchParams.get('comicId') || ''
      const state = await store.read()
      const row = state.comicSources.find((s) => s.id === sourceId && s.enabled)
      if (!row) return json(res, 400, { error: '漫画源不存在' })
      const runtime = getVeneraRuntime(store, row)
      return json(res, 200, { ok: true, chapters: await runtime.getChapters(comicId) })
    }
    if (path === 'comic/explore-list' && method === 'GET') {
      const sourceId = url.searchParams.get('sourceId') || ''
      const state = await store.read()
      const row = state.comicSources.find((s) => s.id === sourceId && s.enabled)
      if (!row) return json(res, 400, { error: '漫画源不存在或未启用' })
      const runtime = getVeneraRuntime(store, row)
      await runtime.ensureReady().catch(() => {})
      return json(res, 200, { ok: true, pages: runtime.exploreList() })
    }
    if (path === 'comic/explore' && method === 'GET') {
      const sourceId = url.searchParams.get('sourceId') || ''
      const index = Math.max(0, Number(url.searchParams.get('index')) || 0)
      const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
      const state = await store.read()
      const row = state.comicSources.find((s) => s.id === sourceId && s.enabled)
      if (!row) return json(res, 400, { error: '漫画源不存在或未启用' })
      const runtime = getVeneraRuntime(store, row)
      const { sections } = await runtime.loadExplore(index, page)
      const proxied = await Promise.all((sections || []).map(async (sec) => ({ ...sec, comics: await withProxiedCovers(runtime, sec.comics) })))
      return json(res, 200, { ok: true, sections: proxied })
    }
    if (path === 'comic/ep' && method === 'GET') {
      const sourceId = url.searchParams.get('sourceId') || ''
      const comicId = url.searchParams.get('comicId') || ''
      const epId = url.searchParams.get('epId') || ''
      const state = await store.read()
      const row = state.comicSources.find((s) => s.id === sourceId && s.enabled)
      if (!row) return json(res, 400, { error: '漫画源不存在' })
      const runtime = getVeneraRuntime(store, row)
      const raw = await runtime.loadEp(comicId, epId)
      const rawImages = (raw?.images || []).filter((u) => typeof u === 'string' && u)
      const images = await Promise.all(rawImages.map(async (u) => {
        const conf = await runtime.imageConfig(u)
        return {
          url: `/funhub/img?u=${encodeURIComponent(conf.url)}${Object.keys(conf.headers).length ? `&h=${encodeURIComponent(Buffer.from(JSON.stringify(conf.headers)).toString('base64'))}` : ''}`,
        }
      }))
      return json(res, 200, { ok: true, images })
    }

    /* ---------- 音频流代理：同源转发远程音频（带 Range，支持进度拖动） ----------
       自定义协议页面直接加载 https 外链媒体可能被拦；统一走同源代理最稳，
       也为将来需要 Referer 等头的音源预留通道。 */
    if (path === 'stream' && method === 'GET') {
      const u = url.searchParams.get('u') || ''
      assertSafeUrl(u)
      await assertPublicHost(new URL(u).hostname) // SSRF 防护
      const controller = new AbortController()
      const upstream = await fetch(u, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { range: req.headers.range || 'bytes=0-' },
      })
      const contentType = upstream.headers.get('content-type') || 'audio/mpeg'
      if (!/^audio\//i.test(contentType) && !/^application\/(octet-stream|ogg)/i.test(contentType)) {
        controller.abort()
        return json(res, 502, { error: `上游不是音频流（${contentType.split(';')[0]}）` })
      }
      res.statusCode = upstream.status
      res.setHeader('content-type', contentType)
      for (const key of ['content-range', 'content-length', 'accept-ranges']) {
        const value = upstream.headers.get(key)
        if (value) res.setHeader(key, value)
      }
      res.setHeader('cache-control', 'no-store')
      req.on('close', () => controller.abort())
      const reader = upstream.body.getReader()
      // 直写 Node 响应流
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read()
          if (done || res.writableEnded || res.destroyed) break
          if (!res.write(Buffer.from(value))) {
            await new Promise((resolve) => res.once('drain', resolve))
          }
        }
        res.end()
      }
      void pump().catch(() => { if (!res.writableEnded) res.end() })
      return
    }

    /* ---------- 图片代理（漫画页 + RSS 正文图，可带源要求的请求头） ---------- */
    /* ================= 影视：Emby（服务器由用户添加） ================= */
    /* ---------- Emby 连通性检测（后台任务）：只提示不删除（自建服务器可能临时休眠） ---------- */
    if (path === 'video/clean-progress' && method === 'GET') {
      return json(res, 200, { ok: true, progress: { ...videoClean, failedNames: videoClean.failedNames.slice(-12) } })
    }
    if (path === 'video/clean-stop' && method === 'POST') {
      if (videoClean.running) videoClean.stop = true
      return json(res, 200, { ok: true, stopping: videoClean.running })
    }
    if (path === 'video/clean-dead' && method === 'POST') {
      if (videoClean.running && Date.now() - videoClean.updatedAt < 90_000) {
        return json(res, 409, { error: '已有检测任务进行中', progress: { ...videoClean } })
      }
      const st = await store.read()
      const emby = st.settings.video?.emby || []
      const rows = emby.map((s) => ({ id: s.id, name: s.name }))
      const now = Date.now()
      Object.assign(videoClean, { running: true, stop: false, total: rows.length, done: 0, ok: 0, failed: 0, failedNames: [], current: '', startedAt: now, updatedAt: now, finishedAt: 0 })
      const rawById = new Map(emby.map((s) => [s.id, s]))
      void (async () => {
        const CONCURRENCY = 6
        let idx = 0
        async function probeOne(row) {
          videoClean.current = row.name
          const server = rawById.get(row.id)
          try {
            await embyViews(server)
            videoClean.ok += 1
          } catch {
            videoClean.failed += 1
            videoClean.failedNames.push(row.name)
            if (videoClean.failedNames.length > 50) videoClean.failedNames.length = 50
          }
          videoClean.done += 1
        }
        const workers = Array.from({ length: Math.min(CONCURRENCY, Math.max(rows.length, 1)) }, async () => {
          while (!videoClean.stop) {
            const i = idx++
            if (i >= rows.length) break
            await probeOne(rows[i])
            videoClean.updatedAt = Date.now()
          }
        })
        await Promise.all(workers)
        videoClean.running = false
        videoClean.current = ''
        videoClean.finishedAt = Date.now()
      })()
      return json(res, 200, { ok: true, started: true, total: rows.length })
    }
    if (path === 'video/stream' && method === 'GET') {
      // 通用流代理：Range 直通（视频拖动进度条必需），Emby 的 api_key 只在宿主侧出现
      const u = url.searchParams.get('u') || ''
      try {
        assertSafeUrl(u)
        await assertPublicHost(new URL(u).hostname)
        const range = req.headers?.range
        const upstream = await fetchViaProxy(u, { headers: range ? { range } : {}, redirect: 'follow' })
        if (!upstream.ok && upstream.status !== 206) throw new FetchError(`上游响应 ${upstream.status}`, 502)
        res.statusCode = upstream.status
        for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
          const v = upstream.headers.get(key)
          if (v) res.setHeader(key, v)
        }
        if (upstream.body) {
          for await (const chunk of upstream.body) res.write(chunk)
        }
        return res.end()
      } catch (err) {
        return json(res, err?.status || 502, { error: `视频流代理失败：${err.message}` })
      }
    }
    const embyServer = async (id) => {
      const state = await store.read()
      const server = state.settings.video.emby.find((s) => s.id === id)
      if (!server) throw new FetchError('Emby 服务器不存在', 400)
      return server
    }
    if (path === 'video/emby/auth' && method === 'POST') {
      // 用户名密码登录换 token（也可以在设置里直接填 API Key）
      const body = await readJson(req)
      const urlRaw = String(body.url || '').trim()
      if (!urlRaw) return json(res, 400, { error: '缺少 Emby 服务器地址' })
      assertSafeUrl(urlRaw.replace(/\/$/, '') + '/emby/System/Info')
      const creds = await embyAuthByName(urlRaw, String(body.username || ''), String(body.password || ''))
      const info = await embyValidate(urlRaw, creds.apiKey)
      return json(res, 200, { ok: true, server: { ...creds, url: urlRaw.replace(/\/$/, ''), name: info.serverName } })
    }
    if (path === 'video/emby/views' && method === 'GET') {
      const server = await embyServer(url.searchParams.get('server') || '')
      return json(res, 200, { ok: true, views: await embyViews(server) })
    }
    if (path === 'video/emby/episodes' && method === 'GET') {
      const server = await embyServer(url.searchParams.get('server') || '')
      const series = url.searchParams.get('series') || ''
      if (!series) return json(res, 400, { error: '缺少剧集 id' })
      const start = Math.max(0, Number(url.searchParams.get('start')) || 0)
      const r = await embyEpisodes(server, series, start)
      r.items = r.items.map((it) => ({ ...it, poster: `/funhub/img?u=${encodeURIComponent(embyPosterUrl(server, it.id))}` }))
      return json(res, 200, { ok: true, ...r })
    }
    if (path === 'video/emby/items' && method === 'GET') {
      const server = await embyServer(url.searchParams.get('server') || '')
      const parent = url.searchParams.get('parent') || ''
      const start = Math.max(0, Number(url.searchParams.get('start')) || 0)
      const res2 = await embyItems(server, parent, start)
      // 海报含 api_key → 经图片代理加载，key 不落到浏览器
      res2.items = res2.items.map((it) => ({ ...it, poster: `/funhub/img?u=${encodeURIComponent(embyPosterUrl(server, it.id))}` }))
      return json(res, 200, { ok: true, ...res2 })
    }
    if (path === 'video/emby/detail' && method === 'GET') {
      const server = await embyServer(url.searchParams.get('server') || '')
      const id = url.searchParams.get('id') || ''
      if (!id) return json(res, 400, { error: '缺少条目 id' })
      const detail = await embyDetail(server, id)
      detail.poster = `/funhub/img?u=${encodeURIComponent(embyPosterUrl(server, id))}`
      // 每个版本给两条播放地址：Static 直连（浏览器能播时）与 HLS 转码（mkv/hevc 等兜底）；api_key 都只在宿主侧
      detail.sources = detail.sources.map((ms) => ({
        ...ms,
        url: `/funhub/api/video/stream?u=${encodeURIComponent(embyStreamUrl(server, id, ms.id))}`,
        hlsUrl: `/funhub/api/video/m3u8?u=${encodeURIComponent(embyHlsUrl(server, id, ms.id))}`,
      }))
      return json(res, 200, { ok: true, detail })
    }
    if (path === 'video/m3u8' && method === 'GET') {
      // Emby HLS 转码代理：master/子播放列表重写（分片与密钥走 stream 代理），api_key 不出宿主
      const u = url.searchParams.get('u') || ''
      assertSafeUrl(u)
      const text = await safeFetchText(u, { timeout: 20_000, maxSize: 2_000_000, headers: { accept: '*/*' } })
      res.statusCode = 200
      res.setHeader('content-type', 'application/vnd.apple.mpegurl')
      res.setHeader('cache-control', 'no-store')
      return res.end(rewriteM3u8(text, u))
    }

    if (path === 'img' && method === 'GET') {
      const u = url.searchParams.get('u') || ''
      const h = url.searchParams.get('h') || ''
      assertSafeUrl(u)
      let headers = {}
      if (h) {
        try {
          const parsed = JSON.parse(Buffer.from(h, 'base64').toString('utf-8'))
          if (parsed && typeof parsed === 'object') {
            for (const [key, value] of Object.entries(parsed)) {
              if (typeof value === 'string' && value.length < 500 && !/cookie/i.test(key)) headers[key] = value
            }
          }
        } catch { /* 忽略非法头 */ }
      }
      const { buffer, contentType } = await safeFetchBuffer(u, { timeout: 20_000, headers })
      res.statusCode = 200
      res.setHeader('content-type', contentType)
      res.setHeader('cache-control', 'private, max-age=86400')
      res.setHeader('x-content-type-options', 'nosniff')
      res.setHeader('content-length', buffer.length)
      return res.end(buffer)
    }

    /* ================= 图片广场 ================= */
    if (path === 'image/feed' && method === 'GET') {
      const state = await store.read()
      const source = url.searchParams.get('source') || 'picsum'
      const cfg = state.settings.imageSources[source] || {}
      const feed = await imageFeed({
        source,
        query: url.searchParams.get('q') || '',
        page: Math.max(1, Number(url.searchParams.get('page')) || 1),
        apiKey: cfg.apiKey || '',
      })
      return json(res, 200, { ok: true, images: feed })
    }

    /* ================= 音乐：内置搜索通道 ================= */
    if (path === 'music2/search' && method === 'GET') {
      const channel = url.searchParams.get('channel') || 'wy'
      const q = (url.searchParams.get('q') || '').trim()
      const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
      if (!q) return json(res, 400, { error: '缺少搜索词' })
      const adapter = SEARCH_CHANNELS[channel]
      if (!adapter) return json(res, 400, { error: `未知搜索通道：${channel}` })
      return json(res, 200, { ok: true, items: await adapter.search(q, page) })
    }

    /* ---------- 音乐：榜单矩阵与歌单导入（网易云公开歌单 API） ---------- */
    if (path === 'music2/billboards' && method === 'GET') {
      return json(res, 200, { ok: true, billboards: NETEASE_BILLBOARDS })
    }
    if (path === 'music2/toplist' && method === 'GET') {
      const bid = url.searchParams.get('bid') || '3778678'
      if (!/^\d{1,20}$/.test(bid)) return json(res, 400, { error: '无效榜单 ID' })
      const data = await safeFetchJson(`https://music.163.com/api/playlist/detail?id=${bid}`, {
        headers: {
          'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          referer: 'https://music.163.com/',
        },
        timeout: 15_000,
      })
      const name = data?.result?.name || '热歌榜'
      const tracks = data?.result?.tracks || []
      const items = tracks.slice(0, 50).map((t) => ({
        id: `wy-${t.id}`,
        channel: 'wy',
        name: t.name || '',
        singer: (t.artists || []).map((a) => a.name).join('/'),
        albumName: t.album?.name || '',
        interval: t.duration ? Math.round(t.duration / 1000) : undefined,
        cover: t.album?.picUrl || '',
        musicInfo: {
          id: String(t.id),
          songmid: String(t.id),
          hash: String(t.id),
          name: t.name || '',
          singer: (t.artists || []).map((a) => a.name).join('/'),
          albumName: t.album?.name || '',
          interval: t.duration ? Math.round(t.duration / 1000) : 0,
          albumId: t.album?.id ? String(t.album.id) : '',
        },
      }))
      return json(res, 200, { ok: true, name, items })
    }

    /* ---------- 音乐：网易歌单导入（链接或纯 ID → 曲目元数据） ---------- */
    if (path === 'music2/playlist-import' && method === 'POST') {
      const body = await readJson(req)
      const raw = String(body.input || '').trim()
      if (!raw) return json(res, 400, { error: '缺少歌单链接或 ID' })
      // 兼容 music.163.com/#/playlist?id=xxx、纯数字
      const idMatch = /playlist\?id=(\d{1,20})/.exec(raw) || /^(\d{1,20})$/.exec(raw)
      if (!idMatch) return json(res, 400, { error: '无法识别歌单：请粘贴 music.163.com 歌单链接或纯数字 ID' })
      const plId = idMatch[1] || idMatch[2]
      const data = await safeFetchJson(`https://music.163.com/api/playlist/detail?id=${plId}`, {
        headers: {
          'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          referer: 'https://music.163.com/',
        },
        timeout: 15_000,
      })
      const result = data?.result
      const tracks = result?.tracks || []
      if (!tracks.length) return json(res, 400, { error: '歌单为空或不可访问（可能需要登录权限）' })
      const items = tracks.slice(0, 300).map((t) => ({
        id: `wy-${t.id}`,
        channel: 'wy',
        name: t.name || '',
        singer: (t.artists || []).map((a) => a.name).join('/'),
        albumName: t.album?.name || '',
        interval: t.duration ? Math.round(t.duration / 1000) : undefined,
        cover: t.album?.picUrl || '',
        musicInfo: {
          id: String(t.id), songmid: String(t.id), hash: String(t.id),
          name: t.name || '', singer: (t.artists || []).map((a) => a.name).join('/'),
          albumName: t.album?.name || '', interval: t.duration ? Math.round(t.duration / 1000) : 0,
          albumId: t.album?.id ? String(t.album.id) : '',
        },
      }))
      return json(res, 200, { ok: true, playlistId: plId, name: result?.name || '导入歌单', count: items.length, items })
    }

    /* ---------- 音乐：网易歌单详情（点开歌单看曲目，不落库） ---------- */
    if (path === 'music2/playlist-detail' && method === 'GET') {
      const id = (url.searchParams.get('id') || '').replace(/\D/g, '').slice(0, 20)
      if (!id) return json(res, 400, { error: '缺少歌单 ID' })
      try {
        const data = await safeFetchJson('https://music.163.com/api/playlist/detail?id=' + id, {
          headers: {
            'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            referer: 'https://music.163.com/',
          },
          timeout: 15_000,
        })
        const result = data?.result
        const tracks = result?.tracks || []
        if (!tracks.length) return json(res, 502, { error: '歌单为空或不可访问' })
        return json(res, 200, { ok: true, name: result?.name || '歌单', cover: String(result?.coverImgUrl || '').replace(/^http:/, 'https:'), count: tracks.length, items: tracks.map((t) => ({
          id: 'wy-' + t.id, channel: 'wy', name: t.name || '', singer: (t.artists || []).map((x) => x.name).join('/'),
          albumName: t.album?.name || '', interval: t.duration ? Math.round(t.duration / 1000) : undefined,
          cover: t.album?.picUrl || '', musicInfo: { id: String(t.id), songmid: String(t.id), hash: String(t.id), name: t.name || '', singer: (t.artists || []).map((x) => x.name).join('/'), albumName: t.album?.name || '', interval: t.duration ? Math.round(t.duration / 1000) : 0, albumId: t.album?.id ? String(t.album.id) : '', Ext: 'mp3' },
        })) })
      } catch (err) {
        return json(res, err instanceof FetchError ? err.status : 502, { error: err.message })
      }
    }

    /* ---------- 音乐：网易歌单广场（匿名榜单式推荐歌单墙） ---------- */
    if (path === 'music2/playlist-square' && method === 'GET') {
      const cat = (url.searchParams.get('cat') || '全部').slice(0, 16)
      const limit = Math.min(60, Math.max(6, Number(url.searchParams.get('limit')) || 30))
      try {
        const data = await safeFetchJson(
          'https://music.163.com/api/playlist/list?cat=' + encodeURIComponent(cat) + '&limit=' + limit + '&order=hot',
          { headers: {
            'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            referer: 'https://music.163.com/',
          }, timeout: 15_000 },
        )
        const ps = Array.isArray(data?.playlists) ? data.playlists : []
        return json(res, 200, { ok: true, playlists: ps.map((p) => ({
          id: p.id,
          name: p.name || '',
          cover: String(p.coverImgUrl || '').replace(/^http:/, 'https:'),
          count: p.trackCount || 0,
          playCount: p.playCount || 0,
          creator: p?.creator?.nickname || '',
        })) })
      } catch (err) {
        return json(res, err instanceof FetchError ? err.status : 502, { error: err.message })
      }
    }

    /* ---------- 音乐：歌词（lx 缓存优先 → 网易公开歌词 API 直连） ---------- */
    if (path === 'music2/lyric' && method === 'GET') {
      const channel = url.searchParams.get('channel') || 'wy'
      let musicInfo = {}
      try {
        musicInfo = JSON.parse(url.searchParams.get('musicInfo') || '{}')
      } catch { /* 参数非法按空处理 */ }
      // 1) 洛雪脚本 lyric 通道（脚本会在 musicUrl 解析后缓存歌词）
      const state = await store.read()
      for (const row of state.lxSources.filter((s) => s.enabled && !s.error)) {
        const runtime = getLxRuntime(store, row)
        await runtime.ensureReady().catch(() => {})
        if (!runtime.capabilities()[channel]) continue
        try {
          const r = await runtime.handleRequest({ action: 'lyric', source: channel, info: { musicInfo } })
          if (r && typeof r === 'object' && typeof r.lyric === 'string' && r.lyric.trim()) {
            return json(res, 200, { ok: true, lyric: r.lyric, sourceName: row.name })
          }
        } catch { /* 脚本无缓存时抛错，继续直连 */ }
      }
      // 2) 网易公开歌词 API 直连
      if (channel === 'wy' && musicInfo.id) {
        const data = await safeFetchJson(
          `https://music.163.com/api/song/lyric?id=${encodeURIComponent(String(musicInfo.id))}&lv=1&kv=1&tv=-1`,
          { headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', referer: 'https://music.163.com/' }, timeout: 12_000 },
        )
        const lyric = data?.lrc?.lyric
        const translation = data?.tlyric?.lyric || ''
        if (lyric) return json(res, 200, { ok: true, lyric, translation, sourceName: '网易云' })
      }
      return json(res, 200, { ok: true, lyric: null })
    }

    /* ---------- 音乐：洛雪音源取播放链接 ---------- */
    if (path === 'music2/url' && method === 'POST') {
      const body = await readJson(req)
      const { channel, musicInfo, quality } = body
      if (!channel || !musicInfo || !musicInfo.id) return json(res, 400, { error: '参数不完整' })
      const state = await store.read()
      const enabled = state.lxSources.filter((s) => s.enabled)
      if (!enabled.length) return json(res, 400, { error: '尚未导入可用的洛雪音源，请到 设置 → 洛雪音源 导入' })
      const errors = []
      for (const row of enabled) {
        const runtime = getLxRuntime(store, row)
        await runtime.ensureReady().catch(() => {})
        const caps = runtime.capabilities()
        const cap = caps[channel]
        if (!cap) {
          errors.push(`${row.name}: 不支持 ${channel}`)
          continue
        }
        const useQuality = pickQuality(cap.qualitys, quality || '320k')
        try {
          const playUrl = await runtime.handleRequest({
            action: 'musicUrl',
            source: channel,
            info: { musicInfo, type: useQuality },
          })
          if (typeof playUrl === 'string' && /^https?:\/\//i.test(playUrl)) {
            return json(res, 200, { ok: true, url: playUrl, sourceName: row.name, quality: useQuality })
          }
          errors.push(`${row.name}: 返回了无效链接`)
        } catch (err) {
          errors.push(`${row.name}: ${err.message}`)
        }
      }
      // 回退：Internet Archive 公版
      if (musicInfo.archiveId) {
        try {
          const tracks = await musicTracks(musicInfo.archiveId)
          const hit = tracks[0]
          if (hit?.audioUrl) return json(res, 200, { ok: true, url: hit.audioUrl, sourceName: 'Internet Archive', quality: '公版' })
        } catch { /* ignore */ }
      }
      return json(res, 502, { error: errors.join('；') || '没有可用音源' })
    }

    /* ---------- 音乐：Internet Archive 公版库 ---------- */
    if (path === 'music/search' && method === 'GET') {
      const q = (url.searchParams.get('q') || '').trim()
      const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
      if (!q) return json(res, 400, { error: '缺少搜索词' })
      return json(res, 200, { ok: true, items: await musicSearch(q, page) })
    }
    if ((m = /^music\/item\/([^/]+)$/.exec(path)) && method === 'GET') {
      return json(res, 200, { ok: true, tracks: await musicTracks(decodeURIComponent(m[1])) })
    }
    if (path === 'music/upload' && method === 'POST') {
      const nameRaw = decodeURIComponent((/filename="([^"]+)"/.exec(req.headers['content-disposition'] || '') || [])[1] || 'audio.mp3')
      const ext = extname(nameRaw).toLowerCase()
      if (!AUDIO_MIME[ext]) return json(res, 400, { error: '仅支持音频文件（mp3/m4a/aac/ogg/opus/wav/flac）' })
      const buffer = await readBuffer(req, MAX_UPLOAD)
      const id = newId()
      const file = `music-${id}${ext}`
      await writeFile(join(store.filesDir, file), buffer)
      const track = {
        id: `local-${id}`, sourceId: 'local', sourceTrackId: file,
        title: nameRaw.replace(/\.[^.]+$/, ''), artist: '本地音乐', album: '',
        cover: '', audioUrl: `/funhub/files/${file}`, duration: undefined,
        size: buffer.length, addedAt: Date.now(),
      }
      await store.write((state) => {
        if (!state.tracks.some((t) => t.sourceTrackId === file)) state.tracks.push(track)
        return { track }
      })
      return json(res, 200, { ok: true, track })
    }

    /* ---------- 插件自带静态资源（UI 背景图等，assets/ 目录） ---------- */
    if ((m = /^asset\/([a-z0-9-]+\.(?:jpg|jpeg|png|webp))$/.exec(path)) && method === 'GET') {
      const file = join(ASSETS_DIR, m[1])
      const type = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[m[1].split('.').pop()]
      return sendFile(req, res, file, type)
    }

    /* ---------- 背景图：自定义上传 / 伺服 ---------- */
    if (path === 'bg/upload' && method === 'POST') {
      const slot = BG_SLOTS.includes(url.searchParams.get('slot')) ? url.searchParams.get('slot') : ''
      if (!slot) return json(res, 400, { error: '槽位不合法' })
      const buf = await readBuffer(req, 8_000_000)
      const kind = /\xff\xd8\xff/.test(buf.slice(0, 3).toString('binary')) ? 'jpg'
        : buf.slice(0, 8).toString('hex') === '89504e470d0a1a0a' ? 'png'
        : buf.slice(0, 4).toString('binary') === 'RIFF' && buf.slice(8, 12).toString('binary') === 'WEBP' ? 'webp' : ''
      if (!kind) return json(res, 400, { error: '仅支持 JPG / PNG / WebP 图片' })
      const file = join(store.backgroundsDir, `${slot}.${kind}`)
      for (const ext of ['jpg', 'png', 'webp']) {
        await rm(join(store.backgroundsDir, `${slot}.${ext}`), { force: true })
      }
      await writeFile(file, buf)
      const pathUrl = `/funhub/api/bg/${slot}?v=${Date.now()}`
      await store.write((st) => OPS.settings_save(st, { settings: { backgrounds: { [slot]: pathUrl } } }))
      return json(res, 200, { ok: true, path: pathUrl })
    }
    if ((m = /^bg\/([a-z]+)$/.exec(path)) && method === 'GET') {
      const slot = BG_SLOTS.includes(m[1]) ? m[1] : ''
      if (!slot) return json(res, 404, { error: '槽位不合法' })
      for (const [ext, mime] of [['webp', 'image/webp'], ['jpg', 'image/jpeg'], ['png', 'image/png']]) {
        try {
          const f = join(store.backgroundsDir, `${slot}.${ext}`)
          if (existsSync(f)) return sendFile(req, res, f, mime)
        } catch { /* continue */ }
      }
      // 未上传自定义：回落预置素材
      const fallback = { home: 'home-bg.webp', music: 'music-bg.webp', novel: 'novel-bg.webp', rss: 'rss-bg.webp', games: 'games-bg.webp' }[slot]
      return sendFile(req, res, join(ASSETS_DIR, fallback), 'image/webp')
    }

    /* ---------- 文件（本地上传的音频） ---------- */
    if ((m = /^files\/([a-zA-Z0-9._-]+)$/.exec(path)) && method === 'GET') {
      if (path.includes('..')) return json(res, 400, { error: '非法路径' })
      const ext = extname(m[1]).toLowerCase()
      const mime = AUDIO_MIME[ext]
      if (!mime) return json(res, 404, { error: '不支持的文件类型' })
      return sendFile(req, res, join(store.filesDir, m[1]), mime)
    }

    /* ================= RSS ================= */
    if (path === 'rss/recommend' && method === 'GET') {
      return json(res, 200, { ok: true, recommendations: RSS_RECOMMENDATIONS })
    }
    if (path === 'rss/refresh' && method === 'POST') {
      const body = await readJson(req).catch(() => ({}))
      const state = await store.read()
      const feeds = body.feedId ? state.rss.feeds.filter((f) => f.id === body.feedId) : state.rss.feeds
      if (!feeds.length) return json(res, 200, { ok: true, refreshed: 0, errors: [], rss: (await store.read()).rss })
      const results = await Promise.all(feeds.map(async (feed) => {
        try {
          const xml = await safeFetchText(feed.url, { timeout: 20_000, maxSize: 4_000_000 })
          const parsed = parseFeed(xml)
          const articles = parsed.articles.slice(0, 60).map((a) => ({
            id: newId(), feedId: feed.id, title: a.title, link: a.link,
            summary: a.summary, content: sanitizeHtml(a.content, { proxyImages: true }), publishedAt: a.publishedAt, read: false,
          }))
          const updated = { ...feed, title: parsed.title !== '未命名订阅' ? parsed.title : feed.title, lastFetchedAt: Date.now() }
          return { feed: updated, articles }
        } catch (err) {
          return { feed, articles: [], error: err.message }
        }
      }))
      let refreshed = 0
      for (const r of results) {
        await store.write((state) => OPS.rss_store(state, r))
        if (!r.error) refreshed += 1
      }
      const errors = results.filter((r) => r.error).map((r) => ({ feed: r.feed.title, error: r.error }))
      const after = await store.read()
      return json(res, 200, { ok: true, refreshed, errors, rss: after.rss })
    }

    /* ---------- 洛雪音源管理探测 ---------- */
    if (path === 'lxsource/probe' && method === 'POST') {
      const body = await readJson(req)
      const script = (body.script || '').trim()
      if (!script) return json(res, 400, { error: '缺少脚本内容' })
      if (script.length > MAX_SCRIPT) return json(res, 400, { error: '脚本过大' })
      const probe = new LxRuntime(script)
      await probe.ensureReady().catch(() => {})
      const status = probe.status()
      const meta = parseScriptMeta(script)
      const error = probe.loadError || (Object.keys(status.capabilities).length ? null : '脚本未声明可用的音源能力（inited.sources 为空或未发送 inited）')
      let saved = null
      // 只有探测成功才入库；报错的直接返回诊断，避免垃圾源堆积（清理按钮负责存量）
      if (!error) {
        const result = await store.write((state) => OPS.lxsource_add(state, { script, meta, capabilities: status.capabilities, error: null }))
        saved = result.lxSource
      }
      probe.dispose()
      return json(res, 200, { ok: true, meta, status: { ...status, capabilities: status.capabilities }, error, saved })
    }

    return json(res, 404, { error: '接口不存在' })
  } catch (err) {
    return json(res, err.status || 500, { error: err.message || '服务内部错误' })
  }
}
