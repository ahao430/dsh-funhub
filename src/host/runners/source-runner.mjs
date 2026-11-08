// 第三方源脚本子进程沙箱（fork 入口）。
// 隔离边界：脚本任何同步/异步异常最多杀掉本子进程，宿主进程绝对安全——
// DSH 宿主对漏网 rejection 有终身 fatal handler（进程内无法拦截），脚本必须进程隔离。
// 每个子进程只跑一个脚本实例；崩溃后由父侧按需重启。
import { createContext, runInContext } from 'node:vm'
import { ProxyAgent } from 'undici'
import { createHash, createHmac, randomUUID } from 'node:crypto'
import { parse } from 'node-html-parser'

const SYNC_TIMEOUT_MS = 5_000
const CALL_TIMEOUT_MS = 30_000
const INIT_TIMEOUT_MS = 10_000
const MAX_LIVE_TIMERS = 100
const MAX_RESP_SIZE = 8_000_000

const state = {
  mode: null,        // 'lx' | 'venera'
  instance: null,
  ctx: null,
  data: {},
  settings: {},
  logs: [],
  loadError: null,
  initedInfo: null,  // lx: inited 事件数据
  handlers: new Map(),
  explorePages: [],
  readySent: false,
}

function log(level, line) {
  state.logs.push({ at: Date.now(), level, line: String(line).slice(0, 400) })
  if (state.logs.length > 200) state.logs.shift()
}

function send(msg) {
  if (process.connected) process.send(msg)
}

/* 子进程自身兜底：脚本怎么崩都不退出进程（exit 由父侧 dispose 决定） */
process.on('unhandledRejection', (reason) => log('warn', `rejection 兜底: ${reason?.message || reason}`))
process.on('uncaughtException', (err) => log('error', `exception 兜底: ${err?.message || err}`))

/* ---------------- 安全抓取（与宿主 fetcher 同语义） ---------------- */
import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'

const PRIVATE4 = [/^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./]

function isPrivateIp(ip) {
  if (!ip) return true
  if (ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) return true
  if (ip.includes(':')) return false
  return PRIVATE4.some((re) => re.test(ip))
}

function assertSafeUrl(raw) {
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new Error('无效的 URL')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('仅支持 http/https')
  if (url.username || url.password) throw new Error('URL 不允许携带凭据')
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80
  if (![80, 443, 8080, 8443].includes(port)) throw new Error('不允许的端口')
  return url
}

async function assertPublicHost(hostname) {
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error('不允许访问内网地址')
    return
  }
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('不允许访问内网地址')
  }
  try {
    const records = await lookup(hostname, { all: true })
    if (!records.length || records.some((r) => isPrivateIp(r.address))) throw new Error('不允许访问内网地址')
  } catch (err) {
    if (err.message?.includes('内网')) throw err
    throw new Error('域名解析失败')
  }
}

function parseScriptMeta(source) {
  const meta = {}
  const head = String(source || '').slice(0, 4000)
  for (const [key, re] of Object.entries({ name: /@name\s+(.+)/, version: /@version\s+(.+)/, author: /@author\s+(.+)/, description: /@description\s+(.+)/ })) {
    const m = re.exec(head)
    if (m) meta[key] = m[1].trim().slice(0, 120)
  }
  return meta
}

function toBuf(input) {
  if (input == null) return Buffer.alloc(0)
  if (Buffer.isBuffer(input)) return input
  if (input instanceof Uint8Array) return Buffer.from(input)
  if (typeof input === 'string') return Buffer.from(input, 'utf-8')
  return Buffer.from(String(input), 'utf-8')
}

function ab2str(buf) {
  const view = buf instanceof Uint8Array ? buf : new Uint8Array(buf ?? [])
  return Buffer.from(view).toString('utf-8')
}

