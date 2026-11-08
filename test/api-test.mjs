// Host 插件加载冒烟：模拟 cordis ctx，真实调用 apply() + HTTP handler。
import './lib/failfast.mjs'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../src/host/index.js'

// 独立临时 DSH_HOME：此前直接用真实 ~/.dsh，fav_toggle 等写操作会污染用户数据
// 且导致结果随运行次数翻转（已收藏↔未收藏）。
const home = mkdtempSync(join(tmpdir(), 'funhub-api-'))
process.env.DSH_HOME = home

const registered = []
const ctx = {
  logger: { info: () => {}, warn: () => {}, error: () => {} },
  effect: (fn) => { const dispose = fn(); return typeof dispose === 'function' ? dispose : () => {} },
  webServer: {
    register(route) { registered.push(route) },
  },
  get: (name) => (name === 'connection' ? { requestRejection: () => undefined } : undefined),
}

apply(ctx)
const route = registered.find((r) => r.kind === 'prefix' && r.path === '/funhub')
assert.ok(route, 'webServer 未注册 /funhub 路由')
console.log('✓ apply() 注册路由成功')

function makeRes() {
  const res = {
    statusCode: 0, headers: {}, chunks: [], headersSent: false,
    setHeader(k, v) { this.headers[k] = v },
    end(body) { this.done = true; if (body != null) this.chunks.push(body) },
    write(chunk) { this.chunks.push(chunk) },
  }
  res.json = () => JSON.parse(Buffer.concat(res.chunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c)))).toString() || '{}')
  return res
}

const req = (url, method = 'GET', body = null) => ({
  url, method, headers: body ? { 'content-type': 'application/json' } : {},
  async *[Symbol.asyncIterator]() { if (body) yield Buffer.from(JSON.stringify(body)) },
})

/* /api/state */
{
  const res = makeRes()
  await route.handler(req('/funhub/api/state'), res)
  const body = res.json()
  assert.equal(res.statusCode, 200)
  assert.ok(body.ok && body.state && Array.isArray(body.state.layout))
  console.log('✓ GET /api/state:', body.state.layout.length, '张首页卡片')
}

/* /api/op 写操作 */
{
  const res = makeRes()
  await route.handler(req('/funhub/api/op', 'POST', { op: 'fav_toggle', itemType: 'track', itemId: 'test-1', meta: { title: '测试' } }), res)
  const body = res.json()
  assert.ok(body.ok && body.result.favorited === true)
  console.log('✓ POST /api/op fav_toggle')
}

/* 静态引导数据里脚本不回传 */
{
  const res = makeRes()
  await route.handler(req('/funhub/api/state'), res)
  const body = res.json()
  for (const s of body.state.lxSources) assert.ok(!('script' in s) || s.script === undefined)
  console.log('✓ 源脚本不出现在引导数据')
}

console.log('\n全部通过')
rmSync(home, { recursive: true, force: true })
