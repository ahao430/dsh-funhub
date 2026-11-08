// 安全抓取器：所有外部网络请求的唯一出口。
// 约束（plan §17.3）：HTTPS 优先、URL 校验、SSRF 防护（拒绝解析到内网地址）、
// 超时限制、响应大小限制、内容类型检查。
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { ProxyAgent } from 'undici'

/* ============ 出站代理（设置 → 网络） ============
   Node 全局 fetch 不读 HTTP(S)_PROXY 环境变量，需给每个请求挂 undici ProxyAgent dispatcher。
   配置来自 state.settings.proxy = { enabled, host, port }，route() 每请求同步一次。 */
let proxyDispatcher = null
let proxyKey = ''

/** 按配置刷新全局代理 dispatcher；cfg 为空/未启用时清除代理（直连）。 */
export function setOutboundProxy(cfg) {
  const key = cfg?.enabled && cfg?.port ? `http://${cfg.host || '127.0.0.1'}:${cfg.port}` : ''
  if (key === proxyKey) return
  proxyKey = key
  proxyDispatcher = key ? new ProxyAgent(key) : null
}

/** 供测试类端点按需构造一次性 dispatcher。 */
export function makeProxyDispatcher(cfg) {
  if (!cfg?.enabled || !cfg?.port) return null
  return new ProxyAgent(`http://${cfg.host || '127.0.0.1'}:${cfg.port}`)
}

/** 代理熔断：连接层失败视为代理进程不在，60s 内直连 + 定期重试代理。 */
let proxyDownUntil = 0
const PROXY_RETRY_MS = 60_000
export function proxyStatus() {
  return { configured: Boolean(proxyDispatcher), down: Date.now() < proxyDownUntil, via: proxyKey || 'direct' }
}

/** 统一出站 fetch：代理可用走代理；代理连接失败自动回落直连并熔断。 */
export async function fetchViaProxy(url, init) {
  if (!proxyDispatcher || Date.now() < proxyDownUntil) return fetch(url, init)
  try {
    return await fetch(url, { ...init, dispatcher: proxyDispatcher })
  } catch (err) {
    const code = String(err?.cause?.code || err?.message || '')
    const connErr = err instanceof TypeError && /ECONNREFUSED|ENOTFOUND|ECONNRESET|ETIMEDOUT|UND_ERR|fetch failed|closed/i.test(code)
    if (!connErr) throw err
    proxyDownUntil = Date.now() + PROXY_RETRY_MS
    return fetch(url, init) // 直连重试；直连也失败则抛直连的错误（更真实）
  }
}

const PRIVATE4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
]

export class FetchError extends Error {
  constructor(message, status = 502) {
    super(message)
    this.status = status
  }
}

function isPrivateIp(ip) {
  if (!ip) return true
  if (ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) return true
  if (ip.includes(':')) return false // 其余公网 IPv6 放行
  return PRIVATE4.some((re) => re.test(ip))
}

/** URL 静态校验：仅 http(s)，拒绝用户名密码与非常见端口。 */
/* 敏感端口拒绝清单：数据库 / 缓存 / 容器引擎等非 HTTP 服务，HTTP 抓取对它们毫无意义。
   其余端口（含自建服务常见端口，如 Emby 8096 / Jellyfin 8096 / Plex 32400）一律放行——
   SSRF 的主要防线是 assertPublicHost 的内网 IP / metadata 地址拦截，端口这里只做兜底。 */
const DENIED_PORTS = new Set([22, 2375, 2376, 2379, 3306, 5432, 6379, 11211, 27017, 9200, 9300])

export function assertSafeUrl(raw) {
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new FetchError('无效的 URL', 400)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new FetchError('仅支持 http/https', 400)
  if (url.username || url.password) throw new FetchError('URL 不允许携带凭据', 400)
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80
  if (DENIED_PORTS.has(port)) throw new FetchError('不允许的端口', 400)
  return url
}

export async function assertPublicHost(hostname) {
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new FetchError('不允许访问内网地址', 403)
    return
  }
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new FetchError('不允许访问内网地址', 403)
  }
  try {
    const records = await lookup(hostname, { all: true })
    if (!records.length || records.some((r) => isPrivateIp(r.address))) {
      throw new FetchError('不允许访问内网地址', 403)
    }
  } catch (err) {
    if (err instanceof FetchError) throw err
    throw new FetchError('域名解析失败', 502)
  }
}

/**
 * 抓取 URL 并返回文本/JSON，带超时与大小上限。
 * @param {string} raw - 目标 URL
 * @param {{timeout?: number, maxSize?: number, expect?: string[], headers?: object, requestMethod?: string, requestBody?: string}} opts
 */
