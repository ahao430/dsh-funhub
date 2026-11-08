// 「阅读」（Legado / 阅读3.0）书源规则引擎 —— 声明式子集实现。
//
// 支持的规则语法（覆盖 xiu2 书源集中纯声明式源，如 酷我小说/铅笔小说/八一中文 等）：
//   JSON 路径    $.a.b / $.a[0] / $.a[*] / $.data
//   HTML 链      class.name.0@tag.a.-1@text / id.x@tag.img@src
//   终结符       text textNodes ownText html all href src title attr...
//   XPath 子集   //tag[@attr='value']/@attr2（og:meta 场景）
//   操作符       ||（回退） &&（合并） ##pat##rep##（正则替换，可省略尾 ##）
//   模板         {{key}} {{page}} {{$.field}}（URL 与字段模板）
//   URL 选项     searchUrl 末尾 ,{"method":"POST","body":"...","charset":"utf-8"}
// 不支持：<js>...</js>、@js:、java.*、登录、验证码 —— 导入时能力检测会标记为「不兼容」。
import { parse } from 'node-html-parser'
import { safeFetchText, FetchError } from './fetcher.js'
import { sanitizeHtml } from './sanitize.js'

/* ---------------- 通用工具 ---------------- */

export function ruleUsesJs(rule) {
  if (typeof rule !== 'string') return false
  return rule.includes('<js>') || /(^|\n|@)js:/.test(rule.trim()) || rule.trim().startsWith('js:')
}

export function sourceCompatibility(source) {
  const issues = []
  const check = (rule, where) => {
    if (ruleUsesJs(rule)) issues.push(`${where} 使用 JS 规则`)
  }
  const rules = [source.searchUrl, source.exploreUrl, source.loginUrl]
  for (const [key, rule] of Object.entries(source.ruleSearch || {})) rules.push(rule), check(rule, `搜索.${key}`)
  for (const [key, rule] of Object.entries(source.ruleBookInfo || {})) check(rule, `详情.${key}`)
  for (const [key, rule] of Object.entries(source.ruleToc || {})) check(rule, `目录.${key}`)
  for (const [key, rule] of Object.entries(source.ruleContent || {})) check(rule, `正文.${key}`)
  if (source.loginUrl) issues.push('需要登录/密钥')
  return { compatible: issues.length === 0, issues: [...new Set(issues)].slice(0, 8) }
}

/** ##pat##rep## 正则替换（rep 缺省为空）。 */
function applyReplace(input, spec) {
  if (typeof input !== 'string') input = String(input ?? '')
  const m = /^##(.*?)(?:##(.*?))?(?:##)?$/.exec(spec)
  if (!m) return input
  try {
    return input.replace(new RegExp(m[1], 'g'), m[2] ?? '')
  } catch {
    return input
  }
}