function str2ab(str) {
  const buf = Buffer.from(String(str ?? ''), 'utf-8')
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

/* ---------------- 请求实现（直接用宿主 fetch，本进程自带防护） ---------------- */

/* 出站代理（init 消息下发；脚本请求统一走 undici ProxyAgent dispatcher） */
let proxyDispatcher = null
function setRunnerProxy(proxyUrl) {
  if (proxyDispatcher) { try { proxyDispatcher.close() } catch { /* ignore */ } }
  proxyDispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : null
}

let proxyDownUntil = 0
async function fetchWithProxy(url, init) {
  if (!proxyDispatcher || Date.now() < proxyDownUntil) return fetch(url, init)
  try {
    return await fetch(url, { ...init, dispatcher: proxyDispatcher })
  } catch (err) {
    const code = String(err?.cause?.code || err?.message || '')
    if (!/ECONNREFUSED|ENOTFOUND|ECONNRESET|ETIMEDOUT|UND_ERR|closed/i.test(code)) throw err
    proxyDownUntil = Date.now() + 60_000
    return fetch(url, init) // 代理进程不在 → 直连重试
  }
}

async function safeFetchLx(raw, opts = {}, maxSize = MAX_RESP_SIZE) {
  const url = assertSafeUrl(raw)
  await assertPublicHost(url.hostname)
  const timeout = Math.min(Number(opts.timeout) || 15_000, 30_000)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  let res
  try {
    const headers = { 'user-agent': 'lx-music-desktop', accept: '*/*', ...(opts.headers || {}) }
    delete headers.host
    delete headers['content-length']
    let body = opts.body
    if (body != null && typeof body !== 'string') {
      body = JSON.stringify(body)
      if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) headers['content-type'] = 'application/json'
    }
    res = await fetchWithProxy(url, { method: (opts.method || 'GET').toUpperCase(), signal: controller.signal, redirect: 'follow', headers, body: body ?? undefined })
  } catch (err) {
    clearTimeout(timer)
    throw new Error(err.name === 'AbortError' ? '请求超时' : `网络请求失败：${err.message}`)
  }
  clearTimeout(timer)
  const reader = res.body.getReader()
  const chunks = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > maxSize) {
      await reader.cancel().catch(() => {})
      throw new Error('响应过大')
    }
    chunks.push(value)
  }
  const text = Buffer.concat(chunks).toString('utf-8')
  let parsed = text
  const trimmed = text.trim()
  if (/^[{[]/.test(trimmed)) {
    try { parsed = JSON.parse(trimmed) } catch { /* 保留原文 */ }
  }
  return { statusCode: res.status, headers: Object.fromEntries(res.headers.entries()), body: parsed }
}

/* ---------------- 沙箱构建（venera 全套垫片 + LX 事件协议） ---------------- */

function buildVeneraSandbox() {
  const timers = new Set()
  const cookies = new Map()
  const capTimer = (fn) => (...args) => {
    if (timers.size >= MAX_LIVE_TIMERS) throw new Error('定时器数量超限')
    const id = fn(...args)
    timers.add(id)
    return id
  }

  const applyCookies = (url, headers) => {
    try {
      const host = new URL(url).hostname
      for (const [domain, cookie] of cookies) {
        if (host === domain || host.endsWith(`.${domain}`)) headers.cookie = headers.cookie ? `${headers.cookie}; ${cookie}` : cookie
      }
    } catch { /* ignore */ }
  }

  const httpText = async (method, url, headers = {}, data = null) => {
    const finalHeaders = { ...(headers || {}) }
    delete finalHeaders.host
    delete finalHeaders['content-length']
    applyCookies(url, finalHeaders)
    const body = data == null ? undefined
      : (data instanceof ArrayBuffer || data instanceof Uint8Array ? ab2str(data) : (typeof data === 'string' ? data : JSON.stringify(data)))
    const res = await safeFetchLx(url, { method, headers: finalHeaders, body })
    try {
      const setCookie = res.headers?.['set-cookie']
      if (setCookie) {
        const host = new URL(url).hostname
        const parts = String(setCookie).split(/,(?=[^;]+?=)/).map((c) => c.split(';')[0].trim()).filter(Boolean)
        const existing = cookies.get(host)
        cookies.set(host, existing ? `${existing}; ${parts.join('; ')}` : parts.join('; '))
      }
    } catch { /* ignore */ }
    return { status: res.statusCode, headers: res.headers, body: typeof res.body === 'string' ? res.body : safeStringify(res.body) }
  }

  class HtmlElementWrap {
    constructor(node) { this._node = node }
    get text() { return this._node.text || '' }
    get innerHTML() { return this._node.innerHTML || '' }
    get outerHTML() { return this._node.outerHTML || '' }
    get attributes() { return { ...(this._node.attributes || {}) } }
    get children() { return (this._node.childNodes || []).filter((c) => c.nodeType === 1).map((c) => new HtmlElementWrap(c)) }
    get nodes() { return (this._node.childNodes || []).map((c) => new HtmlNodeWrap(c)) }
    get className() { return this._node.getAttribute('class') || '' }
    get id() { return this._node.getAttribute('id') || '' }
    querySelector(sel) { const hit = this._node.querySelector(sel); return hit ? new HtmlElementWrap(hit) : null }
    querySelectorAll(sel) { return [...this._node.querySelectorAll(sel)].map((n) => new HtmlElementWrap(n)) }
  }
  class HtmlNodeWrap {
    constructor(node) { this._node = node; this.type = node.nodeType === 3 ? 'text' : 'element'; this.text = node.rawText ?? '' }
    asElement() { return this._node.nodeType === 1 ? new HtmlElementWrap(this._node) : null }
  }
  class HtmlDocumentWrap {
    constructor(html) { this._root = parse(String(html ?? '')) }
    querySelector(sel) { const hit = this._root.querySelector(sel); return hit ? new HtmlElementWrap(hit) : null }
    querySelectorAll(sel) { return [...this._root.querySelectorAll(sel)].map((n) => new HtmlElementWrap(n)) }
    getElementById(id) { return this.querySelector(`#${id}`) }
    dispose() { this._root = null }
  }

  const ComicSource = class {
    constructor() { if (new.target === ComicSource) throw new Error('ComicSource 不能直接实例化') }
    loadData(dataKey) { return state.data[dataKey] }
    saveData(dataKey, data) { state.data[dataKey] = data; send({ type: 'data', data: state.data }) }
    deleteData(dataKey) { delete state.data[dataKey]; send({ type: 'data', data: state.data }) }
    loadSetting(key) {
      // venera 语义：未设置时回退脚本 settings 声明的 default
      return state.settings[key] ?? this.settings?.[key]?.default
    }
    get isLogged() { return false }
    translate(key) { return key }
    init() {}
  }

  const Convert = {
    encodeUtf8: (str) => str2ab(str),
    decodeUtf8: (value) => ab2str(value),
    encodeBase64: (str) => Buffer.from(String(str), 'utf-8').toString('base64'),
    decodeBase64: (value) => Buffer.from(String(value), 'base64').toString('utf-8'),
    md5: (value) => createHash('md5').update(String(value)).digest('hex'),
    sha1: (value) => createHash('sha1').update(String(value)).digest('hex'),
    sha256: (value) => createHash('sha256').update(String(value)).digest('hex'),
    isBase64: (value) => /^[A-Za-z0-9+/]+={0,2}$/.test(String(value)),
    isBase64Url: (value) => /^[A-Za-z0-9_-]+={0,2}$/.test(String(value)),
    hmac: (key, value, hash) => {
      const digest = createHmac(String(hash || 'sha256').toLowerCase(), toBuf(key)).update(toBuf(value)).digest()
      return digest.buffer.slice(digest.byteOffset, digest.byteOffset + digest.byteLength)
    },
    hmacString: (key, value, hash) => createHmac(String(hash || 'sha256').toLowerCase(), toBuf(key)).update(toBuf(value)).digest('hex'),
  }

  const Network = {
    sendRequest: (method, url, headers, data) => httpText(method, url, headers, data),
    fetchBytes: async (method, url, headers, data) => {
      const res = await httpText(method, url, headers, data)
      return { ...res, body: str2ab(res.body) }
    },
    get: (url, headers) => httpText('GET', url, headers),
    post: (url, data, headers) => httpText('POST', url, headers, data),
    put: (url, data, headers) => httpText('PUT', url, headers, data),
    delete: (url, headers) => httpText('DELETE', url, headers),
    setCookies: (url, list) => {
      try {
        const host = new URL(url).hostname
        const parts = (list || []).map((c) => (typeof c === 'string' ? c.split(';')[0] : `${c.name}=${c.value}`))
        const existing = cookies.get(host)
        cookies.set(host, existing ? `${existing}; ${parts.join('; ')}` : parts.join('; '))
      } catch { /* ignore */ }
    },
    deleteCookies: (url) => {
      try { cookies.delete(new URL(url).hostname) } catch { /* ignore */ }
    },
  }

  const fetchLike = async (url, options = {}) => {
    const method = (options.method || 'GET').toUpperCase()
    const headers = { ...(options.headers || {}) }
    let body = options.body
    if (body instanceof ArrayBuffer || body instanceof Uint8Array) body = ab2str(body)
    const res = await httpText(method, url, headers, body)
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      statusText: '',
      headers: res.headers,
      arrayBuffer: async () => str2ab(res.body),
      text: async () => res.body,
      json: async () => JSON.parse(res.body),
    }
  }

  const sandbox = {
    console: { log: (m) => log('log', fmtArgs(m)), info: (m) => log('log', fmtArgs(m)), warn: (m) => log('warn', fmtArgs(m)), error: (m) => log('error', fmtArgs(m)), debug: (m) => log('log', fmtArgs(m)) },
    setTimeout: capTimer(setTimeout),
    clearTimeout: (id) => { timers.delete(id); clearTimeout(id) },
    setInterval: capTimer(setInterval),
    clearInterval: (id) => { timers.delete(id); clearInterval(id) },
    TextEncoder, TextDecoder,
    atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
    btoa: (s) => Buffer.from(String(s), 'binary').toString('base64'),
    ComicSource,
    Network,
    Convert,
    HtmlDocument: HtmlDocumentWrap,
    Comment: class { constructor(fields) { Object.assign(this, fields) } },
    createUuid: () => randomUUID(),
    randomInt: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
    randomDouble: (min, max) => Math.random() * (max - min) + min,
    Cookie: ({ name, value, domain }) => ({ name, value, domain }),
    Comic: function Comic({ id, title, subtitle, subTitle, cover, tags, description, maxPage, language, favoriteId, stars } = {}) {
      this.id = id; this.title = title; this.subtitle = subtitle; this.subTitle = subTitle
      this.cover = cover; this.tags = tags; this.description = description
      this.maxPage = maxPage; this.language = language; this.favoriteId = favoriteId; this.stars = stars
    },
    ComicDetails: function ComicDetails(fields = {}) { Object.assign(this, fields) },
    ImageLoadingConfig: function ImageLoadingConfig(fields = {}) { Object.assign(this, fields) },
    setClipboard: async () => {},
    getClipboard: async () => '',
    compute: async () => { throw new Error('compute 暂不支持') },
    fetch: fetchLike,
    appVersion: '1.6.0',
  }
  sandbox.APP = { version: '1.6.0', locale: 'zh_CN', platform: 'macos' }
  sandbox.globalThis = sandbox
  return sandbox
}

