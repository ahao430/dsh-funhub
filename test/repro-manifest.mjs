// 复现漫画源清单导入全链路（真实网络），定位「没反应」。
import './lib/failfast.mjs'
import { apply } from '../src/host/index.js'

const routes = []
const ctx = {
  logger: { info: () => {}, warn: (m) => console.log('[warn]', m), error: (m) => console.log('[err]', m) },
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
  url, method, headers: { 'content-type': 'application/json', ...(body ? { 'content-length': String(Buffer.byteLength(JSON.stringify(body))) } : {}) },
  async *[Symbol.asyncIterator]() { if (body) yield Buffer.from(JSON.stringify(body)) },
})

const URL_ARG = process.argv[2] || 'https://cdn.jsdelivr.net/gh/venera-app/venera-configs@main/index.json'
const t0 = Date.now()
console.log('导入清单:', URL_ARG)
const res = makeRes()
await route.handler(req('/funhub/api/comicsource/import', 'POST', { url: URL_ARG }), res)
const body = res.json()
console.log(`耗时 ${(Date.now() - t0) / 1000}s · HTTP ${res.statusCode}`)
console.log(JSON.stringify(body, null, 1).slice(0, 1500))

const s = await (await import('../src/host/store.js')).Store
const st = new s()
const state = await st.read()
console.log('\n已导入漫画源:', state.comicSources.length)
console.log('样例:', state.comicSources.slice(0, 6).map((c) => `${c.name}${c.error ? '(异常:' + c.error.slice(0, 30) + ')' : ''}`).join(' | '))
