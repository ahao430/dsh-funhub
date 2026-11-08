// 批量添加 RSS 订阅：复用 FunHub 自己的抓取 / 解析 / 正文清洗链路，
// 效果等价于在 UI 里点「添加订阅」+「刷新」（受限于 /funhub/* 需要 Web 登录态，故不走 HTTP）。
// 用法：node scripts/add-rss-feeds.mjs [--dry]
import { Store, newId } from '../src/host/store.js'
import { OPS } from '../src/host/ops.js'
import { parseFeed } from '../src/host/rss.js'
import { sanitizeHtml } from '../src/host/sanitize.js'
import { safeFetchText } from '../src/host/fetcher.js'

const DRY = process.argv.includes('--dry')

// 订阅清单在 feeds.local.js（.gitignore 排除，防止个人订阅进仓库）
let TARGETS = []
try { ({ TARGETS } = await import('./feeds.local.js')) } catch { /* 未配置则空跑 */ }
if (!TARGETS.length) console.log('[提示] scripts/feeds.local.js 未配置订阅，空跑（参考 feeds.local.js 格式）')

const store = new Store()
const results = []

for (const target of TARGETS) {
  try {
    const xml = await safeFetchText(target.url, { timeout: 20_000, maxSize: 4_000_000 })
    const parsed = parseFeed(xml)
    if (DRY) {
      results.push({ ...target, ok: true, parsedTitle: parsed.title, articles: parsed.articles.length })
      continue
    }
    const out = await store.write((state) => {
      let feed = state.rss.feeds.find((f) => f.url === target.url)
      if (!feed) feed = OPS.rss_add(state, target).feed
      const articles = parsed.articles.slice(0, 60).map((a) => ({
        id: newId(),
        feedId: feed.id,
        title: a.title,
        link: a.link,
        summary: a.summary,
        content: sanitizeHtml(a.content, { proxyImages: true }),
        publishedAt: a.publishedAt,
        read: false,
      }))
      OPS.rss_store(state, {
        feed: { ...feed, title: parsed.title !== '未命名订阅' ? parsed.title : feed.title, lastFetchedAt: Date.now() },
        articles,
      })
      return { feedId: feed.id, title: parsed.title, count: articles.length }
    })
    results.push({ ...target, ok: true, ...out })
  } catch (err) {
    results.push({ ...target, ok: false, error: err?.message || String(err) })
  }
}

console.log(JSON.stringify(results, null, 2))