// HTML 清理：RSS 正文 / 书籍简介等外部 HTML 的唯一渲染前通道。
// 白名单标签 + 白名单属性；删除 script/style/iframe/form 等；
// 干掉 javascript: / data: 危议链接；图片强制走 Host 图片代理。
/* 可嵌入的 <iframe> 媒体播放器域名（路径也校验），其余 iframe 一律剥离 */
const IFRAME_EMBEDS = [
  { host: 'player.bilibili.com', path: '/player.html' },
  { host: 'www.youtube-nocookie.com', path: '/embed/' },
  { host: 'www.youtube.com', path: '/embed/' },
  { host: 'open.spotify.com', path: '/embed/' },
  { host: 'music.163.com', path: '/outchain/' },
]

const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr', 'b', 'strong', 'i', 'em', 'u', 's', 'del', 'ins', 'mark',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'a', 'img', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'sup', 'sub', 'small', 'span', 'div', 'center', 'font', 'abbr', 'time', 'iframe',
])
const ALLOWED_ATTRS = new Set(['href', 'title', 'alt', 'src', 'colspan', 'rowspan', 'align', 'width', 'height'])
const VOID_TAGS = new Set(['br', 'hr', 'img', 'source'])

function safeUrl(value) {
  const v = String(value || '').trim()
  const lower = v.toLowerCase()
  if (lower.startsWith('javascript:') || lower.startsWith('vbscript:') || lower.startsWith('data:') || lower.startsWith('blob:')) return ''
  return v
}

/**
 * 清理不可信 HTML，返回可安全 dangerouslySetInnerHTML 的字符串。
 * @param {string} html
 * @param {{proxyImages?: boolean}} opts - proxyImages 时把图片 src 改写为 /funhub/img?u=
 */
export function sanitizeHtml(html, opts = {}) {
  const src = String(html || '')
  let out = ''
  let i = 0
  const len = src.length
  const openStack = []
  while (i < len) {
    const lt = src.indexOf('<', i)
    if (lt < 0) { out += src.slice(i); break }
    out += src.slice(i, lt)
    const gt = src.indexOf('>', lt)
    if (gt < 0) { out += src.slice(lt); break }
    const raw = src.slice(lt, gt + 1)
    i = gt + 1
    if (raw.startsWith('<!--')) continue
    if (/^<[!?]/.test(raw)) continue
    const closeMatch = /^<\/\s*([a-zA-Z0-9:-]+)\s*>$/.exec(raw)
    if (closeMatch) {
      const tag = closeMatch[1].toLowerCase()
      if (!ALLOWED_TAGS.has(tag)) continue
      // 弹栈到匹配的开标签（容忍未闭合标签）
      const idx = openStack.lastIndexOf(tag)
      if (idx >= 0) {
        for (let k = openStack.length - 1; k >= idx; k--) out += `</${openStack[k]}>`
        openStack.length = idx
      } else if (tag !== 'iframe') {
        out += `</${tag}>`
      }
      // 孤儿的 </iframe> 直接丢弃（iframe 开标签由白名单通道单独生成）
      continue
    }
    const openMatch = /^<\s*([a-zA-Z0-9:-]+)((?:\s+[^<>]*?)?)\s*(\/?)>$/.exec(raw)
    if (!openMatch) continue
    const tag = openMatch[1].toLowerCase()
    if (!ALLOWED_TAGS.has(tag)) continue
    const attrText = openMatch[2]
    if (tag === 'iframe') {
      const srcRaw = /\ssrc=["']([^"']+)["']/.exec(attrText)?.[1] || ''
      let src = safeUrl(srcRaw)
      if (src.startsWith('http://')) src = 'https://' + src.slice(7)
      let ok = false
      try {
        const u = new URL(src)
        ok = u.protocol === 'https:' && IFRAME_EMBEDS.some((e) => u.hostname === e.host && u.pathname.startsWith(e.path))
      } catch { /* 保持 ok=false */ }
      if (!ok) continue // 非白名单 embed：整个标签丢弃
      out += `<iframe src="${src.replace(/"/g, '&quot;')}" allowfullscreen="" referrerpolicy="no-referrer" loading="lazy" title="embedded media"></iframe>`
      continue // 完整元素已自带闭合，不进栈（源的 </iframe> 会按孤儿丢弃）
    }
    const attrs = []
    const attrRe = /([a-zA-Z0-9_:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g
    let am
    while ((am = attrRe.exec(attrText))) {
      const name = am[1].toLowerCase()
      if (!ALLOWED_ATTRS.has(name)) continue
      let value = am[2] ?? am[3] ?? am[4] ?? ''
      if (name === 'href' || name === 'src') {
        value = safeUrl(value)
        if (!value) continue
        if (name === 'src' && tag === 'img' && opts.proxyImages) {
          value = `/funhub/img?u=${encodeURIComponent(value)}`
        }
      }
      if (/^\d+$/.test(value) && (name === 'width' || name === 'height')) {
        const n = Math.min(Number(value), 1200)
        value = String(n)
      }
      attrs.push(`${name}="${value.replace(/"/g, '&quot;')}"`)
    }
    if (tag === 'a') {
      const href = attrs.find((a) => a.startsWith('href='))
      if (!href) attrs.push('href="#"') // 无安全 href 的锚点退化为占位
      attrs.push('target="_blank"', 'rel="noopener noreferrer nofollow"')
    }
    const selfClose = openMatch[3] === '/' || VOID_TAGS.has(tag)
    out += selfClose ? `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}>` : `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}>`
    if (!selfClose) openStack.push(tag)
  }
  for (let k = openStack.length - 1; k >= 0; k--) out += `</${openStack[k]}>`
  return out
}
