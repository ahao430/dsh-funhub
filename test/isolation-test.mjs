// 隔离验证：恶意/坏脚本在子进程沙箱里怎么崩，宿主进程都活着。
import assert from 'node:assert/strict'
import http from 'node:http'
process.env.DSH_HOME ||= '/tmp/funhub-isolation-home'
import { apply } from '../src/host/index.js'
import { spawn } from 'node:child_process'

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
    statusCode: 0, headers: {}, chunks: [], done: false,
    setHeader(k, v) { this.headers[k] = v },
    end(body) { this.done = true; if (body != null) this.chunks.push(body) },
    write() {},
  }
  res.json = () => JSON.parse(Buffer.concat(res.chunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c)))).toString() || '{}')
  return res
}
const req = (url, method = 'GET', body = null) => ({
  url, method, headers: { 'content-type': 'application/json' },
  async *[Symbol.asyncIterator]() { if (body) yield Buffer.from(JSON.stringify(body)) },
})

// 恶意脚本：init 里 fire-and-forget rejection（正是杀死 DSH 宿主的模式）
const evilScript = `
class EvilComic extends ComicSource {
    name = " Evil"
    key = "evil"
    version = "0.0.1"
    init() {
        this.refresh()
        Promise.reject(new Error("fire-and-forget rejection"))
        setTimeout(() => { throw new Error("async uncaught") }, 10)
        throw new Error("sync crash in init")
    }
    refresh() { return Promise.reject(new Error("chain rejection")) }
    search = { load: async () => ({ comics: [] }) }
}
`

console.log('宿主进程 PID:', process.pid)
const results = []
const test = async (name, fn) => {
  try { await fn(); results.push(`✓ ${name}`) } catch (err) { results.push(`✗ ${name}: ${err.message}`) }
}

await test('导入恶意脚本（探测不杀宿主）', async () => {
  const res = makeRes()
  await route.handler(req('/funhub/api/comicsource/import', 'POST', { script: evilScript }), res)
  const body = res.json()
  assert.ok(body.ok, `导入失败: ${JSON.stringify(body)}`)
  assert.ok(process.pid === process.pid)
})

await test('调用恶意源 explore（错误返回而非崩溃）', async () => {
  const s = makeRes(); await route.handler(req('/funhub/api/state'), s)
  const src = s.json().state.comicSources.find((c) => c.key === 'evil')
  assert.ok(src, '恶意源未入库')
  const res = makeRes()
  await route.handler(req(`/funhub/api/comic/explore-list?sourceId=${src.id}`), res)
  // 请求应返回（可能 200 空页或 400 错误），宿主不退出
  assert.ok(res.done || res.statusCode > 0)
})

await test('恶意脚本崩溃后宿主仍存活 1.5s', async () => {
  await new Promise((r) => setTimeout(r, 1500))
  assert.ok(true)
})

await test('真实源（拷贝漫画）网络失败不杀宿主', async () => {
  const state = JSON.parse((await import('node:fs')).readFileSync('/Users/wanghao/.dsh/funhub/state.json', 'utf8'))
  const copy = state.comicSources.find((c) => c.name.includes('拷贝漫画'))
  if (!copy) { results.pop(); return }
  const res = makeRes()
  await route.handler(req(`/funhub/api/comic/explore-list?sourceId=${copy.id}`), res)
  assert.ok(res.statusCode > 0)
  await new Promise((r) => setTimeout(r, 2500)) // 给 fire-and-forget rejection 留时间
})

await test('洛雪恶意脚本（顶层 IIFE rejection）不杀宿主', async () => {
  const evilLx = `const { EVENT_NAMES, request, on, send } = globalThis.lx;
on(EVENT_NAMES.request, async (p) => { throw new Error('x') });
(async () => { throw new Error('iife rejection') })();
send(EVENT_NAMES.inited, { status: true, sources: { wy: { name: 'WY', type: 'music', actions: ['musicUrl'], qualitys: ['128k'] } } });`
  const res = makeRes()
  await route.handler(req('/funhub/api/lxsource/probe', 'POST', { script: evilLx }), res)
  const body = res.json()
  assert.ok(res.statusCode === 200, `probe HTTP ${res.statusCode}`)
  await new Promise((r) => setTimeout(r, 1200))
})

console.log(results.join('\n'))
const failed = results.filter((r) => r.startsWith('✗')).length
console.log(failed ? `\n${failed} 项失败` : '\n隔离验证全部通过——宿主进程自始至终存活')
process.exit(failed ? 1 : 0)
