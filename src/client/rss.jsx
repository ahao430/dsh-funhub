// RSS 频道：订阅管理 / 文章列表 / 阅读（文章为页内阅读页，正文已在宿主端清理）。
import { useCallback, useEffect, useState, createElement as h } from 'react'
import { api } from './api.js'
import { actions, getState } from './store.js'
import { Icon, Btn, Input, Empty, Loading, ErrorBox, Modal, fmtAgo } from './ui.jsx'

/* 跨页面打开文章：首页 RSS 卡片跳转时 RSS 页可能尚未挂载，先暂存，挂载后消费 */
let pendingArticle = null
/** 供其它页面（首页卡片）调用：切到 RSS 频道并直接打开文章阅读页。 */
export function queueRssArticle(a) {
  pendingArticle = a
  actions.setView('rss')
}

export function RssPage() {
  const boot = getState().boot
  const feeds = boot?.rss?.feeds || []
  const articles = boot?.rss?.articles || []
  const [activeFeed, setActiveFeed] = useState('all')
  const [article, setArticle] = useState(null)
  const [adding, setAdding] = useState(false)
  const [newUrl, setNewUrl] = useState('')
  const [addTab, setAddTab] = useState('url') // url | rec
  const [recs, setRecs] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshErrors, setRefreshErrors] = useState(null)
  const [showUnread, setShowUnread] = useState(false)

  // 首页卡片跳转：消费暂存的文章（跨页面挂载时 window 回调尚未注册）
  useEffect(() => {
    if (pendingArticle) {
      const a = pendingArticle
      pendingArticle = null
      setArticle(a)
    }
  }, [])

  // 推荐源懒加载（首次打开推荐页时拉取）
  useEffect(() => {
    if (addTab !== 'rec' || recs) return
    let alive = true
    void (async () => {
      try {
        const res = await api.get('/rss/recommend')
        if (alive) setRecs(res.recommendations || [])
      } catch {
        if (alive) setRecs([])
      }
    })()
    return () => { alive = false }
  }, [addTab, recs])

  const visible = articles
    .filter((a) => activeFeed === 'all' || a.feedId === activeFeed)
    .filter((a) => !showUnread || !a.read)

  const refresh = useCallback(async (feedId) => {
    setRefreshing(true)
    setRefreshErrors(null)
    try {
      const response = await fetch('/funhub/api/rss/refresh', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(feedId ? { feedId } : {}),
      })
      const body = await response.json()
      if (!response.ok || !body.ok) throw new Error(body?.error || `HTTP ${response.status}`)
      await actions.reload()
      if (body.errors?.length) setRefreshErrors(body.errors)
    } catch (err) {
      setRefreshErrors([{ feed: '刷新', error: err.message }])
    } finally {
      setRefreshing(false)
    }
  }, [])

  const addRecommend = async (rec) => {
    try {
      await api.op('rss_add', { url: rec.url, title: rec.title, category: rec.category })
      await actions.reload()
      void refresh()
      actions.toast(`已订阅「${rec.title}」`)
    } catch (err) {
      actions.toast(err.message)
    }
  }

  const openArticle = async (a) => {
    setArticle(a)
    if (!a.read) {
      await api.op('rss_read', { articleId: a.id }).catch(() => {})
      await actions.reload()
    }
  }

  // 文章打开时整页切换为阅读视图（所有 Hook 之后才可提前 return）
  if (article) {
    return h(ArticleView, { article, feedTitle: feeds.find((f) => f.id === article.feedId)?.title, onClose: () => setArticle(null) })
  }

  return h('div', { className: 'fh-page' },
    h('div', { className: 'fh-page-head' },
      h('div', { className: 'fh-page-title' }, 'RSS 订阅'),
      h('div', { className: 'fh-spacer' }),
      h(Btn, { onClick: () => refresh(), disabled: refreshing || !feeds.length }, refreshing ? '刷新中…' : '全部刷新'),
      h(Btn, { onClick: () => { setAddTab('rec'); setAdding(true) } }, h(Icon, { name: 'star', size: 13 }), ' 热门推荐'),
      h(Btn, { kind: 'primary', onClick: () => { setAddTab('url'); setAdding(true) } }, h(Icon, { name: 'plus', size: 13 }), ' 添加订阅')),
    refreshErrors ? h(ErrorBox, { error: refreshErrors.map((e) => `${e.feed}: ${e.error}`).join('；'), onRetry: () => setRefreshErrors(null) }) : null,
    !feeds.length ? h(Empty, {
      icon: 'rss', title: '还没有任何订阅',
      hint: '可从「热门推荐」一键订阅，或添加任意 RSS / Atom 地址',
      action: h(Btn, { kind: 'primary', onClick: () => { setAddTab('rec'); setAdding(true) } }, '浏览热门推荐'),
    }) : h('div', { className: 'fh-rss-split' },
      h('div', { className: 'fh-rss-side' },
        h('button', { className: `fh-side-item${activeFeed === 'all' ? ' is-on' : ''}`, onClick: () => setActiveFeed('all') },
          h(Icon, { name: 'list', size: 14 }), ` 全部 ${articles.length}`),
        feeds.map((f) => h('div', { key: f.id, style: { display: 'flex', alignItems: 'center', gap: 0 } },
          h('button', { className: `fh-side-item${activeFeed === f.id ? ' is-on' : ''}`, style: { flex: 1, minWidth: 0 }, onClick: () => setActiveFeed(f.id), title: f.title },
            h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, f.title)),
          h('button', { className: 'fh-icon-btn', style: { width: 24, height: 24, flex: 'none' }, title: '刷新此源', onClick: () => refresh(f.id) }, h(Icon, { name: 'refresh', size: 12 })),
          h('button', { className: 'fh-icon-btn', style: { width: 24, height: 24, flex: 'none' }, title: '删除', onClick: async () => {
            await api.op('rss_remove', { id: f.id })
            await actions.reload()
          } }, h(Icon, { name: 'trash', size: 12 })))),
        h('button', { className: `fh-chip-btn${showUnread ? ' is-on' : ''}`, style: { alignSelf: 'flex-start', marginTop: 8 }, onClick: () => setShowUnread(!showUnread) },
          `只看未读 ${articles.filter((a) => !a.read).length}`)),
      h('div', { className: 'fh-rss-list' },
        visible.length ? visible.map((a) => h('div', { key: a.id, className: 'fh-feed-item', onClick: () => openArticle(a) },
          h('span', { className: `fh-feed-dot${a.read ? ' is-read' : ''}` }),
          h('div', { style: { minWidth: 0 } },
            h('div', { style: { fontWeight: a.read ? 400 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, a.title),
            h('div', { className: 'fh-muted', style: { fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
              `${feeds.find((f) => f.id === a.feedId)?.title || ''} · ${fmtAgo(a.publishedAt)} · ${a.summary?.slice(0, 60) || ''}`))))
          : h(Empty, { icon: 'doc', title: '没有文章', hint: '点击「全部刷新」拉取最新内容' })),
    ),
    adding ? h(Modal, { title: '添加 RSS 订阅', onClose: () => setAdding(false), width: 560 },
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
        h('div', { style: { display: 'flex', gap: 8 } },
          h('button', { className: `fh-chip-btn${addTab === 'url' ? ' is-on' : ''}`, onClick: () => setAddTab('url') }, '订阅链接'),
          h('button', { className: `fh-chip-btn${addTab === 'rec' ? ' is-on' : ''}`, onClick: () => setAddTab('rec') }, '热门推荐')),
        addTab === 'url' ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
          h(Input, { value: newUrl, onChange: setNewUrl, placeholder: 'https://… 或 rsshub://bilibili/user/video/689904', autoFocus: true }),
          h('div', { className: 'fh-muted', style: { fontSize: 12 } }, '支持 RSS 2.0 / Atom / RDF；rsshub:// 路由自动转 https（首段为域名时用自建实例，否则走 rsshub.app，公共实例可能限流）'),
          h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8 } },
            h(Btn, { onClick: () => setAdding(false) }, '取消'),
            h(Btn, { kind: 'primary', onClick: async () => {
              const url = newUrl.trim()
              if (!/^(https?:\/\/|rsshub:\/\/)/.test(url)) { actions.toast('请输入 http(s) 地址或 rsshub:// 路由'); return }
              try {
                await api.op('rss_add', { url })
                setAdding(false)
                setNewUrl('')
                await actions.reload()
                await refresh()
              } catch (err) {
                actions.toast(err.message)
              }
            } }, '添加')))
        : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '52vh', overflowY: 'auto' } },
          recs == null ? h(Loading, { text: '正在获取推荐…' }) : null,
          recs?.length ? (() => {
            const byCat = new Map()
            for (const r of recs) {
              if (!byCat.has(r.category)) byCat.set(r.category, [])
              byCat.get(r.category).push(r)
            }
            const feedUrls = new Set(feeds.map((f) => f.url))
            return [...byCat.entries()].map(([cat, list]) => h('div', { key: cat, style: { display: 'flex', flexDirection: 'column', gap: 6 } },
              h('div', { className: 'fh-muted', style: { fontSize: 11.5, marginTop: 4 } }, cat),
              list.map((r) => {
                const added = feedUrls.has(r.url)
                return h('div', { key: r.url, className: 'fh-src-row' },
                  h('span', { className: 'name' }, r.title),
                  h('span', { className: 'meta' }, r.desc),
                  h('div', { className: 'fh-spacer' }),
                  h(Btn, { size: 'sm', kind: added ? 'default' : 'primary', disabled: added, onClick: () => addRecommend(r) }, added ? '已订阅' : '订阅'))
              })))
          })() : null,
          recs && !recs.length ? h('div', { className: 'fh-muted' }, '推荐列表为空') : null))) : null,
  )
}