function buildLxSandbox() {
  const timers = new Set()
  const capTimer = (fn) => (...args) => {
    if (timers.size >= MAX_LIVE_TIMERS) throw new Error('定时器数量超限')
    const id = fn(...args)
    timers.add(id)
    return id
  }

  const EVENT_NAMES = { request: 'request', inited: 'inited', updateAlert: 'updateAlert' }
  const lx = {
    EVENT_NAMES,
    version: '2.0.0',
    currentScriptInfo: parseScriptMeta(state.script),
    env: { platform: 'linux_x64' },
    utils: {
      buffer: {
        from: (input) => {
          const buf = toBuf(input)
          return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
        },
        bufToString: (buf, encoding) => Buffer.from(toBuf(buf)).toString(encoding || 'utf-8'),
      },
    },
    request: (url, options, callback) => {
      if (typeof callback !== 'function') return
      safeFetchLx(url, options || {})
        .then((result) => callback(null, result))
        .catch((err) => callback(err instanceof Error ? err : new Error(String(err))))
    },
    on: (name, fn) => {
      if (typeof fn === 'function') state.handlers.set(String(name), fn)
    },
    send: (name, data) => {
      if (name === EVENT_NAMES.inited) state.initedInfo = data
      // updateAlert 等仅记录，不执行任何更新动作
    },
  }

  const sandbox = {
    console: { log: (m) => log('log', fmtArgs(m)), info: (m) => log('log', fmtArgs(m)), warn: (m) => log('warn', fmtArgs(m)), error: (m) => log('error', fmtArgs(m)), debug: (m) => log('log', fmtArgs(m)) },
    setTimeout: capTimer(setTimeout),
    clearTimeout: (id) => { timers.delete(id); clearTimeout(id) },
    setInterval: capTimer(setInterval),
    clearInterval: (id) => { timers.delete(id); clearInterval(id) },
    TextEncoder, TextDecoder,
    atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
    btoa: (s) => Buffer.from(String(s), 'binary').toString('base64'),
    globalThis: null,
    lx,
  }
  sandbox.globalThis = sandbox
  return sandbox
}