function str(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

/* ---------------- JSON 路径 ---------------- */

export function jsonPath(data, rule) {
  if (!rule.startsWith('$')) return undefined
  const segs = rule.replace(/^\$\.?/, '').split('.').filter(Boolean)
  let current = [data]
  for (const segRaw of segs) {
    const m = /^([^[\]]+)?(?:\[(\*|-?\d+)\])?$/.exec(segRaw)
    if (!m) return undefined
    const key = m[1]
    const idx = m[2]
    const next = []
    for (const item of current) {
      let value = item
      if (key) {
        if (value == null || typeof value !== 'object') continue
        value = value[key]
      }
      if (idx === '*') {
        if (Array.isArray(value)) next.push(...value)
      } else if (idx !== undefined) {
        const i = Number(idx)
        if (Array.isArray(value) && i < 0 ? value.length + i >= 0 : Array.isArray(value) && i < value.length) {
          next.push(i < 0 ? value[value.length + i] : value[i])
        }
      } else {
        next.push(value)
      }
    }
    current = next
  }
  if (current.length === 0) return undefined
  return current.length === 1 ? current[0] : current
}

/* ---------------- HTML 链 ---------------- */

function pickNodes(root, selector) {
  // 形态：class.x / tag.x / id.x（可带 .N 索引）、裸标签带索引 a.0、纯 CSS 选择器
  const m = /^(?:(class|tag|id)\.)?(.+?)(?:\.(-?\d+))?$/.exec(selector)
  if (m && (m[1] || m[3] !== undefined || /^[a-zA-Z][\w-]*$/.test(m[2]))) {
    const [, kind, rawName, indexRaw] = m
    let nodes
    if (kind === 'class') nodes = root.querySelectorAll(`.${cssEscape(rawName)}`)
    else if (kind === 'id') nodes = root.querySelectorAll(`#${cssEscape(rawName)}`)
    else nodes = root.querySelectorAll(rawName)
    if (indexRaw !== undefined) {
      const i = Number(indexRaw)
      const node = i < 0 ? nodes[nodes.length + i] : nodes[i]
      return node ? [node] : []
    }
    return [...nodes]
  }
  // 纯 CSS 选择器形态（如 ".rankpage_list_box"、"div.item"）
  try {
    return [...root.querySelectorAll(selector)]
  } catch {
    return []
  }
}

function cssEscape(value) {
  return value.replace(/([^\w-])/g, '\\$1')
}

function nodeText(node) {
  return (node.text || '').trim()
}

function nodeTextNodes(node) {
  let out = ''
  for (const child of node.childNodes || []) {
    if (child.nodeType === 3) out += child.rawText || ''
  }
  return out.trim()
}

/** 终结符取值；未知的终结符按属性名取。 */
function terminalValue(node, terminal) {
  if (!node) return ''
  switch (terminal) {
    case 'text': return nodeText(node)
    case 'textNodes': case 'ownText': return nodeTextNodes(node)
    case 'html': return node.innerHTML || ''
    case 'all': return node.outerHTML || ''
    case 'textNodes.0': return nodeTextNodes(node)
    default: return (node.getAttribute?.(terminal) || '').trim()
  }
}

/* ---------------- XPath 子集：//tag[@attr='v']/@attr2 ---------------- */

function xpathSubset(root, rule) {
  const m = /^\/\/([a-zA-Z][\w-]*)\[@([\w:-]+)='([^']*)'\]\/@([\w:-]+)$/.exec(rule.trim())
  if (!m) return undefined
  const [, tag, attr, value, outAttr] = m
  const nodes = [...root.querySelectorAll(tag)].filter((el) => el.getAttribute(attr) === value)
  return nodes.map((el) => el.getAttribute(outAttr) || '')
}

/* ---------------- 规则求值 ---------------- */

function splitTop(rule, sep) {
  // ## 内的 || 不参与切分（保守处理：## 段通常在末尾）
  const parts = []
  let depth = 0
  let buf = ''
  for (let i = 0; i < rule.length; i++) {
    const ch = rule[i]
    if (ch === '#' && rule[i + 1] === '#') { depth = depth > 0 ? 0 : 1; buf += ch; continue }
    if (depth === 0 && rule.startsWith(sep, i)) {
      parts.push(buf)
      buf = ''
      i += sep.length - 1
      continue
    }
    buf += ch
  }
  parts.push(buf)
  return parts
}

/**
 * 在上下文中求值规则。
 * @param {string} rule
 * @param {{json?: any, root?: object, baseUrl?: string}} ctx
 * @returns {string|string[]|undefined}
 */
export function evalRule(rule, ctx) {
  if (rule == null || rule === '') return undefined
  let text = String(rule)
  // 尾部 ##替换## 抽出
  let replaceSpec = ''
  const hashAt = text.indexOf('##')
  if (hashAt >= 0 && !text.slice(0, hashAt).includes('@js:') && !text.slice(0, hashAt).includes('<js>')) {
    // 只在 ## 不处于 {{}} 内时才切（简单处理：首个 ##）
    replaceSpec = text.slice(hashAt)
    text = text.slice(0, hashAt)
  }
  const merged = []
  for (const alt of splitTop(text, '||')) {
    for (const part of splitTop(alt, '&&')) {
      const value = evalSingle(part.trim(), ctx)
      if (value !== undefined && value !== null && String(value) !== '') {
        if (Array.isArray(value)) merged.push(...value.map(str).filter(Boolean))
        else merged.push(str(value))
      }
    }
    if (merged.length) break // || 语义：第一组有结果即返回
  }
  if (!merged.length) return undefined
  let out = merged.join('\n')
  if (replaceSpec) out = applyReplace(out, replaceSpec)
  return out
}

