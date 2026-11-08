// Host 冒烟测试：直接调用内部模块（不经过 HTTP 层）
import assert from 'node:assert/strict'
import { sourceCompatibility, legadoSearch, legadoDetail, legadoToc, legadoContent } from '../src/host/legado.js'
import { LxRuntime } from '../src/host/lx-runtime.js'
import { safeFetchLx } from '../src/host/fetcher.js'
import { VeneraRuntime } from '../src/host/venera-runtime.js'
import { searchNetease, searchKuwo } from '../src/host/music-search.js'
import { safeFetchJson } from '../src/host/fetcher.js'
import { parseFeed } from '../src/host/rss.js'
import { sanitizeHtml } from '../src/host/sanitize.js'
import { readFile } from 'node:fs/promises'

const results = []
const test = async (name, fn) => {
  try {
    await fn()
    results.push(`✓ ${name}`)
  } catch (err) {
    results.push(`✗ ${name}: ${err.message}`)
  }
}

/* ---------- RSS 解析 ---------- */
await test('RSS 解析', async () => {
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title><link>https://x.com</link>
  <item><title>文章&amp;1</title><link>https://x.com/1</link><description><![CDATA[<p>hi <script>alert(1)</script></p>]]></description><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item></channel></rss>`
  const feed = parseFeed(xml)
  assert.equal(feed.title, 'T')
  assert.equal(feed.articles.length, 1)
  assert.equal(feed.articles[0].title, '文章&1')
})

/* ---------- HTML 清理 ---------- */
await test('HTML 清理', () => {
  const dirty = `<div><script>alert(1)</script><p onclick="x()">a</p><a href="javascript:evil()">link</a><img src="https://x.com/i.png" onerror="y()"><iframe src="https://evil"></iframe></div>`
  const clean = sanitizeHtml(dirty)
  assert.ok(!clean.includes('script'))
  assert.ok(!clean.includes('onclick'))
  assert.ok(!clean.includes('javascript:'))
  assert.ok(!clean.includes('iframe'))
  assert.ok(clean.includes('img'))
})

/* ---------- 阅读书源（xiu2 酷我小说：API 型） ---------- */
const kwSource = {
  bookSourceName: '酷我小说', bookSourceUrl: 'https://appi.kuwo.cn',
  header: '{\n\t"Accept": "*/*",\n\t"User-Agent": "Dalvik/2.1.0 (Linux; U; Android 8.0.0)"\n}',
  searchUrl: '/novels/api/book/search?keyword={{key}}&pi={{page}}&ps=30',
  ruleSearch: {
    author: '$.author_name', bookList: '$.data', bookUrl: '/novels/api/book/{{$.book_id}}',
    coverUrl: '$.cover_url', intro: '$.intro', name: '$.title', wordCount: '$.all_words',
  },
  ruleBookInfo: { author: '$.author_name', coverUrl: '$.cover_url', init: '$.data', intro: '$.intro', name: '$.title', tocUrl: '/novels/api/book/{{$.book_id}}/chapters?paging=0' },
  ruleToc: { chapterList: '$.data', chapterName: '$.chapter_title', chapterUrl: '/novels/api/book/{{$.book_id}}/chapters/{{$.chapter_id}}' },
  ruleContent: { content: '$.data.content' },
}

await test('书源兼容检测', () => {
  const compat = sourceCompatibility(kwSource)
  assert.ok(compat.compatible, compat.issues.join())
})

await test('书源搜索（酷我小说 API）', async () => {
  const books = await legadoSearch(kwSource, '斗罗大陆', 1)
  assert.ok(books.length > 0, '无搜索结果')
  assert.ok(books[0].name, '缺书名')
  globalThis.__fhBook = books[0]
  console.log('  搜索结果:', books.slice(0, 3).map((b) => `${b.name}/${b.author}`).join(' | '))
})

await test('书源详情与目录', async () => {
  const book = globalThis.__fhBook
  const detail = await legadoDetail(kwSource, book.bookId)
  assert.ok(detail.name)
  const chapters = await legadoToc(kwSource, detail.tocUrl)
  assert.ok(chapters.length > 0, '无章节')
  globalThis.__fhChapter = chapters[0]
  console.log(`  《${detail.name}》${chapters.length} 章`)
})

await test('书源正文', async () => {
  const content = await legadoContent(kwSource, globalThis.__fhChapter.url)
  assert.ok(content.paragraphs.length > 0, '正文为空')
  console.log(`  正文段落数: ${content.paragraphs.length}`)
})

