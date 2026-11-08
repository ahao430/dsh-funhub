// 外部内容源适配（全部走 safeFetchText/Json，出站请求有超时/大小/SSRF 防护）。
// 内置适配器均为公版或官方开放 API（不是第三方内容源集合）：
//   小说   Gutendex / Project Gutenberg（公版书元数据与正文）
//   图片   Picsum（无 Key 演示）+ Pexels / Unsplash（用户自配 API Key）
//   音乐   Internet Archive 公版音频（搜索 + 直链）
// 书源 / 漫画源 / 音源全部由用户自行导入（设置 → 资源管理）。
import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { safeFetchJson, safeFetchText, FetchError } from './fetcher.js'

/* ---------------- 小说：Gutendex + Gutenberg 正文 ---------------- */

const GUTENDEX = 'https://gutendex.com/books'

function gutendexBook(item) {
  const cover = item.formats?.['image/jpeg'] || ''
  return {
    bookId: String(item.id),
    sourceId: 'gutenberg',
    title: item.title || '无题',
    author: item.authors?.map((a) => a.name).join(' / ') || '佚名',
    cover,
    languages: item.languages || [],
    subjects: (item.subjects || []).slice(0, 6),
    downloadCount: item.download_count || 0,
  }
}

export async function novelSearch(query, page = 1) {
  const url = `${GUTENDEX}/?search=${encodeURIComponent(query)}&page=${page}`
  const data = await safeFetchJson(url, { timeout: 20_000 })
  return {
    page,
    books: (data.results || []).map(gutendexBook),
    next: Boolean(data.next),
  }
}

/** Gutenberg 热门公版书（无需关键词，小说频道默认推荐）。 */
export async function novelPopular(page = 1) {
  const data = await safeFetchJson(`${GUTENDEX}/?sort=popular&page=${page}`, { timeout: 20_000 })
  return { page, books: (data.results || []).map(gutendexBook), next: Boolean(data.next) }
}

export async function novelDetail(bookId) {
  const data = await safeFetchJson(`${GUTENDEX}/${Number(bookId)}`, { timeout: 15_000 })
  return gutendexBook(data)
}