function evalSingle(rule, ctx) {
  if (!rule) return undefined
  if (ruleUsesJs(rule)) throw new FetchError('该规则使用了 JS 脚本，当前引擎不支持', 400)
  if (rule.includes('{{')) return evalTemplate(rule, ctx)
  // JSON 路径
  if (rule.startsWith('$')) return jsonPath(ctx.json, rule)
  // XPath 子集
  if (rule.startsWith('//')) {
    if (!ctx.root) return undefined
    const value = xpathSubset(ctx.root, rule)
    return value
  }
  // class.x@tag.y@terminal（无前导选择器时对 root 自身取终结符，如 "href"、"text"）
  if (!ctx.root) return undefined
  const segments = rule.split('@').filter(Boolean)
  let nodes = [ctx.root]
  for (let i = 0; i < segments.length - 1; i++) {
    const next = []
    for (const node of nodes) next.push(...pickNodes(node, segments[i]))
    nodes = next
    if (!nodes.length) return undefined
  }
  const terminal = segments[segments.length - 1]
  if (nodes.length === 1) return terminalValue(nodes[0], terminal)
  return nodes.map((n) => terminalValue(n, terminal)).filter(Boolean)
}

/** {{key}}/{{page}}/{{$.field}} 模板。 */
export function evalTemplate(template, ctx) {
  if (typeof template !== 'string') return template
  return template.replace(/\{\{(.+?)\}\}/g, (_, inner) => {
    const key = inner.trim()
    if (key === 'key') return ctx.key ?? ''
    if (key === 'page') return ctx.page ?? 1
    const value = evalRule(key, ctx)
    return value == null ? '' : String(value)
  })
}

/* ---------------- 请求 ---------------- */

function parseHeaders(source) {
  const raw = source.header
  if (!raw) return {}
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw
    return obj && typeof obj === 'object' ? obj : {}
  } catch {
    return {}
  }
}

/** 封面统一走宿主图片代理：规避防盗链，且带书源自定义头；非图片响应由代理拒绝、客户端降级。 */
function proxiedCover(url, source) {
  const u = String(url || '').trim()
  if (!/^https?:/i.test(u)) return u
  const filtered = {}
  for (const [k, v] of Object.entries(parseHeaders(source))) {
    if (typeof v === 'string' && v.length < 500 && !/cookie/i.test(k)) filtered[k] = v
  }
  const h = Object.keys(filtered).length ? `&h=${encodeURIComponent(Buffer.from(JSON.stringify(filtered)).toString('base64'))}` : ''
  return `/funhub/img?u=${encodeURIComponent(u)}${h}`
}

