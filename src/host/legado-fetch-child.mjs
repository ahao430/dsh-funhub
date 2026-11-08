// 子进程：stdin 读 JSON 请求 {url, method, headers, body, timeout, maxSize}
// → 宿主 fetcher 抓取（SSRF/端口黑名单/大小上限全部沿用）→ stdout 写 JSON 结果。
// 由 legado-js.js 在沙箱内以 spawnSync 调起，给 JS 规则提供"同步网络"语义。
import { readFileSync } from 'node:fs'
import { safeFetchText } from './fetcher.js'

let req = {}
try { req = JSON.parse(readFileSync(0, 'utf8')) } catch { /* 空/坏输入 → 报错退出 */ }

try {
  if (!req.url || !/^https?:\/\//i.test(String(req.url))) throw new Error('缺少合法的 http(s) URL')
  const init = { timeout: req.timeout || 20000, maxSize: req.maxSize || 6_000_000, headers: req.headers || {} }
  if (req.body != null && String(req.method || 'GET').toUpperCase() !== 'GET') {
    init.requestBody = String(req.body)
    init.requestMethod = String(req.method).toUpperCase()
  }
  const text = await safeFetchText(String(req.url), init)
  process.stdout.write(JSON.stringify({ ok: true, text }))
} catch (err) {
  process.stdout.write(JSON.stringify({ ok: false, error: err?.message || String(err) }))
}
