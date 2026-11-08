// Legado JS 规则子集实现：`node:vm` 沙箱执行书源里的 <js>…</js> / @js: / {{}} 内 JS 表达式。
// 网络类 java 助手 (ajax/get/post) 经同步子进程抓取，仍走宿主安全抓取通道（SSRF/端口黑名单/大小上限不变）。
// 沙箱无 require/process/global，超时 3s；兼容性以探测（真实搜索）为准，静态判定不再因含 JS 直接判死。
import vm from 'node:vm'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { FetchError } from './fetcher.js'

const CHILD = path.join(path.dirname(fileURLToPath(import.meta.url)), 'legado-fetch-child.mjs')

function netFetchSync(req) {
  const r = spawnSync(process.execPath, [CHILD], {
    input: JSON.stringify(req),
    timeout: (req.timeout || 20000) + 8000,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  let out = null
  try { out = JSON.parse(r.stdout) } catch { /* 子进程崩溃/超时 → null */ }
  if (!out?.ok) {
    const why = out?.error || String(r.stderr || '').slice(-300) || `子进程退出 code=${r.status} signal=${r.signal}`
    throw new FetchError(`JS 网络请求失败：${why}`, 502)
  }
  return String(out.text ?? '')
}

export function extractJsCode(rule) {
  const text = String(rule || '')
  if (/^@js:/i.test(text.trim())) return text.trim().slice(4)
  const open = text.indexOf('<js>')
  if (open >= 0) {
    const close = text.lastIndexOf('</js>')
    if (close > open) return text.slice(open + 4, close)
  }
  return text
}

/**
 * Legado java.* 助手 + 沙箱变量组装与执行。
 * kv：跨调用变量存储（按源隔离，模拟 Legado put/get 在 搜索→详情→目录→正文 间传值）。
 * onGetString：规则求值回调（legado.js 注入），供 java.getString(rule) 使用。
 */
export function runRuleJs(code, {
  result = '', baseUrl = '', source = {}, key = '', page = 1,
  book = {}, chapter = {}, kv = new Map(), onGetString = null, headers = {},
} = {}) {
  const logs = []
  const sandbox = {
    result, baseUrl, key, page, searchKey: key || '', searchPage: page,
    book, chapter,
    source: {
      bookSourceUrl: source.bookSourceUrl || '', bookSourceName: source.bookSourceName || '',
      bookSourceGroup: source.bookSourceGroup || '', bookSourceType: source.bookSourceType || 0,
      getHeader: () => ({ ...headers }),
    },
    cookie: { getKey: () => '' },
    cache: {},
    JSON, Math, Date, RegExp, String, Number, Boolean, Array, Object, URL, URLSearchParams,
    console: { log: (...a) => logs.push(a.map(String).join(' ')), warn: () => {}, error: () => {} },
    java: {
      put: (k, v) => { kv.set(String(k), v); return v },
      get: (k) => kv.get(String(k)) ?? '',
      putString: (k, v) => { kv.set(String(k), String(v)); return String(v) },
      getString: (k) => kv.get(String(k)) ?? '',
      ajax: (u) => netFetchSync({ url: String(u) }),
      post: (u, body, headerMap) => netFetchSync({ url: String(u), method: 'POST', body: body == null ? '' : String(body), headers: normHeaders(headerMap) }),
      connect: (u) => netFetchSync({ url: String(u) }),
      base64Decode: (s) => Buffer.from(String(s ?? ''), 'base64').toString('utf8'),
      base64Encode: (s) => Buffer.from(String(s ?? ''), 'utf8').toString('base64'),
      md5Encode: (s) => crypto.createHash('md5').update(String(s ?? ''), 'utf8').digest('hex'),
      md5Encode16: (s) => crypto.createHash('md5').update(String(s ?? ''), 'utf8').digest('hex').slice(8, 24),
      sha256Encode: (s) => crypto.createHash('sha256').update(String(s ?? ''), 'utf8').digest('hex'),
      hexDecodeToString: (s) => Buffer.from(String(s ?? ''), 'hex').toString('utf8'),
      encodeURI: (s) => encodeURI(String(s ?? '')),
      encodeURIAndDecode: (s) => decodeURIComponent(encodeURI(String(s ?? ''))),
      decodeURI: (s) => decodeURI(String(s ?? '')),
      urlEncode: (s) => encodeURIComponent(String(s ?? '')),
      urlDecode: (s) => { try { return decodeURIComponent(String(s ?? '')) } catch { return String(s) } },
      utf8Decode: (s) => { try { return decodeURIComponent(escape(String(s ?? ''))) } catch { return String(s) } },
      timeFormat: (ms = Date.now(), fmt = 'yyyy-MM-dd HH:mm:ss') => {
        const d = new Date(Number(ms) || Date.now())
        const pad = (n) => String(n).padStart(2, '0')
        return String(fmt)
          .replace(/yyyy/g, d.getFullYear())
          .replace(/MM/g, pad(d.getMonth() + 1))
          .replace(/dd/g, pad(d.getDate()))
          .replace(/HH/g, pad(d.getHours()))
          .replace(/mm/g, pad(d.getMinutes()))
          .replace(/ss/g, pad(d.getSeconds()))
      },
      getStringRule: onGetString ? (rule) => { const v = onGetString(rule); return v == null ? '' : String(v) } : () => '',
      getBook: () => ({ ...book }),
      getBaseUrl: () => baseUrl,
    },
  }
  try {
    let value
    try {
      value = vm.runInNewContext(code, sandbox, { timeout: 3000, displayErrors: true })
    } catch (err) {
      // 顶层 return 的脚本：函数包裹重试（vm 抛的 SyntaxError 跨 realm，instanceof 判不了 → 按 name）
      if (err?.name === 'SyntaxError') {
        value = vm.runInNewContext(`(function(){ ${code}\n })()`, sandbox, { timeout: 3000 })
      } else {
        err.message = `JS 规则执行失败：${err.message}`
        throw err
      }
    }
    if (value === undefined || value === null) return ''
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  } catch (err) {
    if (err instanceof FetchError) throw err
    const msg = err?.message || String(err)
    throw new FetchError(`JS 规则执行失败：${msg}${logs.length ? ` | console: ${logs.slice(0, 3).join(' / ')}` : ''}`, 400)
  }
}

function normHeaders(h) {
  const out = {}
  if (h && typeof h === 'object') {
    for (const [k, v] of Object.entries(h)) {
      if (typeof v === 'string' || typeof v === 'number') out[k] = String(v)
    }
  }
  return out
}