/** 解析 Legado URL：`path,{"method":"POST","body":...}` 与 {{}} 模板。 */
function buildUrl(rawUrl, ctx) {
  let url = String(rawUrl || '')
  let options = {}
  const comma = url.lastIndexOf(',')
  if (comma > 0) {
    const tail = url.slice(comma + 1).trim()
    if (tail.startsWith('{')) {
      try {
        options = JSON.parse(tail.replace(/"/g, '"'))
        url = url.slice(0, comma)
      } catch { /* 非选项段，忽略 */ }
    }
  }
  url = evalTemplate(url, ctx)
  return { url, options }
}

function absolute(url, base) {
  if (!url) return ''
  try {
    return new URL(url, base).toString()
  } catch {
    return url
  }
}

async function fetchSourcePage(source, rawUrl, ctx, { maxSize = 6_000_000 } = {}) {
  if (!rawUrl) throw new FetchError('缺少 URL', 400)
  if (ruleUsesJs(rawUrl)) throw new FetchError('该 URL 规则使用了 JS，当前引擎不支持', 400)
  const { url, options } = buildUrl(rawUrl, ctx)
  const finalUrl = absolute(url, source.bookSourceUrl)
  const headers = { ...parseHeaders(source), ...(options.headers || {}) }
  const method = (options.method || 'GET').toUpperCase()
  let body
  if (options.body != null) {
    body = typeof options.body === 'string' ? evalTemplate(options.body, ctx) : JSON.stringify(options.body)
    if (method === 'GET' && body != null) headers['content-type'] = headers['content-type'] || 'application/x-www-form-urlencoded'
  }
  const text = await safeFetchText(finalUrl, { timeout: 20_000, maxSize, headers, ...(body != null && method !== 'GET' ? { requestBody: body, requestMethod: method } : {}) })
  return { text, finalUrl, method }
}

function makeContext(text) {
  const trimmed = text.trim()
  if (/^[{[]/.test(trimmed)) {
    try {
      return { json: JSON.parse(trimmed) }
    } catch { /* 按 HTML 处理 */ }
  }
  return { root: parse(text) }
}

/* ---------------- 对外流程 ---------------- */

function itemField(rules, key, itemCtx, { array = false } = {}) {
  const rule = rules[key]
  if (!rule) return ''
  const value = evalRule(rule, { ...itemCtx, root: itemCtx.root ?? null, json: itemCtx.json ?? undefined })
  if (value == null) return ''
  return array && Array.isArray(value) ? value : String(value)
}

/** 从页面上下文按 bookList 规则解析书籍列表（搜索 / 发现共用）。 */
function parseBookList(base, rules, listRule, source) {
  const sourceUrl = source.bookSourceUrl
  let jsonItems = null
  let htmlNodes = null
  if (listRule.startsWith('$')) {
    const value = jsonPath(base.json, listRule)
    if (Array.isArray(value)) jsonItems = value
  } else if (base.root) {
    htmlNodes = pickNodes(base.root, listRule.split('@')[0])
  }
  const count = jsonItems?.length ?? htmlNodes?.length ?? 0
  if (!count) return []
  const books = []
  for (let i = 0; i < Math.min(count, 30); i++) {
    const itemCtx = jsonItems
      ? { json: jsonItems[i], baseUrl: sourceUrl }
      : { root: htmlNodes[i], baseUrl: sourceUrl }
    const name = itemField(rules, 'name', itemCtx)
    const bookUrlRaw = itemField(rules, 'bookUrl', itemCtx)
    if (!name && !bookUrlRaw) continue
    books.push({
      bookId: absolute(evalTemplate(bookUrlRaw, itemCtx), sourceUrl),
      sourceId: sourceUrl,
      name,
      author: itemField(rules, 'author', itemCtx),
      coverUrl: proxiedCover(absolute(itemField(rules, 'coverUrl', itemCtx), sourceUrl), source),
      intro: itemField(rules, 'intro', itemCtx),
      kind: itemField(rules, 'kind', itemCtx),
      wordCount: itemField(rules, 'wordCount', itemCtx),
      lastChapter: itemField(rules, 'lastChapter', itemCtx),
    })
  }
  return books
}

/** 书源搜索。 */
export async function legadoSearch(source, key, page = 1) {
  if (!source.searchUrl) throw new FetchError('书源缺少 searchUrl', 400)
  if (ruleUsesJs(source.searchUrl)) throw new FetchError('该书源搜索使用了 JS 规则，当前引擎不支持', 400)
  const { text } = await fetchSourcePage(source, source.searchUrl, { key, page })
  const base = makeContext(text)
  const rules = source.ruleSearch || {}
  const listRule = rules.bookList
  if (!listRule) throw new FetchError('书源缺少搜索列表规则', 400)
  return parseBookList(base, rules, listRule, source)
}

/**
 * 书源发现（Legado exploreUrl / ruleExplore）。
 * exploreUrl 兼容两种形态：JSON 数组（[{title,url,style}]，url 空的条目是分组标题）与整串单分类。
 */
export function exploreCategories(source) {
  const raw = source.exploreUrl
  // 没有发现列表规则（ruleExplore.bookList）就无法解析发现结果：
  // 视为无发现能力，避免发现下拉里出现必然报错「缺少发现列表规则」的源
  if (!source.ruleExplore?.bookList) return []
  if (!raw || ruleUsesJs(String(raw))) return []
  const text = String(raw).trim()
  if (text.startsWith('[')) {
    try {
      const arr = JSON.parse(text.replace(/,(\s*[\]}])/g, '$1'))
      if (Array.isArray(arr)) {
        return arr
          .filter((e) => e && typeof e === 'object' && typeof e.url === 'string' && e.url.trim() && !ruleUsesJs(e.url))
          .map((e) => ({ title: String(e.title || '未命名').slice(0, 24), url: e.url.trim() }))
          .slice(0, 200)
      }
    } catch { /* 非法 JSON，按整串处理 */ }
  }
  if (ruleUsesJs(text)) return []
  return [{ title: '发现', url: text }]
}

/** 书源发现：按分类 URL + 页码取书列表（ruleExplore 与 ruleSearch 同构）。 */
export async function legadoExplore(source, explorePath, page = 1) {
  if (!explorePath) throw new FetchError('缺少发现分类 URL', 400)
  if (ruleUsesJs(explorePath)) throw new FetchError('该发现分类使用了 JS 规则，当前引擎不支持', 400)
  const rules = source.ruleExplore || {}
  const listRule = rules.bookList
  if (!listRule) throw new FetchError('书源缺少发现列表规则（ruleExplore.bookList）', 400)
  const { text } = await fetchSourcePage(source, explorePath, { key: '', page })
  const base = makeContext(text)
  return parseBookList(base, rules, listRule, source)
}

/** 书籍详情（含目录地址）。 */
export async function legadoDetail(source, bookUrl) {
  const { text, finalUrl } = await fetchSourcePage(source, bookUrl, {})
  let ctx = makeContext(text)
  ctx.baseUrl = finalUrl
  const rules = source.ruleBookInfo || {}
  const initRule = rules.init
  if (initRule && !ruleUsesJs(initRule)) {
    // init 规则直接取 JSON 子对象（不经 evalRule 的字符串化）
    const initValue = initRule.startsWith('$') && ctx.json ? jsonPath(ctx.json, initRule) : evalRule(initRule, ctx)
    if (initValue && typeof initValue === 'object' && !Array.isArray(initValue)) ctx = { json: initValue, baseUrl: finalUrl }
  }
  const get = (key) => {
    const raw = rules[key]
    if (!raw) return ''
    let value = evalRule(raw, ctx)
    if (value != null) value = evalTemplate(String(value), ctx)
    return String(value ?? '')
  }
  const tocUrl = absolute(get('tocUrl') || bookUrl, finalUrl)
  return {
    bookId: bookUrl,
    sourceId: source.bookSourceUrl,
    name: get('name'),
    author: get('author'),
    coverUrl: proxiedCover(absolute(get('coverUrl'), finalUrl), source),
    intro: get('intro'),
    kind: get('kind'),
    lastChapter: get('lastChapter'),
    wordCount: get('wordCount'),
    tocUrl,
  }
}

/** 章节目录。 */
export async function legadoToc(source, tocUrl) {
  const { text, finalUrl } = await fetchSourcePage(source, tocUrl, {})
  const ctx = makeContext(text)
  ctx.baseUrl = finalUrl
  const rules = source.ruleToc || {}
  const listRule = rules.chapterList
  if (!listRule) throw new FetchError('书源缺少目录列表规则', 400)

  let jsonItems = null
  let htmlNodes = null
  if (listRule.startsWith('$') && ctx.json) {
    const value = jsonPath(ctx.json, listRule)
    if (Array.isArray(value)) jsonItems = value
  } else if (ctx.root && !listRule.startsWith('$')) {
    htmlNodes = pickNodes(ctx.root, listRule.split('@')[0])
  }
  const chapters = []
  const entries = jsonItems ?? htmlNodes ?? []
  for (const item of entries.slice(0, 3000)) {
    const itemCtx = jsonItems ? { json: item, baseUrl: finalUrl } : { root: item, baseUrl: finalUrl }
    const name = itemField(rules, 'chapterName', itemCtx)
    const url = absolute(evalTemplate(itemField(rules, 'chapterUrl', itemCtx), itemCtx), finalUrl)
    if (name || url) chapters.push({ name: name || '未命名章节', url })
  }
  return chapters
}

/** 章节正文：HTML → 分段纯文本（渲染前已剥离全部标签）。 */
export async function legadoContent(source, chapterUrl) {
  const { text, finalUrl } = await fetchSourcePage(source, chapterUrl, { maxSize: 4_000_000 })
  const ctx = makeContext(text)
  ctx.baseUrl = finalUrl
  const rule = source.ruleContent?.content
  if (!rule) throw new FetchError('书源缺少正文规则', 400)
  const value = evalRule(rule, ctx)
  if (value == null || value === '') throw new FetchError('未能解析出正文', 404)
  const rawHtml = String(value)
  // 正文里的 HTML 只保留换行语义，剥离全部标记后按空行分段
  const paragraphs = htmlToParagraphs(rawHtml)
  if (!paragraphs.length) throw new FetchError('正文为空', 404)
  return { title: '', paragraphs, url: finalUrl }
}

export function htmlToParagraphs(rawHtml) {
  const withBreaks = String(rawHtml)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n')
    .replace(/&nbsp;/gi, ' ')
  const text = withBreaks.replace(/<[^>]*>/g, '')
  // 保留 sanitize 管道的一致性：decode 由 node-html-parser 完成
  const decoded = parse(`<x>${text}</x>`).text || text
  return decoded
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
}

export { sanitizeHtml }