/** Gutenberg 正文：优先 cache/epub 全量 txt，落盘缓存（novel-{id}.txt）。 */
export async function novelContent(cacheDir, bookId) {
  const id = Number(bookId)
  if (!Number.isInteger(id) || id <= 0 || id > 1_000_000) throw new FetchError('无效的书籍 ID', 400)
  const file = join(cacheDir, `novel-${id}.txt`)
  const hit = await stat(file).then(() => true).catch(() => false)
  if (hit) return readFile(file, 'utf8')
  const candidates = [
    `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`,
    `https://www.gutenberg.org/files/${id}/${id}-0.txt`,
  ]
  let lastErr = null
  for (const url of candidates) {
    try {
      const text = await safeFetchText(url, { timeout: 30_000, maxSize: 6_000_000 })
      await mkdir(cacheDir, { recursive: true })
      await writeFile(file, text)
      return text
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr || new FetchError('获取书籍正文失败')
}

/* ---------------- 图片：9 个来源适配器 ----------------
 * 免 Key：Picsum / Bing 每日壁纸 / Wallhaven（全年龄）/ 芝加哥艺术学院（公版艺术）/
 *         NASA 影像 / Wikimedia Commons
 * 需 Key：Pexels / Unsplash / Pixabay（用户自行申请，设置 → 图片源 填写）
 * 统一返回形状：{id,title,url,thumb,w,h,author,authorUrl,source,pageUrl}
 */

export async function imageFeed({ source = 'picsum', query = '', page = 1, apiKey = '' }) {
  const q = (query || '').trim()
  if (source === 'pexels') return imageFeedPexels(q, page, apiKey)
  if (source === 'unsplash') return imageFeedUnsplash(q, page, apiKey)
  if (source === 'pixabay') return imageFeedPixabay(q, page, apiKey)
  if (source === 'bing') return imageFeedBing(q, page)
  if (source === 'wallhaven') return imageFeedWallhaven(q, page, apiKey)
  if (source === 'artic') return imageFeedArtic(q, page)
  if (source === 'nasa') return imageFeedNasa(q, page)
  if (source === 'wikimedia') return imageFeedWikimedia(q, page)
  if (source === 'pixiv') return pixivRanking(q, page)
  if (source === 'boredpanda' || source === 'designboom' || source === 'mymodernmet') return rssFeedImages(source, page)
  return imageFeedPicsum(q, page)
}

/* ---- 需 Key 的平台 ---- */

async function imageFeedPexels(q, page, apiKey) {
  if (!apiKey) throw new FetchError('未配置 Pexels API Key，请到 设置 → 图片源 填写', 400)
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(q || 'nature')}&per_page=24&page=${page}`
  const data = await safeFetchJson(url, { headers: { authorization: apiKey }, timeout: 15_000 })
  return (data.photos || []).map((p) => ({
    id: `pexels-${p.id}`,
    title: p.alt || `Photo by ${p.photographer}`,
    url: p.src?.large2x || p.src?.original,
    thumb: p.src?.medium || p.src?.small,
    w: p.width, h: p.height,
    author: p.photographer, authorUrl: p.photographer_url,
    source: 'pexels', pageUrl: p.url,
  }))
}

async function imageFeedUnsplash(q, page, apiKey) {
  if (!apiKey) throw new FetchError('未配置 Unsplash Access Key，请到 设置 → 图片源 填写', 400)
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q || 'nature')}&per_page=24&page=${page}`
  const data = await safeFetchJson(url, { headers: { authorization: `Client-ID ${apiKey}` }, timeout: 15_000 })
  return (data.results || []).map((p) => ({
    id: `unsplash-${p.id}`,
    title: p.alt_description || p.description || `Photo by ${p.user?.name}`,
    url: p.urls?.regular,
    thumb: p.urls?.small,
    w: p.width, h: p.height,
    author: p.user?.name, authorUrl: p.user?.links?.html,
    source: 'unsplash', pageUrl: p.links?.html,
  }))
}

async function imageFeedPixabay(q, page, apiKey) {
  if (!apiKey) throw new FetchError('未配置 Pixabay API Key（pixabay.com/api 免费申请），请到 设置 → 图片源 填写', 400)
  const url = `https://pixabay.com/api/?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(q || 'nature')}&per_page=24&page=${page}&safesearch=true&image_type=photo`
  const data = await safeFetchJson(url, { timeout: 15_000 })
  if (data?.error) throw new FetchError(`Pixabay: ${data.error}`)
  return (data.hits || []).map((p) => ({
    id: `pixabay-${p.id}`,
    title: p.tags || `Photo by ${p.user}`,
    url: p.largeImageURL || p.webformatURL,
    thumb: p.webformatURL || p.previewURL,
    w: p.imageWidth, h: p.imageHeight,
    author: p.user,
    source: 'pixabay', pageUrl: p.pageURL,
  }))
}

/* ---- 免 Key 的平台 ---- */

/** Bing 每日壁纸存档：第 1 页最近 8 天，第 2 页再往前 8 天（存档仅保留约 15 天），不支持服务端搜索。 */
async function imageFeedBing(q, page) {
  const idx = Math.min((page - 1) * 8, 7)
  const url = `https://www.bing.com/HPImageArchive.aspx?format=js&mkt=zh-CN&idx=${idx}&n=8`
  const data = await safeFetchJson(url, { timeout: 15_000 })
  const images = (data.images || []).map((img) => {
    const base = img.urlbase || (img.url || '').replace(/_\d+x\d+\.jpg$/, '')
    const full = base ? `${base}_1920x1080.jpg` : img.url
    const abs = (u) => (u?.startsWith('http') ? u : `https://www.bing.com${u}`)
    return {
      id: `bing-${base || img.url}`,
      title: img.title || (img.copyright || '').split('(')[0]?.trim() || 'Bing 每日壁纸',
      url: abs(full),
      thumb: abs(full),
      w: 1920, h: 1080,
      author: (img.copyright || '').replace(/\(.*?\)\s*$/, '').trim() || 'Bing',
      source: 'bing', pageUrl: img.copyrightlink ? abs(img.copyrightlink) : '',
    }
  })
  return q ? images.filter((i) => `${i.title}${i.author}`.toLowerCase().includes(q.toLowerCase())) : images
}

/** Wallhaven 壁纸：免 Key 仅限全年龄（purity=100）；用户可选填 Key 解锁更多分类。 */
async function imageFeedWallhaven(q, page, apiKey) {
  const params = new URLSearchParams({ purity: '100', categories: '111', page: String(page) })
  if (q) params.set('q', q)
  if (apiKey) params.set('apikey', apiKey)
  const data = await safeFetchJson(`https://wallhaven.cc/api/v1/search?${params}`, { timeout: 15_000 })
  return (data.data || []).map((w) => {
    const [width, height] = String(w.dimension || '').split('x').map(Number)
    return {
      id: `wallhaven-${w.id}`,
      title: `Wallhaven #${w.id}`,
      url: w.path,
      thumb: w.thumbs?.large || w.thumbs?.original || w.thumbs?.small,
      w: width || 1920, h: height || 1080,
      author: w.uploader?.username || 'Wallhaven',
      source: 'wallhaven', pageUrl: w.url,
    }
  })
}

/** 芝加哥艺术学院开放接口：仅公版作品（CC0），艺术 / 绘画 / 设计。 */
async function imageFeedArtic(q, page) {
  const params = new URLSearchParams({
    q: q || 'painting',
    'query[term][is_public_domain]': 'true',
    limit: '24',
    page: String(page),
    fields: 'id,title,artist_title,image_id,date_display',
  })
  const data = await safeFetchJson(`https://api.artic.edu/api/v1/artworks/search?${params}`, { timeout: 15_000 })
  return (data.data || [])
    .filter((a) => a.image_id)
    .map((a) => ({
      id: `artic-${a.id}`,
      title: `${a.title}${a.date_display ? `（${a.date_display}）` : ''}`,
      url: `https://www.artic.edu/iiif/2/${a.image_id}/full/1686,/0/default.jpg`,
      thumb: `https://www.artic.edu/iiif/2/${a.image_id}/full/843,/0/default.jpg`,
      w: 1686, h: 1200,
      author: a.artist_title || '芝加哥艺术学院',
      source: 'artic', pageUrl: `https://www.artic.edu/artworks/${a.id}`,
    }))
}

/** NASA 影像库：太空 / 地球 / 航天，公版。原图 URL 由 nasa_id 确定性构造，无需逐条请求。 */
async function imageFeedNasa(q, page) {
  const url = `https://images-api.nasa.gov/search?q=${encodeURIComponent(q || 'galaxy earth')}&media_type=image&page=${page}&page_size=24`
  const data = await safeFetchJson(url, { timeout: 20_000 })
  return (data.collection?.items || []).map((item) => {
    const meta = item.data?.[0] || {}
    const nasaId = meta.nasa_id
    if (!nasaId) return null
    return {
      id: `nasa-${nasaId}`,
      title: meta.title || 'NASA 影像',
      url: `https://images-assets.nasa.gov/image/${nasaId}/${nasaId}~orig.jpg`,
      thumb: item.links?.[0]?.href || `https://images-assets.nasa.gov/image/${nasaId}/${nasaId}~thumb.jpg`,
      w: 0, h: 0,
      author: meta.photographer || meta.center || 'NASA',
      source: 'nasa', pageUrl: `https://images.nasa.gov/details/${nasaId}`,
    }
  }).filter(Boolean)
}

/** Wikimedia Commons：自由许可图片库，署名信息来自 extmetadata。 */
async function imageFeedWikimedia(q, page) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', origin: '*',
    generator: 'search',
    gsrsearch: `filetype:bitmap ${q || 'featured pictures'}`,
    gsrnamespace: '6',
    gsrlimit: '24',
    gsroffset: String((page - 1) * 24),
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    iiurlwidth: '480',
  })
  const data = await safeFetchJson(`https://commons.wikimedia.org/w/api.php?${params}`, { timeout: 20_000 })
  const pages = Object.values(data?.query?.pages || {})
  return pages
    .filter((p) => p.imageinfo?.[0])
    .map((p) => {
      const info = p.imageinfo[0]
      const artist = (info.extmetadata?.Artist?.value || '').replace(/<[^>]*>/g, '').trim().slice(0, 60)
      return {
        id: `wmc-${info.sha1 || p.pageid}`,
        title: (p.title || '').replace(/^File:/, ''),
        url: info.url,
        thumb: info.thumburl || info.url,
        w: info.width, h: info.height,
        author: artist || 'Wikimedia Commons',
        source: 'wikimedia', pageUrl: info.descriptionurl || '',
      }
    })
}

