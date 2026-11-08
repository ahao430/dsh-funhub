// Pixiv 源 + 代理设置真实链路测试（DSH_HOME 隔离）。
import assert from 'node:assert/strict'
process.env.DSH_HOME ||= '/tmp/funhub-pixiv-test-home'
import { apply } from '../src/host/index.js'
import { proxyStatus } from '../src/host/fetcher.js'

const routes = []
const ctx = {
  logger: { info() {}, warn() {}, error() {} },
  effect: (fn) => fn(),
  webServer: { register: (r) => routes.push(r) },
  get: () => ({ requestRejection: () => undefined }),
}
apply(ctx)
const route = routes.find((r) => r.path === '/funhub')

function makeRes() {
  const res = {
    statusCode: 0, chunks: [], done: false,
    setHeader() {}, end(body) { this.done = true; if (body != null) this.chunks.push(body) }, write() {},
  }
  res.json = () => JSON.parse(Buffer.concat(res.chunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c)))).toString() || '{}')
  return res
}
const req = (url, method = 'GET', body = null) => ({
  url, method, headers: { 'content-type': 'application/json' },
  async *[Symbol.asyncIterator]() { if (body) yield Buffer.from(JSON.stringify(body)) },
})

const results = []
const test = async (name, fn) => {
  try { await fn(); results.push(`✓ ${name}`) } catch (err) { results.push(`✗ ${name}: ${err.message}`) }
}

await test('Pixiv 日榜返回且缩略走代理带防盗链头', async () => {
  const res = makeRes()
  await route.handler(req('/funhub/api/image/feed?source=pixiv&page=1'), res)
  const body = res.json()
  assert.ok(body.ok, JSON.stringify(body).slice(0, 120))
  assert.ok(body.images.length >= 20, `条目过少: ${body.images.length}`)
  const img = body.images[0]
  assert.ok(img.thumb.startsWith('/funhub/img?u='), '缩略未走代理')
  assert.ok(img.thumb.includes('h='), '缺少防盗链头参数')
  assert.ok(img.url.includes('600x1200'), '大图未升级尺寸')
  assert.ok(img.link?.includes('pixiv.net/artworks/'), '缺少作品链接')
})

await test('network/check 直连模式可用', async () => {
  const res = makeRes()
  await route.handler(req('/funhub/api/network/check', 'POST', {}), res)
  const body = res.json()
  assert.ok(res.statusCode === 200)
  assert.equal(body.via, '直连')
  assert.ok(body.ok, `直连失败: ${body.error}`)
})

await test('启用坏端口代理 → 检测如实报错 + 抓取熔断直连不崩溃', async () => {
  const s = makeRes()
  await route.handler(req('/funhub/api/op', 'POST', { op: 'settings_save', settings: { proxy: { enabled: true, host: '127.0.0.1', port: 1 } } }), s)
  assert.ok(s.json().ok)
  // network/check 用一次性 dispatcher 原样测代理：坏端口应如实报不通
  const res = makeRes()
  await route.handler(req('/funhub/api/network/check', 'POST', {}), res)
  const body = res.json()
  assert.equal(body.via.includes(':1'), true, '未按新代理测试')
  assert.equal(body.ok, false, '坏端口不应连通')
  // 实际抓取走 fetchViaProxy 熔断设计：代理连接失败 → 标记熔断 → 直连重试，优雅返回而非崩溃
  const bad = makeRes()
  await route.handler(req('/funhub/api/image/feed?source=pixiv&page=1'), bad)
  const b2 = bad.json()
  assert.equal(bad.statusCode, 200, '应优雅返回而非 500')
  if (b2.ok && b2.images?.length) {
    // 坏代理下还能成功 ⇒ 一定来自直连回退 ⇒ 熔断必然已触发（证明确实尝试过代理）
    assert.equal(proxyStatus().down, true, '直连回退应先触发代理熔断')
  } else {
    assert.ok(b2.error, '失败时应有错误信息')
  }
})

await test('关闭代理恢复直连', async () => {
  const s = makeRes()
  await route.handler(req('/funhub/api/op', 'POST', { op: 'settings_save', settings: { proxy: { enabled: false, host: '127.0.0.1', port: 7890 } } }), s)
  const res = makeRes()
  await route.handler(req('/funhub/api/network/check', 'POST', {}), res)
  assert.equal(res.json().via, '直连')
})

console.log(results.join('\n'))
const failed = results.filter((r) => r.startsWith('✗')).length
process.exit(failed ? 1 : 0)
