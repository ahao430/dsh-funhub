// 极简 RSS 2.0 / Atom / RDF 解析器：零依赖，只抽取展示需要的字段。
// RSS 内容属于不可信输入：正文渲染前必须再过 sanitizeHtml。
function decodeEntities(text) {
  if (!text) return ''
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', middot: '·', bull: '•' }
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => named[name] ?? m)
}

function stripTags(html) {
  return decodeEntities(String(html || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

/** 收集自闭合/包裹标签的内部文本（含 CDATA）。 */
function innerXml(xml, from) {
  const start = xml.indexOf('>', from)
  if (start < 0) return ''
  const tag = xml.slice(from + 1, start).split(/\s/)[0]
  if (xml[start - 1] === '/') return '' // 自闭合
  const close = xml.indexOf(`</${tag}>`, start)
  if (close < 0) return ''
  return xml.slice(start + 1, close)
}

function findTag(xml, name, from = 0) {
  const re = new RegExp(`<${name}(\\s|>|/)`, 'g')
  re.lastIndex = from
  const m = re.exec(xml)
  if (!m) return null
  return { at: m.index, inner: innerXml(xml, m.index), end: m.index + m.index === m.index ? m.index : m.index }
}

function tagValue(xml, name) {
  const hit = findTag(xml, name)
  if (!hit) return ''
  // 优先 CDATA
  const cdata = hit.inner.match(/<!\[CDATA\[([\s\S]*?)\]\]>/)
  return (cdata ? cdata[1] : hit.inner).trim()
}

/** 实体转义 HTML 修复：已是真实标签（或真实+转义混合）原样返回；
 *  否则循环解码（应对单次/多次转义的 feed），仅在解出真实标签时采用，
 *  解不出（纯文本里的 &lt;都不错&gt;）保持原文，避免被当标签丢字。 */
export function repairEscapedHtml(raw) {
  const src = String(raw || '')
  if (!src || /<\/?[a-zA-Z][^<>]*>/.test(src)) return src
  let cur = src
  for (let round = 0; round < 4; round++) {
    const dec = decodeEntities(cur)
    if (dec === cur) break
    if (/<\/?[a-zA-Z][^<>]*>/.test(dec)) return dec
    cur = dec
  }
  return src
}

/** 正文提取：优先 content:encoded → content → description → summary。
 *  CDATA 内已是真实标签则原样；实体转义（含双重转义）由 repairEscapedHtml 还原。 */
function contentValue(inner) {
  for (const name of ['content:encoded', 'content', 'description', 'summary']) {
    const hit = findTag(inner, name)
    if (!hit) continue
    const cdata = hit.inner.match(/<!\[CDATA\[([\s\S]*?)\]\]>/)
    return repairEscapedHtml((cdata ? cdata[1] : hit.inner).trim())
  }
  return ''
}

function parseDate(text) {
  if (!text) return Date.now()
  const t = Date.parse(text)
  return Number.isFinite(t) ? t : Date.now()
}

/**
 * 解析 feed 文本为 { title, link, description, articles: [...] }。
 * @param {string} xml
 */
export function parseFeed(xml) {
  xml = String(xml || '').replace(/^\uFEFF/, '')
  const isAtom = /<feed[\s>]/i.test(xml)
  const isRdf = /<rdf:RDF[\s>]/i.test(xml)
  const items = []

  const itemRe = /<(?:item|entry)[\s>]/gi
  let m
  while ((m = itemRe.exec(xml))) {
    const inner = innerXml(xml, m.index)
    if (!inner) continue
    const title = tagValue(inner, 'title')
    let link = ''
    if (isAtom) {
      const links = [...inner.matchAll(/<link\b[^>]*\/?>/gi)]
      for (const l of links) {
        const href = /href=['"]([^'"]+)['"]/.exec(l[0])
        const rel = /rel=['"]([^'"]+)['"]/.exec(l[0])
        if (href && (!rel || rel[1] === 'alternate')) { link = href[1]; break }
      }
    } else {
      link = tagValue(inner, 'link') || tagValue(inner, 'guid')
    }
    const contentRaw = contentValue(inner)
    const summary = stripTags(contentRaw).slice(0, 320)
    const dateText = tagValue(inner, 'pubDate') || tagValue(inner, 'published') || tagValue(inner, 'updated') || tagValue(inner, 'dc:date')
    if (title || link) {
      items.push({ title: decodeEntities(title) || '(无标题)', link, summary, content: contentRaw, publishedAt: parseDate(dateText) })
    }
  }

  let feedTitle = ''
  let feedLink = ''
  let feedDesc = ''
  const headEnd = isAtom ? xml.search(/<entry[\s>]/i) : xml.search(/<item[\s>]/i)
  const head = xml.slice(0, headEnd < 0 ? xml.length : headEnd)
  feedTitle = tagValue(head, 'title')
  feedDesc = stripTags(tagValue(head, 'description') || tagValue(head, 'subtitle'))
  if (isAtom) {
    const l = /<link\b[^>]*rel=['"]alternate['"][^>]*href=['"]([^'"]+)['"]/i.exec(head) || /<link\b[^>]*href=['"]([^'"]+)['"][^>]*rel=['"]alternate['"]/i.exec(head) || /<link\b[^>]*href=['"]([^'"]+)['"]/i.exec(head)
    feedLink = l ? l[1] : ''
  } else if (isRdf) {
    feedLink = tagValue(head, 'rss:link') || tagValue(head, 'link')
  } else {
    feedLink = tagValue(head, 'link')
  }

  return { title: decodeEntities(feedTitle) || '未命名订阅', link: feedLink, description: feedDesc, articles: items }
}