/* ---------- 图片源（免 Key） ---------- */
await test('图片源适配器（bing + nasa）', async () => {
  const { imageFeed } = await import('../src/host/proxy.js')
  const bing = await imageFeed({ source: 'bing', page: 1 })
  assert.ok(bing.length >= 1, 'bing 无结果')
  const nasa = await imageFeed({ source: 'nasa', page: 1 })
  assert.ok(nasa.length > 0 && nasa[0].url.includes('images-assets.nasa.gov'), 'nasa 异常')
  console.log(`  bing ${bing.length} 张 / nasa ${nasa.length} 张`)
})

/* ---------- 洛雪音源（星海音乐源） ---------- */
await test('洛雪音源运行时（星海脚本）', async () => {
  const script = await readFile('/Users/wanghao/Downloads/xinghai-music-sourcev2.3.13.js', 'utf-8')
  const runtime = new LxRuntime(script)
  await runtime.ensureReady()
  const status = runtime.status()
  assert.ok(!status.loadError, `加载失败: ${status.loadError}`)
  assert.ok(Object.keys(status.capabilities).length > 0, '无音源能力')
  console.log('  能力:', Object.entries(status.capabilities).map(([k, v]) => `${k}(${v.qualitys.length}档)`).join(' '))
  globalThis.__fhLx = runtime
})

/* ---------- 内置音乐搜索通道 ---------- */
await test('网易云搜索通道', async () => {
  const items = await searchNetease('周杰伦 晴天', 1)
  assert.ok(items.length > 0, '无结果')
  console.log('  结果:', items.slice(0, 3).map((i) => `${i.name} - ${i.singer}`).join(' | '))
  globalThis.__fhSong = items[0]
})

/* ---------- 端到端：搜索→取播放URL ---------- */
await test('端到端取播放 URL（搜索 → 洛雪脚本）', async () => {
  const runtime = globalThis.__fhLx
  const song = globalThis.__fhSong
  if (!runtime || !song) throw new Error('前置步骤失败')
  const url = await runtime.handleRequest({ action: 'musicUrl', source: 'wy', info: { musicInfo: song.musicInfo, type: '128k' } })
  assert.ok(/^https?:\/\//.test(url), `无效 URL: ${url}`)
  console.log(`  ${song.name}: ${url.slice(0, 80)}…`)
})

/* ---------- 歌词：网易云公开歌词 API ---------- */
await test('歌词 API（网易云直连）', async () => {
  const song = globalThis.__fhSong
  assert.ok(song?.musicInfo?.id, '前置搜索失败')
  const data = await safeFetchJson(
    `https://music.163.com/api/song/lyric?id=${encodeURIComponent(String(song.musicInfo.id))}&lv=1&kv=1&tv=-1`,
    { headers: { referer: 'https://music.163.com/' }, timeout: 12_000 },
  )
  const lyric = data?.lrc?.lyric
  assert.ok(lyric && lyric.includes('['), '歌词为空')
  globalThis.__fhLrc = lyric
  console.log(`  歌词 ${lyric.length} 字符，首行: ${lyric.split('\n').find((l) => l.includes('['))?.slice(0, 40)}`)
})

/* ---------- venera 漫画源（MangaDex） ---------- */
await test('venera 漫画源运行时（MangaDex）', async () => {
  const script = await readFile('/tmp/venera-mangadex.js', 'utf-8')
  const runtime = new VeneraRuntime(script, {})
  const info = await runtime.ensureReady()
  assert.ok(!info.loadError, `加载失败: ${info.loadError}`)
  assert.ok(info.hasSearch)
  console.log(`  ${info.name} v${info.version} 加载成功`)
  globalThis.__fhComicRuntime = runtime
})

await test('venera 漫画搜索与章节', async () => {
  const runtime = globalThis.__fhComicRuntime
  const search = await runtime.search('one piece', 1).catch((e) => { throw new Error(e.message) })
  assert.ok(search.comics.length > 0, '无搜索结果')
  const comic = search.comics.find((c) => c.title) || search.comics[0]
  console.log(`  搜索结果: ${search.comics.slice(0, 3).map((c) => c.title).join(' | ')}`)
  const chapters = await runtime.getChapters(comic.id)
  assert.ok(chapters.length > 0, '无章节')
  console.log(`  《${comic.title}》${chapters.length} 章`)
  const ep = await runtime.loadEp(comic.id, chapters[chapters.length - 1].id)
  assert.ok(ep.images.length > 0, '无图片')
  console.log(`  首章图片数: ${ep.images.length}`)
})

console.log('\n' + results.join('\n'))
const failed = results.filter((r) => r.startsWith('✗')).length
process.exit(failed ? 1 : 0)