/** Picsum：无 Key 演示源，按页生成稳定 seed。 */
async function imageFeedPicsum(q, page) {
  const ids = Array.from({ length: 24 }, (_, i) => (page - 1) * 24 + i + 1 + (q ? hashSeed(q) : 0))
  return ids.map((id) => ({
    id: `picsum-${id}`,
    title: `Picsum #${id}`,
    url: `https://picsum.photos/id/${id % 1084}/1200/800`,
    thumb: `https://picsum.photos/id/${id % 1084}/480/320`,
    w: 1200, h: 800,
    author: 'Picsum Photos', authorUrl: 'https://picsum.photos',
    source: 'picsum', pageUrl: `https://picsum.photos/id/${id % 1084}/1200/800`,
  }))
}

function hashSeed(text) {
  return parseInt(createHash('md5').update(String(text)).digest('hex').slice(0, 6), 16) % 1000
}

/* ---------------- 音乐：Internet Archive 公版音频 ---------------- */

export async function musicSearch(query, page = 1) {
  const q = `(${query}) AND mediatype:(audio) AND format:(MP3)`
  const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&rows=20&page=${page}&output=json`
  const data = await safeFetchJson(url, { timeout: 25_000 })
  const docs = data.response?.docs || []
  return docs.map((d) => ({
    id: `ia-${d.identifier}`,
    sourceId: 'internetarchive',
    sourceTrackId: d.identifier,
    title: d.title || d.identifier,
    artist: typeof d.creator === 'string' ? d.creator : (Array.isArray(d.creator) ? d.creator[0] : 'Internet Archive'),
    cover: `https://archive.org/services/img/${d.identifier}`,
  }))
}