export async function safeFetchText(raw, opts = {}) {
  const url = assertSafeUrl(raw)
  await assertPublicHost(url.hostname)
  const timeout = opts.timeout ?? 15_000
  const maxSize = opts.maxSize ?? 8_000_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  let res
  try {
    res = await fetchViaProxy(url, {
      method: opts.requestMethod || 'GET',
      body: opts.requestBody != null ? opts.requestBody : undefined,
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 FunHub/0.1',
        accept: '*/*',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
        ...(opts.requestBody != null && !Object.keys(opts.headers || {}).some((k) => k.toLowerCase() === 'content-type')
          ? { 'content-type': 'application/x-www-form-urlencoded' }
          : {}),
        ...(opts.headers || {}),
      },
    })
  } catch (err) {
    clearTimeout(timer)
    throw new FetchError(err.name === 'AbortError' ? '请求超时' : `网络请求失败：${err.message}`)
  }
  clearTimeout(timer)
  if (!res.ok) throw new FetchError(`上游返回 ${res.status}`)
  const len = Number(res.headers.get('content-length') || 0)
  if (len > maxSize) throw new FetchError('响应过大', 413)
  if (opts.expect?.length && res.headers.get('content-type') && !opts.expect.some((t) => res.headers.get('content-type').includes(t))) {
    throw new FetchError(`内容类型不支持：${res.headers.get('content-type')}`)
  }
  const reader = res.body.getReader()
  const chunks = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > maxSize) {
      await reader.cancel().catch(() => {})
      throw new FetchError('响应过大', 413)
    }
    chunks.push(value)
  }
  const buffer = Buffer.concat(chunks)
  return buffer.toString('utf8')
}

export async function safeFetchJson(raw, opts = {}) {
  const text = await safeFetchText(raw, { expect: ['json', 'text/plain'], ...opts })
  try {
    return JSON.parse(text)
  } catch {
    throw new FetchError('响应不是有效 JSON')
  }
}

/**
 * LX 音源脚本 request 语义的安全抓取：method/headers/body 可控，
 * 返回 LX 回调签名 {statusCode, headers, body}，body 为 JSON 时自动解析为对象。
 * @param {string} raw - 目标 URL
 * @param {{method?: string, headers?: object, body?: any, timeout?: number}} opts
 * @param {number} maxSize
 */
export async function safeFetchLx(raw, opts = {}, maxSize = 8_000_000) {
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
    res = await fetchViaProxy(url, { method: (opts.method || 'GET').toUpperCase(), signal: controller.signal, redirect: 'follow', headers, body: body ?? undefined })
  } catch (err) {
    clearTimeout(timer)
    throw new FetchError(err.name === 'AbortError' ? '请求超时' : `网络请求失败：${err.message}`)
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
      throw new FetchError('响应过大', 413)
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

/**
 * 抓取二进制资源（图片代理用），返回 Buffer，带超时与大小上限。
 * @param {string} raw - 目标 URL
 * @param {{timeout?: number, maxSize?: number, expect?: string[]}} opts
 * @returns {Promise<{buffer: Buffer, contentType: string}>}
 */
export async function safeFetchBuffer(raw, opts = {}) {
  const url = assertSafeUrl(raw)
  await assertPublicHost(url.hostname)
  const timeout = opts.timeout ?? 15_000
  const maxSize = opts.maxSize ?? 12_000_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  let res
  try {
    res = await fetchViaProxy(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 FunHub/0.1',
        accept: 'image/*,*/*;q=0.8',
      },
    })
  } catch (err) {
    clearTimeout(timer)
    throw new FetchError(err.name === 'AbortError' ? '请求超时' : `网络请求失败：${err.message}`)
  }
  clearTimeout(timer)
  if (!res.ok) throw new FetchError(`上游返回 ${res.status}`)
  const len = Number(res.headers.get('content-length') || 0)
  if (len > maxSize) throw new FetchError('响应过大', 413)
  const contentType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0]
  if (!contentType.startsWith('image/')) throw new FetchError(`不是图片：${contentType}`)
  const reader = res.body.getReader()
  const chunks = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > maxSize) {
      await reader.cancel().catch(() => {})
      throw new FetchError('响应过大', 413)
    }
    chunks.push(value)
  }
  return { buffer: Buffer.concat(chunks), contentType }
}

/** 通用字节抓取（字幕压缩包等二进制文件；与 safeFetchBuffer 相同防护，不限图片 content-type）。 */
export async function safeFetchBytes(raw, opts = {}) {
  const url = assertSafeUrl(raw)
  await assertPublicHost(url.hostname)
  const timeout = opts.timeout ?? 15_000
  const maxSize = opts.maxSize ?? 12_000_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  let res
  try {
    res = await fetchViaProxy(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 FunHub/0.1',
        accept: '*/*',
      },
    })
  } catch (err) {
    clearTimeout(timer)
    throw new FetchError(err.name === 'AbortError' ? '请求超时' : `网络请求失败：${err.message}`)
  }
  clearTimeout(timer)
  if (!res.ok) throw new FetchError(`上游返回 ${res.status}`)
  const len = Number(res.headers.get('content-length') || 0)
  if (len > maxSize) throw new FetchError('响应过大', 413)
  const reader = res.body.getReader()
  const chunks = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > maxSize) {
      await reader.cancel().catch(() => {})
      throw new FetchError('响应过大', 413)
    }
    chunks.push(value)
  }
  return { buffer: Buffer.concat(chunks), contentType: res.headers.get('content-type') || '' }
}