function fmtArgs(...args) {
  return args.map((a) => (typeof a === 'string' ? a : safeStringify(a))).join(' ').slice(0, 400)
}

function safeStringify(value) {
  try { return JSON.stringify(value) } catch { return String(value) }
}

/* ---------------- 启动脚本 ---------------- */

function startScript(mode, script, data, settings) {
  state.mode = mode
  state.script = String(script || '')
  state.data = { ...(data || {}) }
  state.settings = { ...(settings || {}) }
  state.loadError = null
  state.handlers.clear()

  const sandbox = mode === 'lx' ? buildLxSandbox() : buildVeneraSandbox()
  state.ctx = createContext(sandbox)

  try {
    if (mode === 'lx') {
      runInContext(state.script, state.ctx, { timeout: SYNC_TIMEOUT_MS, filename: 'lx-source.js' })
    } else {
      const classMatch = /class\s+(\w+)\s+extends\s+ComicSource/.exec(state.script)
      if (!classMatch) throw new Error('未找到 ComicSource 子类定义')
      runInContext(`${state.script}\n;globalThis.__fhSource = new ${classMatch[1]}();`, state.ctx, { timeout: SYNC_TIMEOUT_MS, filename: 'venera-source.js' })
      state.instance = sandbox.__fhSource
    }
  } catch (err) {
    state.loadError = err.message || String(err)
    log('error', `脚本加载失败：${state.loadError}`)
  }

  // init 延迟执行：失败只记录，不阻断后续 call（子进程内 rejection 已有兜底 handler）
  if (mode === 'lx') {
    const initedWaiter = Promise.race([
      new Promise((resolve) => {
        const timer = setInterval(() => {
          if (state.initedInfo) { clearInterval(timer); resolve() }
        }, 50)
        setTimeout(() => { clearInterval(timer); resolve() }, INIT_TIMEOUT_MS)
      }),
    ])
    state.initPromise = initedWaiter.then(() => {
      const sources = state.initedInfo?.sources
      const capabilities = {}
      if (sources && typeof sources === 'object') {
        for (const [key, val] of Object.entries(sources)) {
          if (!val || !Array.isArray(val.actions) || !val.actions.includes('musicUrl')) continue
          capabilities[key] = { name: val.name || key, actions: val.actions, qualitys: Array.isArray(val.qualitys) ? val.qualitys : [] }
        }
      }
      return { capabilities, loadError: state.loadError }
    })
  } else {
    const doInit = async () => {
      if (!state.instance || state.loadError) return
      try {
        await Promise.race([
          Promise.resolve(state.instance.init?.()),
          new Promise((_, reject) => setTimeout(() => reject(new Error('init 超时')), INIT_TIMEOUT_MS)),
        ])
      } catch (err) {
        log('warn', `init 失败（不影响后续调用）: ${err?.message || err}`)
      }
      state.explorePages = Array.isArray(state.instance?.explore)
        ? state.instance.explore.slice(0, 20).map((e, i) => ({ index: i, title: String(e?.title || `发现 ${i + 1}`), type: String(e?.type || 'single') }))
        : []
    }
    state.initPromise = doInit().then(() => ({
      name: state.instance?.name || '',
      key: state.instance?.key || '',
      version: state.instance?.version || '',
      hasSearch: Boolean(state.instance?.search?.load),
      hasExplore: state.explorePages.length > 0,
      explorePages: state.explorePages,
      loadError: state.loadError,
    }))
  }
}