/** 取一个 archive item 内的第一批 mp3 文件作为可播曲目。 */
export async function musicTracks(identifier) {
  const data = await safeFetchJson(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, { timeout: 20_000 })
  const server = data.server ? `https://${data.server}` : 'https://archive.org'
  const dir = data.dir || `/${identifier}`
  const mp3s = (data.files || []).filter((f) => /\.mp3$/i.test(f.name || ''))
  return mp3s.slice(0, 100).map((f) => ({
    id: `ia-${identifier}-${f.name}`,
    sourceId: 'internetarchive',
    sourceTrackId: `${identifier}/${f.name}`,
    title: (f.title || f.name.replace(/\.mp3$/i, '')),
    artist: (data.metadata?.creator || 'Internet Archive'),
    album: data.metadata?.title || identifier,
    cover: `https://archive.org/services/img/${identifier}`,
    audioUrl: `${server}${dir}/${encodeURIComponent(f.name)}`,
    duration: f.length ? Number(f.length) : undefined,
  }))
}


/* ---- Pixiv 排行榜（官方 ranking.php?format=json，免登录；方案 A） ----
   搜索框关键词映射榜单：空/日=每日、周、月、新人、原创、男性向、女性向。
   i.pximg.net 有 Referer 防盗链，缩略图与大图统一改写为宿主图片代理并带 pixiv Referer。 */
