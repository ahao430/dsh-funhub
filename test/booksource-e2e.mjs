// 书源大包导入 E2E：临时 DSH_HOME，真实 HTTP handler。
// 验证：>2MB 书源 JSON 能导入成功（专用上限），而通用 /api/op 仍受 2MB 限制（413）。
import './lib/failfast.mjs'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = mkdtempSync(join(tmpdir(), 'funhub-e2e-'))
process.env.DSH_HOME = home

const { apply } = await import('../src/host/index.js')
const registered = []
apply({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
  effect: (fn) => { const d = fn(); return typeof d === 'function' ? d : () => {} },
  webServer: { register(route) { registered.push(route) } },
  get: (name) => (name === 'connection' ? { requestRejection: () => undefined } : undefined),
})
const route = registered.find((r) => r.kind === 'prefix' && r.path === '/funhub')
assert.ok(route, '路由未注册')

const makeRes = () => {
  const res = {
    statusCode: 0, chunks: [],
    setHeader() {}, write(c) { this.chunks.push(c) },
    end(b) { if (b != null) this.chunks.push(b) },
  }
  res.json = () => JSON.parse(Buffer.concat(res.chunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c)))).toString() || '{}')
  return res
}
const req = (url, method = 'GET', payload = null) => {
  const body = payload == null ? null : Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload))
  return {
    url, method, headers: body ? { 'content-type': 'application/json' } : {},
    async *[Symbol.asyncIterator]() { if (body) yield body },
  }
}

try {
  /* 1) 3MB 书源包（800 源 × ~4KB 填充）导入成功 */
  const pad = 'x'.repeat(4000)
  const sources = Array.from({ length: 800 }, (_, i) => ({
    bookSourceUrl: `https://e2e-${i}.example`,
    bookSourceName: `E2E源${i}`,
    bookSourceGroup: 'E2E',
    comment: pad,
  }))
  const text = JSON.stringify(sources)
  assert.ok(text.length > 3_000_000, `测试包应超 3MB，实际 ${(text.length / 1e6).toFixed(1)}MB`)
  const res = makeRes()
  await route.handler(req('/funhub/api/booksource/import', 'POST', { text }), res)
  const body = res.json()
  assert.equal(res.statusCode, 200, `导入应成功：${JSON.stringify(body).slice(0, 200)}`)
  assert.equal(body.added, 800)
  assert.equal(body.skipped, 0)
  console.log(`✓ 3MB 书源包导入成功（新增 ${body.added}）`)

  /* 2) 幂等：同一包再导一遍全部跳过 */
  const res2 = makeRes()
  await route.handler(req('/funhub/api/booksource/import', 'POST', { text }), res2)
  const body2 = res2.json()
  assert.equal(res2.statusCode, 200)
  assert.equal(body2.added, 0)
  assert.equal(body2.skipped, 800)
  console.log('✓ 重复导入幂等（全部跳过）')

  /* 3) 通用 /api/op 仍受 2MB 限制 → 413 */
  const res3 = makeRes()
  await route.handler(req('/funhub/api/op', 'POST', { op: 'fav_toggle', junk: 'y'.repeat(2_100_000) }), res3)
  assert.equal(res3.statusCode, 413, `通用 op 应 413，实际 ${res3.statusCode}`)
  console.log('✓ 通用 /api/op 大小上限未松动（413）')

  console.log('书源大包导入 E2E 全部通过')
} finally {
  rmSync(home, { recursive: true, force: true })
}