/* ---------------- RPC 服务 ---------------- */

const pendingInits = new Set()

process.on('message', async (msg) => {
  if (msg?.type === 'init') {
    try {
      setRunnerProxy(msg.proxy)
      startScript(msg.mode, msg.script, msg.data, msg.settings)
      const info = await state.initPromise
      state.readySent = true
      send({ type: 'ready', info })
    } catch (err) {
      state.readySent = true
      send({ type: 'ready', info: { loadError: err?.message || String(err) } })
    }
    return
  }

  if (msg?.type === 'call') {
    const { seq, fn, args } = msg
    try {
      if (state.initPromise) await state.initPromise.catch(() => {})
      const result = await runCall(fn, args)
      send({ type: 'result', seq, ok: true, data: result })
    } catch (err) {
      send({ type: 'result', seq, ok: false, error: err?.message || String(err) })
    } finally {
      send({ type: 'logs', logs: state.logs.splice(0, state.logs.length) })
    }
    return
  }

  if (msg?.type === 'logs') {
    send({ type: 'logs', logs: state.logs.splice(0, state.logs.length) })
  }
})

async function runCall(fn, args) {
  if (state.disposed) throw new Error('脚本已卸载')
  const payload = args || []

  if (state.mode === 'lx') {
    if (state.loadError) throw new Error(`脚本加载失败：${state.loadError}`)
    if (fn === 'request') {
      const handler = state.handlers.get('request')
      if (typeof handler !== 'function') throw new Error('脚本未注册 request 处理器')
      const [action, source, info] = payload
      return await withTimeout(Promise.resolve(handler({ action, source, info })), CALL_TIMEOUT_MS, '脚本处理超时')
    }
    if (fn === 'capabilities') {
      const sources = state.initedInfo?.sources
      const capabilities = {}
      if (sources && typeof sources === 'object') {
        for (const [key, val] of Object.entries(sources)) {
          if (!val || !Array.isArray(val.actions) || !val.actions.includes('musicUrl')) continue
          capabilities[key] = { name: val.name || key, actions: val.actions, qualitys: Array.isArray(val.qualitys) ? val.qualitys : [] }
        }
      }
      return capabilities
    }
    throw new Error(`未知调用: ${fn}`)
  }

  // venera
  if (state.loadError || !state.instance) throw new Error(`脚本加载失败：${state.loadError || '未知'}`)
  switch (fn) {
    case 'search': {
      const [keyword, page] = payload
      const optionList = state.instance?.search?.optionList || []
      const options = optionList.map((opt) => {
        if (opt?.default != null) return String(opt.default)
        const first = opt?.options?.[0]
        if (typeof first === 'string') return first.split('-')[0]
        if (first && typeof first === 'object') return String(first.value ?? '')
        return ''
      })
      return await withTimeout(Promise.resolve(state.instance.search?.load(keyword, options, page)), CALL_TIMEOUT_MS, '脚本处理超时')
    }
    case 'getComic':
      return await withTimeout(Promise.resolve(state.instance.comic?.getComic?.(payload[0])), CALL_TIMEOUT_MS, '脚本处理超时')
    case 'chapters': {
      // venera 标准协议：章节在 comic.loadInfo(id) 返回的 ComicDetails.chapters
      // （Map<id,title> 或 {分组: Map}）；个别脚本自定义 getChapters 时兼容。
      const inst = state.instance
      let raw = null
      if (typeof inst?.comic?.loadInfo === 'function') {
        const details = await withTimeout(Promise.resolve(inst.comic.loadInfo(payload[0])), CALL_TIMEOUT_MS, '脚本处理超时')
        raw = details?.chapters ?? null
      }
      if (raw == null && typeof inst?.comic?.getChapters === 'function') {
        raw = await withTimeout(Promise.resolve(inst.comic.getChapters(payload[0])), CALL_TIMEOUT_MS, '脚本处理超时')
      }
      const chapters = []
      const isMapLike = (v) => v && typeof v === 'object' && typeof v.has === 'function' && typeof v.forEach === 'function' && typeof v.size === 'number'
      const push = (group, list) => {
        if (isMapLike(list)) list.forEach((title, cid) => chapters.push({ group: String(group), id: String(cid), title: String(title ?? cid) }))
        else if (Array.isArray(list)) for (const ch of list) chapters.push({ group: String(group), id: String(ch.id), title: String(ch.title ?? ch.name ?? ch.id) })
        else if (list && typeof list === 'object') for (const [cid, title] of Object.entries(list)) chapters.push({ group: String(group), id: String(cid), title: String(title ?? cid) })
      }
      if (Array.isArray(raw)) push('', raw)
      else if (raw && typeof raw === 'object') {
        // 区分「分组容器 {组名: Map/对象}」与「扁平 id→title」：看子值是否为对象/Map
        const values = isMapLike(raw) ? [...raw.values()] : Object.values(raw)
        const grouped = values.some((v) => v && (typeof v === 'object'))
        if (grouped) {
          if (isMapLike(raw)) raw.forEach((list, group) => push(group, list))
          else for (const [g, list] of Object.entries(raw)) push(g, list)
        } else {
          push('', raw)
        }
      }
      return chapters
    }
    case 'ep':
      return await withTimeout(Promise.resolve(state.instance.comic?.loadEp?.(payload[0], payload[1])), CALL_TIMEOUT_MS, '脚本处理超时')
    case 'explore': {
      const [index, page, options] = payload
      const entry = state.instance?.explore?.[index]
      if (!entry || typeof entry.load !== 'function') throw new Error('该源未提供此发现页')
      return await withTimeout(Promise.resolve(entry.load(page, options || [])), CALL_TIMEOUT_MS, '脚本处理超时')
    }
    case 'imageConfigs': {
      const [urls] = payload
      return (urls || []).map((u) => {
        try {
          const conf = state.instance?.comic?.onImageLoad?.(u)
          if (conf && typeof conf === 'object') {
            const headers = {}
            for (const [k, v] of Object.entries(conf.headers || {})) {
              if (typeof v === 'string' && v.length < 500 && !/cookie/i.test(k)) headers[k] = v
            }
            return { url: conf.url || u, headers }
          }
        } catch { /* ignore */ }
        return { url: u, headers: {} }
      })
    }
    case 'imageConfig': {
      const [url] = payload
      try {
        const conf = state.instance?.comic?.onImageLoad?.(url)
        if (conf && typeof conf === 'object') {
          const headers = {}
          for (const [k, v] of Object.entries(conf.headers || {})) {
            if (typeof v === 'string' && v.length < 500 && !/cookie/i.test(k)) headers[k] = v
          }
          return { url: conf.url || url, headers }
        }
      } catch { /* ignore */ }
      return { url, headers: {} }
    }
    default:
      throw new Error(`未知调用: ${fn}`)
  }
}

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    Promise.resolve(promise).then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e instanceof Error ? e : new Error(String(e))) },
    )
  })
}

process.on('disconnect', () => process.exit(0))