const PIXIV_REFERER = 'https://www.pixiv.net/'
const PIXIV_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'

function pixivProxied(url) {
  const h = Buffer.from(JSON.stringify({ referer: PIXIV_REFERER })).toString('base64')
  return '/funhub/img?u=' + encodeURIComponent(url) + '&h=' + encodeURIComponent(h)
}

export async function pixivRanking(query, page) {
  const q = (query || '').trim()
  const modes = [['周', 'weekly'], ['月', 'monthly'], ['新人', 'rookie'], ['原创', 'original'], ['男性', 'male'], ['女性', 'female']]
  const mode = modes.find(([k]) => q.includes(k))?.[1] || 'daily'
  const data = await safeFetchJson(
    'https://www.pixiv.net/ranking.php?mode=' + mode + '&content=all&format=json&p=' + Math.min(10, Math.max(1, page)),
    { headers: { 'user-agent': PIXIV_UA, referer: PIXIV_REFERER, accept: 'application/json' }, timeout: 15_000 },
  )
  const contents = Array.isArray(data?.contents) ? data.contents : []
  return contents.map((c) => ({
    id: 'pixiv-' + c.illust_id + (c.page ?? ''),
    title: c.title || 'Untitled',
    author: c.user_name || '',
    thumb: pixivProxied(c.url || ''),
    url: pixivProxied(String(c.url || '').replace('/c/480x960/', '/c/600x1200/')),
    width: c.width, height: c.height,
    source: 'Pixiv·' + { daily: '日榜', weekly: '周榜', monthly: '月榜', rookie: '新人', original: '原创', male: '男性向', female: '女性向' }[mode],
    link: 'https://www.pixiv.net/artworks/' + c.illust_id,
  }))
}


/* ---- RSS 图片图源：设计/艺术类 WordPress 全文 feed，抽取 item 内 <img> ---- */
const RSS_IMAGE_FEEDS = {
  boredpanda: { url: 'https://www.boredpanda.com/feed/', label: 'Bored Panda' },
  designboom: { url: 'https://www.designboom.com/feed/', label: 'Designboom' },
  mymodernmet: { url: 'https://mymodernmet.com/feed/', label: 'My Modern Met' },
}

export async function rssFeedImages(source, page) {
  const feed = RSS_IMAGE_FEEDS[source]
  if (!feed) throw new FetchError('未知图源', 400)
  const xml = await safeFetchText(feed.url, { timeout: 15_000, maxSize: 6_000_000 })
  const items = String(xml).split(/<item[ >]/).slice(1)
  const images = []
  for (const item of items) {
    const block = item.slice(0, item.indexOf('</item>') + 7)
    const titleRaw = /<title>([\s\S]*?)<\/title>/.exec(block)?.[1] || ''
    const title = titleRaw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim()
    const link = /<link>([^<]{1,500})<\/link>/.exec(block)?.[1]?.trim()
    const imgRe = /<img[^>]*?\ssrc=["']([^"']+)["'][^>]*>/g
    let m
    while ((m = imgRe.exec(block))) {
      const raw = m[1]
      if (!/^https?:\/\//i.test(raw)) continue
      if (/avatar|gravatar|emoji|logo|badge|1x1|spacer/i.test(raw)) continue
      images.push({
        id: source + '-' + images.length + '-' + (link || ''),
        title, author: feed.label,
        thumb: raw, url: raw,
        source: feed.label,
        link,
      })
      if (images.length >= 120) break
    }
    if (images.length >= 120) break
  }
  // 分页：每页 30
  const per = 30
  const start = (Math.max(1, page) - 1) * per
  return images.slice(start, start + per).map((img) => ({ ...img, id: img.id + ':' + start }))
}
