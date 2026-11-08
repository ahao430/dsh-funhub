// 书源检测清理任务 E2E（临时 DSH_HOME，离线可跑）：
// 1) 域名不可达源 → 立即删除；2) JS 规则源（引擎限制）→ 保留（有发现能力）或删除（全废）；
// 3) 真实响应的活源 → 保留；4) 近期已验证（probedAt 新鲜）的源 → 跳过且不发网络请求。
import './lib/failfast.mjs'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = mkdtempSync(join(tmpdir(), 'funhub-clean-'))
process.env.DSH_HOME = home

/* 活源 stub：93.184.216.34 的搜索接口返回合法 JSON 书目（其余请求走真网） */
const realFetch = globalThis.fetch
globalThis.fetch = async (input, init = {}) => {
  const u = String(input instanceof URL ? input.href : input)
  if (u.includes('93.184.216.34/search')) {
    return new Response(JSON.stringify({ list: [{ name: '活着', url: 'https://93.184.216.34/book/1' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  return realFetch(input, init)
}

const { apply } = await import('../src/host/index.js')
const registered = []
apply({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
  effect: (fn) => { const d = fn(); return typeof d === 'function' ? d : () => {} },
  webServer: { register(route) { registered.push(route) } },
  get: (name) => (name === 'connection' ? { requestRejection: () => undefined } : undefined),
})
const route = registered.find((r) => r.kind === 'prefix' && r.path === '/funhub')
assert.ok(route)

const makeRes = () => {
  const res = { statusCode: 0, chunks: [], setHeader() {}, write(c) { this.chunks.push(c) }, end(b) { if (b != null) this.chunks.push(b) } }
  res.json = () => JSON.parse(Buffer.concat(res.chunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c)))).toString() || '{}')
  return res
}
const post = async (path) => { const r = makeRes(); await route.handler({ url: `/funhub/api/${path}`, method: 'POST', headers: {}, async *[Symbol.asyncIterator]() {} }, r); return r }
const get = async (path) => { const r = makeRes(); await route.handler({ url: `/funhub/api/${path}`, method: 'GET', headers: {}, async *[Symbol.asyncIterator]() {} }, r); return r.json() }

const deadSrc = (i) => ({ bookSourceUrl: `https://dead-${i}.invalid/`, bookSourceName: `死源${i}`, searchUrl: `https://dead-${i}.invalid/search?q={{key}}`, ruleSearch: { bookList: 'class.books' } })
const jsSrc = (i) => ({ bookSourceUrl: `https://js-${i}.example/`, bookSourceName: `JS源${i}`, searchUrl: '<js>java.get("x")</js>https://js.example/s?q={{key}}', ruleSearch: { bookList: 'class.books' } })
// JS 搜索但发现可用（exploreUrl + ruleExplore.bookList 齐备）→ 应保留
const jsExpSrc = (i) => ({ bookSourceUrl: `https://jse-${i}.example/`, bookSourceName: `JS发现源${i}`, searchUrl: '<js>java.get("x")</js>https://js.example/s?q={{key}}', exploreUrl: `https://jse-${i}.example/all`, ruleExplore: { bookList: 'class.books', name: 'class.title' } })
// 真实响应的活源（JSON 接口搜索有结果）→ 应保留
const liveSrc = { bookSourceUrl: 'https://93.184.216.34/', bookSourceName: '活源', searchUrl: 'https://93.184.216.34/search?q={{key}}', ruleSearch: { bookList: '$.list', name: '$.name', bookUrl: '$.url' } }

const waitDone = async (timeoutMs = 60_000) => {
  const t0 = Date.now()
  for (;;) {
    const { progress } = await get('booksource/clean-progress')
    if (!progress.running) return { progress, ms: Date.now() - t0 }
    if (Date.now() - t0 > timeoutMs) throw new Error('清理任务超时未结束')
    await new Promise((r) => setTimeout(r, 300))
  }
}

try {
  /* 第一轮：4 死源 + 2 纯JS源（全废→清） + 2 JS发现源（发现可用→留） + 1 真实响应活源（→留） */
  {
    const text = JSON.stringify([deadSrc(1), deadSrc(2), deadSrc(3), deadSrc(4), jsSrc(1), jsSrc(2), jsExpSrc(1), jsExpSrc(2), liveSrc])
    const r = makeRes()
    await route.handler({ url: '/funhub/api/booksource/import', method: 'POST', headers: { 'content-type': 'application/json' }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ text })) } }, r)
    assert.equal(r.statusCode, 200, '导入应成功')
  }
  const start = await post('booksource/clean-dead')
  assert.equal(start.statusCode, 200, `启动失败：${start.statusCode}`)
  const { progress, ms } = await waitDone()
  console.log(`  （第一轮 ${ms}ms：删 ${progress.removed} 留 ${progress.kept}）`)
  assert.equal(progress.removed, 6, '4 死源 + 2 无用 JS 源应删')
  assert.equal(progress.kept, 3, '2 个 JS 发现源 + 1 个活源应保留')
  const st1 = await get('state')
  assert.equal(st1.state.bookSources.length, 3, '死源已即时删除')
  assert.ok(st1.state.bookSources.some((s) => s.name === '活源'), '活源必须保留')
  assert.equal(st1.state.bookSources.filter((s) => s.probedAt > 0).length, 3, '保留的源都应标记已验证')

  /* 第二轮：再混入 1 个死源 → 只有新源被处理，已保留的仍在 */
  {
    const text = JSON.stringify([deadSrc(9)])
    const r = makeRes()
    await route.handler({ url: '/funhub/api/booksource/import', method: 'POST', headers: { 'content-type': 'application/json' }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ text })) } }, r)
    assert.equal(r.statusCode, 200)
  }
  const start2 = await post('booksource/clean-dead')
  assert.equal(start2.statusCode, 200)
  const { progress: p2 } = await waitDone()
  assert.equal(p2.removed, 1, '新增死源应删')
  assert.equal((await get('state')).state.bookSources.length, 3, '既有 2 个 JS 发现源 + 1 个活源仍在')
  // 中断续跑：第二轮只有新死源被探测，既有 3 个因 probedAt 新鲜被跳过
  assert.equal(p2.skipped, 3, '已验证过的源跳过不重测')

  /* 第三轮（并发/批量不变量）：60 个源死活混排 → 跨多个落盘批次并发删除，
     验证「边测边删」不乱索引：每个源恰好处理一次，done==total，删/留精确 */
  {
    const mixed = []
    for (let i = 0; i < 30; i++) mixed.push(deadSrc(100 + i))
    for (let i = 0; i < 15; i++) mixed.push(jsSrc(200 + i))
    for (let i = 0; i < 15; i++) mixed.push(jsExpSrc(300 + i))
    const r = makeRes()
    await route.handler({ url: '/funhub/api/booksource/import', method: 'POST', headers: { 'content-type': 'application/json' }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ text: JSON.stringify(mixed) })) } }, r)
    assert.equal(r.statusCode, 200)
    const start3 = await post('booksource/clean-dead')
    assert.equal(start3.statusCode, 200)
    const { progress: p3, ms: ms3 } = await waitDone()
    console.log(`  （第三轮并发 63 源 ${ms3}ms：done=${p3.done} 删=${p3.removed} 留=${p3.kept}）`)
    assert.equal(p3.done, p3.total, '完成数应等于总数（无跳号/无重号）')
    assert.equal(p3.total, 63, '总数应为本轮 60 + 既有 3')
    assert.equal(p3.removed, 45, '死源 30 + 全废 JS 源 15 精确删除')
    assert.equal(p3.kept, 15, '新 JS 发现源 15')
    assert.equal(p3.skipped, 3, '既有 3 个 probedAt 新鲜被跳过')
    const after = await get('state')
    assert.equal(after.state.bookSources.length, 18, '最终存量精确')
    assert.equal(after.state.bookSources.filter((s) => s.name.startsWith('死源')).length, 0, '死源清零')
    assert.equal(after.state.bookSources.filter((s) => s.name.startsWith('JS源')).length, 0, '全废 JS 源清零')
    assert.equal(after.state.bookSources.filter((s) => s.name.startsWith('JS发现源')).length, 17, 'JS 发现源 15 + 既有 2 一个不少')
    assert.equal(after.state.bookSources.filter((s) => s.name === '活源').length, 1, '活源保留')
  }

  /* 第四轮：搜索规则缺失的分两类——
     a) 连发现规则也没有 → 清掉（无搜索/发现规则）；
     b) 搜索缺失但发现可用（exploreUrl + ruleExplore.bookList）→ 保留 */
  {
    const useless = { bookSourceUrl: 'https://useless.example/', bookSourceName: '无用源' } // 无 searchUrl 无 explore
    const exploreOnly = {
      bookSourceUrl: 'https://explore-only.example/', bookSourceName: '仅发现源',
      exploreUrl: 'https://explore-only.example/all', // 发现可用
      ruleExplore: { bookList: 'class.books', name: 'class.title' },
    }
    const r = makeRes()
    await route.handler({ url: '/funhub/api/booksource/import', method: 'POST', headers: { 'content-type': 'application/json' }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ text: JSON.stringify([useless, exploreOnly]) })) } }, r)
    assert.equal(r.statusCode, 200)
    const before = (await get('state')).state.bookSources.length
    const start4 = await post('booksource/clean-dead')
    assert.equal(start4.statusCode, 200)
    const { progress: p4 } = await waitDone()
    assert.equal(p4.removed, 1, '无搜索/发现的源应被清掉')
    const after = (await get('state')).state.bookSources
    assert.equal(after.length, before - 1, '只少一个')
    assert.ok(after.some((s) => s.name === '仅发现源'), '发现可用的源应保留')
    assert.ok(!after.some((s) => s.name === '无用源'), '无用源应消失')
  }

  /* 发现能力判定：缺 ruleExplore.bookList 的源不出现在发现下拉（exploreCount=0） */
  {
    const st = await get('state')
    const exploreOnly = st.state.bookSources.find((s) => s.name === '仅发现源')
    assert.ok(exploreOnly && exploreOnly.exploreCount > 0, '有 bookList 的源 exploreCount>0')
    const { exploreCategories } = await import('../src/host/legado.js')
    assert.equal(exploreCategories({ exploreUrl: 'https://x.example/a', ruleSearch: {} }).length, 0, '缺 bookList → 无发现能力')
    assert.ok(exploreCategories({ exploreUrl: 'https://x.example/a', ruleExplore: { bookList: 'class.b' } }).length > 0, '有 bookList → 有发现能力')
  }

  console.log('书源检测清理 E2E 全部通过')
} finally {
  rmSync(home, { recursive: true, force: true })
}