/* 文章阅读页：页内整页视图（非弹窗），返回列表 / 收藏 / 原文 */
function ArticleView({ article, feedTitle, onClose }) {
  const boot = getState().boot
  const favs = (boot?.favorites || []).filter((f) => f.itemType === 'article')
  const fav = favs.find((f) => f.itemId === article.id)
  return h('div', { className: 'fh-page' },
    h('div', { className: 'fh-page-head' },
      h(Btn, { size: 'sm', onClick: onClose }, h(Icon, { name: 'back', size: 13 }), ' 返回'),
      h('div', { className: 'fh-spacer' }),
      h(Btn, { size: 'sm', onClick: async () => {
        await api.op('fav_toggle', { itemType: 'article', itemId: article.id, meta: { title: article.title, link: article.link, feedTitle } })
        await actions.reload()
      } }, h(Icon, { name: 'heart', size: 12 }), fav ? ' 已收藏' : ' 收藏'),
      article.link ? h('a', { className: 'fh-btn fh-btn-sm', href: article.link, target: '_blank', rel: 'noopener noreferrer' }, '原文') : null),
    h('div', { className: 'fh-article-head' },
      h('h1', null, article.title),
      h('div', { className: 'meta' },
        h('span', { className: 'fh-chip' }, feedTitle || 'RSS'),
        h('span', { className: 'fh-muted' }, new Date(article.publishedAt).toLocaleString('zh-CN')))),
    h('div', { className: 'fh-article', dangerouslySetInnerHTML: { __html: article.content || `<p>${article.summary || '（正文为空）'}</p>` } }),
  )
}
