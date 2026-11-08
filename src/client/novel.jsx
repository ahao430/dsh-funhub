// 小说频道：发现（默认推荐）/ 书源搜索（阅读3.0 + Gutenberg）/ 书架 / 阅读器。
import { useCallback, useEffect, useRef, useState, createElement as h } from 'react'
import { api } from './api.js'
import { actions, getState } from './store.js'
import { Icon, Btn, Input, Select, Empty, Loading, ErrorBox, Modal, coverSrc, fmtAgo } from './ui.jsx'

export function BookTile({ book, onClick }) {
  // 兼容两种形状：公版书 {title, cover} 与书源结果 {name, coverUrl}
  return h('div', { className: 'fh-tile', onClick },
    (book.cover || book.coverUrl) ? h('div', { className: 'fh-tile-cover', style: { display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, position: 'relative' } },
      h('span', { style: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' } }, '📖'),
      h('img', { src: book.cover || book.coverUrl, loading: 'lazy', alt: '', style: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' },
        onError: (e) => { e.currentTarget.style.display = 'none' } }))
      : h('div', { className: 'fh-tile-cover', style: { display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 } }, '📖'),
    h('div', { className: 'fh-tile-title' }, book.title || book.name),
    h('div', { className: 'fh-tile-sub' }, book.author || '佚名'))
}

export function NovelPage() {
  const boot = getState().boot
  const [tab, setTab] = useState('discover')
  const bookSources = (boot?.bookSources || []).filter((s) => s.enabled && s.compatible !== false)
  const lastNovel = boot?.settings?.lastSource?.novel
  const [sourceId, setSourceId] = useState(lastNovel && (lastNovel === 'gutenberg' || bookSources.some((s) => s.url === lastNovel && s.enabled !== false))
    ? lastNovel : (bookSources[0]?.url || 'gutenberg'))
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState(null)
  const [detail, setDetail] = useState(null) // 选中的书（发现 / 搜索共用）

  useEffect(() => {
    if (!bookSources.some((s) => s.url === sourceId) && sourceId !== 'gutenberg') {
      setSourceId(bookSources[0]?.url || 'gutenberg')
    }
  }, [bookSources, sourceId])

  const searchSeq = useRef(0)
  const search = useCallback(async (p = 1, qOverride, sourceOverride) => {
    const q = (qOverride ?? query).trim()
    const sid = sourceOverride ?? sourceId
    if (!q) return
    const seq = ++searchSeq.current
    setSearching(true)
    setError(null)
    if (p === 1) setResults([]) // 先清空：换源/重新搜索时不残留旧源结果
    try {
      let books
      if (sid === 'gutenberg') {
        const res = await api.get(`/novel/search?q=${encodeURIComponent(q)}&page=${p}`)
        books = res.books.map((b) => ({
          bookId: b.bookId, sourceId: 'gutenberg', title: b.title, author: b.author,
          cover: b.cover, intro: b.subjects?.join(' / '), kind: b.languages?.join('/'), wordCount: `${b.downloadCount} 次下载`,
        }))
        setHasMore(res.next)
      } else {
        const res = await api.get(`/booksource/search?sourceId=${encodeURIComponent(sid)}&q=${encodeURIComponent(q)}&page=${p}`)
        // 宿主书源列表返回 name/coverUrl，统一映射到组件用的 title/cover（否则书名显示成空、只剩作者行）
        books = res.books.map((b) => ({ ...b, title: b.title || b.name || '', cover: b.cover || b.coverUrl || '' }))
        setHasMore(false)
      }
      if (seq !== searchSeq.current) return // 过期响应（已换源重搜）丢弃
      setResults(p === 1 ? books : [...results, ...books])
      setPage(p)
    } catch (err) {
      if (seq === searchSeq.current) setError(err.message)
    } finally {
      if (seq === searchSeq.current) setSearching(false)
    }
  }, [query, sourceId, results])

  // 首页欢迎区全局搜索直达：带上关键词切到搜索 Tab 并立即搜索
  useEffect(() => {
    const q = actions.consumeSearch('novel')
    if (q) { setTab('search'); setQuery(q); void search(1, q) }
    // eslint-disable-line react-hooks/exhaustive-deps
  }, [])

  return h('div', { className: 'fh-page' },
    h('div', { className: 'fh-page-head' },
      h('div', { className: 'fh-page-title' }, '小说阅读'),
      h('div', { className: 'fh-spacer' }),
      h('div', { style: { display: 'flex', gap: 8 } },
        h('button', { className: `fh-chip-btn${tab === 'discover' ? ' is-on' : ''}`, onClick: () => setTab('discover') }, '发现'),
        h('button', { className: `fh-chip-btn${tab === 'search' ? ' is-on' : ''}`, onClick: () => setTab('search') }, '搜索'),
        h('button', { className: `fh-chip-btn${tab === 'shelf' ? ' is-on' : ''}`, onClick: () => setTab('shelf') }, `书架 ${boot?.shelf?.length || 0}`),
        h('button', { className: `fh-chip-btn${tab === 'history' ? ' is-on' : ''}`, onClick: () => setTab('history') }, `历史 ${boot?.novelHistory?.length || 0}`))),

    tab === 'discover' ? h(DiscoverTab, { boot, onOpenDetail: setDetail, onGotoTab: setTab }) : null,
    tab === 'search' ? h('div', null,
      h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
        h(Select, { value: sourceId, onChange: (v) => {
          setSourceId(v)
          void api.op('settings_save', { settings: { lastSource: { novel: v } } }).catch(() => {})
          // 换源自动重搜：已有搜索词时立即用新源再查
          if (query.trim()) void search(1, query, v)
        }, options: [
          { value: 'gutenberg', label: '公版书库（Gutenberg）' },
          ...bookSources.map((s) => ({ value: s.url, label: s.name })),
        ] }),
        h(Input, { value: query, onChange: setQuery, onEnter: () => search(1), placeholder: '搜索书名 / 作者…', autoFocus: true, style: { flex: 1, minWidth: 200 } }),
        h(Btn, { kind: 'primary', onClick: () => search(1), disabled: searching }, searching ? '搜索中…' : '搜索')),
      error ? h(ErrorBox, { error, onRetry: () => search(1) }) : null,
      searching && !results.length ? h(Loading, null) : null,
      !searching && !results.length && !error ? h(Empty, {
        icon: 'book', title: '输入关键词开始找书',
        hint: bookSources.length
          ? '当前书源来自「阅读3.0」格式，可在设置中导入更多书源'
          : '还没有导入书源：导入阅读书源后即可搜书/看发现页，或先用公版书库试试',
        action: h(Btn, { kind: 'primary', onClick: () => actions.setView('settings', 'booksource') }, '去导入书源'),
      }) : null,
      results.length ? h('div', { className: 'fh-tiles' },
        results.map((b, i) => h(BookTile, { key: `${b.bookId}:${i}`, book: b, onClick: () => setDetail(b) })),
        hasMore ? h('div', { style: { display: 'flex', justifyContent: 'center', gridColumn: '1/-1' } },
          h(Btn, { onClick: () => search(page + 1), disabled: searching }, '加载更多')) : null,
      ) : null,
    ) : null,
    tab === 'shelf' ? h(ShelfTab, { boot }) : null,
    tab === 'history' ? h(NovelHistoryTab, { boot }) : null,
    detail ? h(BookDetail, { book: detail, onClose: () => setDetail(null) }) : null,
  )
}

/* ---------- 阅读历史（完整列表） ---------- */
function NovelHistoryTab({ boot }) {
  const history = boot?.novelHistory || []
  if (!history.length) {
    return h(Empty, { icon: 'book', title: '还没有阅读记录', hint: '打开任意一本书后会自动记录在这里（无需加入书架）' })
  }
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
    h('div', { style: { display: 'flex', alignItems: 'center' } },
      h('div', { style: { fontWeight: 600, fontSize: 14 } }, `阅读历史 ${history.length} 本`),
      h('div', { className: 'fh-spacer' }),
      h('button', { className: 'fh-chip-btn', onClick: async () => {
        await api.op('data_clear', { scope: 'novelHistory' })
        await actions.reload()
        actions.toast('已清空阅读历史')
      } }, '清空')),
    h('div', { className: 'fh-rowlist' },
      history.map((b) => h('button', { key: b.bookId, className: 'fh-row', onClick: () => actions.openNovel({
        mode: b.sourceId === 'gutenberg' ? 'gutenberg' : 'legado',
        sourceId: b.sourceId, bookId: b.bookId, title: b.title, author: b.author || '', cover: b.cover || '',
        chapterIndex: b.chapterIndex || 0,
      }) },
        b.cover ? h('img', { src: b.cover, alt: '', style: { width: 26, height: 36, borderRadius: 4, objectFit: 'cover', flex: 'none', background: 'var(--fh-panel-2)' }, onError: (e) => { e.currentTarget.style.visibility = 'hidden' } }) : h('span', { className: 'fh-mini-art', style: { width: 26, height: 26 } }, '📖'),
        h('span', { className: 't' }, b.title),
        h('span', { className: 's' }, b.chapterTitle || `第 ${(b.chapterIndex || 0) + 1} 章`),
        h('span', { className: 's' }, fmtAgo(b.updatedAt))))))
}

/* ---------- 发现（默认） ---------- */
function DiscoverTab({ boot, onOpenDetail, onGotoTab }) {
  const history = boot?.novelHistory || []
  const shelf = boot?.shelf || []

  /* 书源发现（主内容）：有可声明发现配置的书源才参与 */
  const bookSources = boot?.bookSources || []
  const exploreSources = bookSources.filter((s) => s.enabled && s.compatible !== false && (s.exploreCount || 0) > 0)
  const [exploreSourceId, setExploreSourceId] = useState(exploreSources[0]?.url || '')
  const [categories, setCategories] = useState([])
  const [catUrl, setCatUrl] = useState('')
  const [books, setBooks] = useState([])
  const [page, setPage] = useState(1)
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!exploreSourceId || !exploreSources.some((s) => s.url === exploreSourceId)) {
      setExploreSourceId(exploreSources[0]?.url || '')
      return
    }
    let alive = true
    setCategories([])
    setCatUrl('')
    ;(async () => {
      try {
        const res = await api.get(`/booksource/explore-categories?sourceId=${encodeURIComponent(exploreSourceId)}`)
        if (!alive) return
        setCategories(res.categories || [])
        setCatUrl(res.categories?.[0]?.url || '')
      } catch (err) {
        if (alive) setError(err.message)
      }
    })()
    return () => { alive = false }
  }, [exploreSourceId, exploreSources.length])

  const loadExplore = useCallback(async (p = 1) => {
    if (!exploreSourceId || !catUrl) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(`/booksource/explore?sourceId=${encodeURIComponent(exploreSourceId)}&url=${encodeURIComponent(catUrl)}&page=${p}`)
      // 同搜索：name/coverUrl → title/cover 归一
      const norm = res.books.map((b) => ({ ...b, title: b.title || b.name || '', cover: b.cover || b.coverUrl || '' }))
      setBooks((prev) => (p === 1 ? norm : [...prev, ...norm]))
      setPage(p)
      setMore(res.books.length >= 25)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [exploreSourceId, catUrl])

  useEffect(() => { void loadExplore(1) }, [loadExplore])

  /* 公版书推荐：仅当没有任何书源可用发现时显示 */
  const showPopular = exploreSources.length === 0
  const [popular, setPopular] = useState([])
  const [popularPage, setPopularPage] = useState(1)
  const [popularMore, setPopularMore] = useState(false)
  const [popularLoading, setPopularLoading] = useState(showPopular)
  const [popularError, setPopularError] = useState(null)

  const loadPopular = useCallback(async (p = 1) => {
    setPopularLoading(true)
    setPopularError(null)
    try {
      const res = await api.get(`/novel/popular?page=${p}`)
      setPopular((prev) => (p === 1 ? res.books : [...prev, ...res.books]))
      setPopularPage(p)
      setPopularMore(Boolean(res.next))
    } catch (err) {
      setPopularError(err.message)
    } finally {
      setPopularLoading(false)
    }
  }, [])

  useEffect(() => { if (showPopular) void loadPopular(1) }, [showPopular, loadPopular])

  const openShelfBook = (b) => actions.openNovel({
    mode: b.sourceId === 'gutenberg' ? 'gutenberg' : 'legado',
    sourceId: b.sourceId, bookId: b.bookId, title: b.title, author: b.author || '', cover: b.cover || '', chapterIndex: null,
  })

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 18 } },
    /* 最近阅读（自动历史，含未加入书架的书） */
    history.length ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
      h('div', { style: { display: 'flex', alignItems: 'center' } },
        h('div', { style: { fontWeight: 600, fontSize: 14 } }, '最近阅读'),
        h('div', { className: 'fh-spacer' }),
        h('button', { className: 'fh-chip-btn', onClick: async () => {
          await api.op('data_clear', { scope: 'novelHistory' })
          await actions.reload()
          actions.toast('已清空阅读历史')
        } }, '清空')),
      h('div', { className: 'fh-hstrip',
        onMouseWheel: (e) => {
          // 触控板自然横滑即可；鼠标竖滚轮在条内转为横向滚动
          const el = e.currentTarget
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { el.scrollLeft += e.deltaY; e.preventDefault() }
        },
      },
        history.slice(0, 12).map((b) => h('button', { key: b.bookId, className: 'fh-hstrip-item', onClick: () => actions.openNovel({
          mode: b.sourceId === 'gutenberg' ? 'gutenberg' : 'legado',
          sourceId: b.sourceId, bookId: b.bookId, title: b.title, author: b.author || '', cover: b.cover || '',
          chapterIndex: b.chapterIndex || 0,
        }) },
          b.cover
            ? h('img', { className: 'fh-hstrip-cover', src: b.cover, alt: '', onError: (e) => { e.currentTarget.style.visibility = 'hidden' } })
            : h('span', { className: 'fh-hstrip-cover ph' }, '📖'),
          h('span', { className: 'fh-hstrip-title' }, b.title),
          h('span', { className: 'fh-hstrip-sub' }, `${b.chapterTitle || `第 ${(b.chapterIndex || 0) + 1} 章`} · ${fmtAgo(b.updatedAt)}`))))) : null,

    /* 书源发现：RSS 式左列表选源（便于直接删除没内容的源），右侧分类 + 书墙 */
    exploreSources.length ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
      h('div', { style: { fontWeight: 600, fontSize: 14 } }, '发现'),
      h('div', { className: 'fh-explore-split' },
        h('div', { className: 'fh-rss-side' },
          exploreSources.map((s) => h('div', { key: s.url, style: { display: 'flex', alignItems: 'center', gap: 0 } },
            h('button', { className: `fh-side-item${exploreSourceId === s.url ? ' is-on' : ''}`, style: { flex: 1, minWidth: 0 }, onClick: () => setExploreSourceId(s.url), title: s.name },
              h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, s.name),
              h('span', { className: 'fh-muted', style: { fontSize: 10.5, flex: 'none', marginLeft: 4 } }, s.exploreCount)),
            h('button', { className: 'fh-icon-btn', style: { width: 24, height: 24, flex: 'none' }, title: '删除此书源', onClick: async () => {
              await api.op('booksource_remove', { id: s.id })
              await actions.reload()
              actions.toast(`已删除书源「${s.name}」`)
            } }, h(Icon, { name: 'trash', size: 12 })))),
          h('div', { className: 'fh-muted', style: { fontSize: 11, marginTop: 6, paddingLeft: 10 } }, `${exploreSources.length} 个源可发现 · 删除去设置`)),
        h('div', { className: 'fh-rss-list' },
          categories.length > 1 ? h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 } },
            categories.map((c) => h('button', {
              key: c.url, className: `fh-chip-btn${catUrl === c.url ? ' is-on' : ''}`,
              onClick: () => setCatUrl(c.url),
            }, c.title))) : null,
          h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 } },
            h(Btn, { size: 'sm', onClick: () => loadExplore(1), disabled: loading || !catUrl }, loading ? '加载中…' : '刷新'),
            h('span', { className: 'fh-muted', style: { fontSize: 11.5 } }, exploreSources.find((s) => s.url === exploreSourceId)?.name || '')),
          error ? h(ErrorBox, { error, onRetry: () => loadExplore(1) }) : null,
          loading && !books.length ? h(Loading, { text: '正在获取书源内容…' }) : null,
          books.length ? h('div', { className: 'fh-tiles' },
            books.map((b, i) => h(BookTile, {
              key: `${b.bookId}:${i}`,
              book: b,
              onClick: () => onOpenDetail(b),
            })),
            more ? h('div', { style: { display: 'flex', justifyContent: 'center', gridColumn: '1/-1' } },
              h(Btn, { onClick: () => loadExplore(page + 1), disabled: loading }, loading ? '加载中…' : '加载更多')) : null,
          ) : !loading && !error ? h(Empty, { icon: 'book', title: '该分类暂无内容', hint: '换个分类、换个源，或直接在左侧删掉这个没用的源' }) : null))) : null,

    /* 书架 */
    shelf.length ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
      h('div', { style: { display: 'flex', alignItems: 'center' } },
        h('div', { style: { fontWeight: 600, fontSize: 14 } }, '我的书架'),
        h('div', { className: 'fh-spacer' }),
        h('button', { className: 'fh-chip-btn', onClick: () => onGotoTab('shelf') }, '查看全部')),
      h('div', { className: 'fh-tiles' },
        shelf.slice(0, 8).map((b) => h('div', { key: b.bookId, onClick: () => openShelfBook(b) },
          h(BookTile, { book: b, onClick: () => openShelfBook(b) }))))) : null,

    /* 公版书推荐：仅在没有任何书源发现可用时显示 */
    showPopular ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
      h('div', { style: { fontWeight: 600, fontSize: 14 } }, '热门公版书'),
      popularError ? h(ErrorBox, { error: popularError, onRetry: () => loadPopular(1) }) : null,
      popularLoading && !popular.length ? h(Loading, { text: '正在获取推荐…' }) : null,
      popular.length ? h('div', { className: 'fh-tiles' },
        popular.map((b) => h(BookTile, {
          key: b.bookId,
          book: { bookId: b.bookId, sourceId: 'gutenberg', title: b.title, author: b.author, cover: b.cover },
          onClick: () => onOpenDetail({ bookId: b.bookId, sourceId: 'gutenberg', title: b.title, author: b.author, cover: b.cover, intro: b.subjects?.join(' / ') }),
        })),
        popularMore ? h('div', { style: { display: 'flex', justifyContent: 'center', gridColumn: '1/-1' } },
          h(Btn, { onClick: () => loadPopular(popularPage + 1), disabled: popularLoading }, popularLoading ? '加载中…' : '加载更多')) : null,
      ) : null) : null,

    !shelf.length && !history.length && !exploreSources.length ? h(Empty, {
      icon: 'book', title: '从下面的热门公版书开始，或去搜索',
      hint: '导入书源后，书源自带的「发现」分类（榜单/分类页）会展示在这里',
      action: h(Btn, { onClick: () => actions.setView('settings', 'booksource') }, '去导入书源'),
    }) : null,
  )
}

function BookDetail({ book, onClose }) {
  const [loading, setLoading] = useState(false)
  const [info, setInfo] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        if (book.sourceId === 'gutenberg') {
          const res = await api.get(`/novel/book/${book.bookId}`)
          if (alive) setInfo(res.book)
        } else {
          const res = await api.get(`/booksource/detail?sourceId=${encodeURIComponent(book.sourceId)}&bookUrl=${encodeURIComponent(book.bookId)}`)
          if (alive) setInfo(res.book)
        }
      } catch (err) {
        if (alive) setError(err.message)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [book])

  const shelfBook = {
    bookId: book.bookId, sourceId: book.sourceId || 'gutenberg',
    title: info?.name || book.title || book.name, author: info?.author || book.author || '',
    cover: info?.coverUrl || book.cover || '',
  }

  return h(Modal, { title: info?.name || book.title || book.name || '书籍详情', onClose, width: 620 },
    loading ? h(Loading, null) : error ? h(ErrorBox, { error }) : h('div', { style: { display: 'flex', gap: 16 } },
      h('div', { style: { flex: 'none' } },
        shelfBook.cover ? h('img', { src: coverSrc(shelfBook.cover), alt: '', style: { width: 120, height: 160, objectFit: 'cover', borderRadius: 10, background: 'var(--fh-panel-2)' }, onError: (e) => { e.currentTarget.style.visibility = 'hidden' } })
          : h('div', { style: { width: 120, height: 160, borderRadius: 10, background: 'var(--fh-panel-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34 } }, '📖')),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, flex: 1 } },
        h('div', { style: { fontWeight: 650, fontSize: 15 } }, shelfBook.title),
        h('div', { className: 'fh-muted' }, shelfBook.author || '佚名'),
        info?.kind ? h('div', { className: 'fh-chip', style: { alignSelf: 'flex-start' } }, info.kind.slice(0, 60)) : null,
        h('div', { style: { fontSize: 12.5, color: 'var(--fh-ink2)', lineHeight: 1.7, display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden' } },
          info?.intro || book.intro || '暂无简介'),
        h('div', { style: { display: 'flex', gap: 8, marginTop: 6 } },
          h(Btn, { kind: 'primary', onClick: () => {
            actions.openNovel({
              mode: book.sourceId === 'gutenberg' ? 'gutenberg' : 'legado',
              sourceId: book.sourceId || 'gutenberg',
              bookId: book.bookId,
              title: shelfBook.title,
              author: shelfBook.author, cover: shelfBook.cover,
              tocUrl: info?.tocUrl,
              chapterIndex: null,
            })
            onClose()
          } }, h(Icon, { name: 'book', size: 13 }), ' 开始阅读'),
          h(Btn, { onClick: async () => {
            await api.op('shelf_add', { book: shelfBook })
            actions.toast(`已将《${shelfBook.title}》加入书架`)
            await actions.reload()
          } }, h(Icon, { name: 'plus', size: 13 }), ' 加入书架'))),
    ),
  )
}

function ShelfTab({ boot }) {
  const shelf = boot?.shelf || []
  const progress = boot?.readingProgress || {}
  if (!shelf.length) {
    return h(Empty, { icon: 'book', title: '书架是空的', hint: '在「发现」或「搜索」里找书后点击「加入书架」' })
  }
  return h('div', { className: 'fh-tiles' },
    shelf.map((b) => h('div', { key: b.bookId, className: 'fh-tile', onClick: () => actions.openNovel({
      mode: b.sourceId === 'gutenberg' ? 'gutenberg' : 'legado',
      sourceId: b.sourceId, bookId: b.bookId, title: b.title, author: b.author || '', cover: b.cover || '', chapterIndex: null,
    }) },
      b.cover ? h('img', { className: 'fh-tile-cover', src: coverSrc(b.cover), loading: 'lazy', alt: '' })
        : h('div', { className: 'fh-tile-cover', style: { display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 } }, '📖'),
      h('div', { className: 'fh-tile-title' }, b.title),
      h('div', { className: 'fh-tile-sub' }, progress[b.bookId] ? `已读 ${progress[b.bookId].chapterIndex + 1} 章` : '未开始'),
      h('button', { className: 'fh-btn fh-btn-sm fh-btn-ghost', style: { alignSelf: 'flex-start' }, onClick: async (e) => {
        e.stopPropagation()
        await api.op('shelf_remove', { bookId: b.bookId })
        await actions.reload()
      } }, '移除'))),
  )
}

/* ================= 阅读器 ================= */

const READER_THEMES = { dark: '暗色', paper: '纸张', green: '护眼', black: '黑白' }
const THEME_SWATCH = { dark: 'var(--fh-panel-2)', paper: '#f5efdd', green: '#cfe0cf', black: '#000' }
const PAGE_GAP = 48

export function NovelReader() {
  const session = getState().novel
  if (!session) return null
  return h(ReaderInner, { key: `${session.sourceId}:${session.bookId}`, session })
}

function ReaderInner({ session }) {
  const boot = getState().boot
  const readerCfg = boot?.settings?.reader || {}
  const [fontSize, setFontSize] = useState(readerCfg.fontSize || 18)
  const [lineHeight, setLineHeight] = useState(readerCfg.lineHeight || 1.9)
  const [theme, setTheme] = useState(READER_THEMES[readerCfg.theme] ? readerCfg.theme : 'dark')
  const [mode, setMode] = useState(readerCfg.mode === 'page' ? 'page' : 'scroll') // scroll=上下滚动（默认） page=左右翻页
  const [barVisible, setBarVisible] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false) // 设置面板
  const [showChapters, setShowChapters] = useState(false)
  // 关闭阅读器时轻量刷新 boot：小说页「最近阅读」与首页历史即时更新
  useEffect(() => () => { void actions.reload() }, [])

  const [chapters, setChapters] = useState(null)
  const [chapterIndex, setChapterIndex] = useState(session.chapterIndex ?? 0)
  const [paragraphs, setParagraphs] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const bodyRef = useRef(null)
  const colsRef = useRef(null)
  const [bodyWidth, setBodyWidth] = useState(0)
  const [bodyHeight, setBodyHeight] = useState(0) // mini 播放器出现/消失会改变可用高度，页模式需重排
  const [pageState, setPageState] = useState({ index: 0, total: 1 })

  const savedProgress = boot?.readingProgress?.[session.bookId]

  /* ---- 统一阅读位置锚点：章节内比例 0~1，滚动/翻页两种模式共用 ----
     模式切换、字号行距变化、重开书都按 ratio 恢复到同一文字附近。 */
  const ratioRef = useRef(session.chapterIndex == null ? (savedProgress?.ratio || 0) : 0)
  const [ratioUi, setRatioUi] = useState(ratioRef.current) // 仅驱动进度条/百分比渲染
  const pendingRestoreRef = useRef(true) // 下一次布局完成后需按 ratio 恢复
  const chapterIndexRef = useRef(chapterIndex)
  chapterIndexRef.current = chapterIndex
  const persistTimer = useRef(null)

  /** 节流持久化当前章节 + 章内比例。 */
  const schedulePersist = () => {
    clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      void api.op('reading_progress', {
        bookId: session.bookId, chapterIndex: chapterIndexRef.current ?? 0,
        offset: 0, ratio: ratioRef.current,
      }).catch(() => {})
    }, 1200)
  }

  /** 从 DOM 读当前模式的 ratio（切换模式 / 改字体前调用）。 */
  const captureRatio = () => {
    const body = bodyRef.current
    if (!body) return
    if (mode === 'page') {
      const { index, total } = pageState
      ratioRef.current = total > 1 ? Math.max(0, Math.min(1, index / (total - 1))) : 0
    } else {
      const max = body.scrollHeight - body.clientHeight
      ratioRef.current = max > 2 ? Math.max(0, Math.min(1, body.scrollTop / max)) : 0
    }
  }

  /* 目录 */
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        if (session.mode === 'legado') {
          const tocUrl = session.tocUrl || session.bookId
          const res = await api.get(`/booksource/toc?sourceId=${encodeURIComponent(session.sourceId)}&tocUrl=${encodeURIComponent(tocUrl)}`)
          if (!alive) return
          setChapters(res.chapters)
          if (session.chapterIndex == null) setChapterIndex(Math.min(savedProgress?.chapterIndex ?? 0, Math.max(0, res.chapters.length - 1)))
        } else {
          const res = await api.get(`/novel/book/${session.bookId}/content`)
          if (!alive) return
          const paras = String(res.text || '').split(/\n\s*\n|\n/).map((p) => p.trim()).filter((p) => p.length > 1)
          const chunk = 120
          const groups = []
          for (let i = 0; i < paras.length; i += chunk) {
            groups.push({ name: `第 ${Math.floor(i / chunk) + 1} 部分`, paragraphs: paras.slice(i, i + chunk) })
          }
          setChapters(groups)
          if (session.chapterIndex == null) setChapterIndex(Math.min(savedProgress?.chapterIndex ?? 0, Math.max(0, groups.length - 1)))
        }
      } catch (err) {
        if (alive) setError(err.message)
      }
    })()
    return () => { alive = false }
  }, [session])

  /* 正文 */
  useEffect(() => {
    if (!chapters || chapterIndex == null || !chapters[chapterIndex]) return
    const chapter = chapters[chapterIndex]
    let alive = true
    if (chapter.paragraphs) {
      setParagraphs(chapter.paragraphs)
      return () => { alive = false }
    }
    setLoading(true)
    setError(null)
    setParagraphs(null)
    ;(async () => {
      try {
        const res = await api.get(`/booksource/content?sourceId=${encodeURIComponent(session.sourceId)}&chapterUrl=${encodeURIComponent(chapter.url)}`)
        if (alive) setParagraphs(res.paragraphs)
      } catch (err) {
        if (alive) setError(err.message)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [chapters, chapterIndex, session.sourceId])

  /* 进度保存（章节切换立即写；章内比例由 schedulePersist 节流补写） */
  useEffect(() => {
    if (!chapters || chapterIndex == null) return
    void api.op('reading_progress', { bookId: session.bookId, chapterIndex, offset: 0, ratio: ratioRef.current }).catch(() => {})
  }, [chapterIndex, chapters, session.bookId])

  /* 自动阅读历史（打开章节即记录，无论是否在书架） */
  useEffect(() => {
    if (!chapters || chapterIndex == null || !chapters[chapterIndex]) return
    void api.op('novel_history', {
      bookId: session.bookId, sourceId: session.sourceId,
      title: session.title, author: session.author || '', cover: session.cover || '',
      chapterIndex, chapterTitle: chapters[chapterIndex].name || '',
    }).catch(() => {})
  }, [chapterIndex, chapters])

  /* 设置落盘（防抖） */
  const settingsTimer = useRef(null)
  const pushSettings = (patch) => {
    clearTimeout(settingsTimer.current)
    settingsTimer.current = setTimeout(() => {
      void api.op('reader_settings', { reader: { fontSize, lineHeight, theme, mode, ...patch } }).catch(() => {})
    }, 300)
  }

  // 字体/行距变化会引起重排：先记下当前文字位置，重排完成后按比例恢复
  const changeFontSize = (v) => { captureRatio(); pendingRestoreRef.current = true; const n = Math.max(13, Math.min(30, v)); setFontSize(n); pushSettings({ fontSize: n }) }
  const changeLineHeight = (v) => { captureRatio(); pendingRestoreRef.current = true; const n = Math.max(1.4, Math.min(2.6, Math.round(v * 10) / 10)); setLineHeight(n); pushSettings({ lineHeight: n }) }
  const changeTheme = (v) => { setTheme(v); pushSettings({ theme: v }) }
  // 模式切换：两种模式共用 ratio 锚点，切换后恢复到同一文字附近
  const changeMode = (v) => {
    if (v === mode) return
    captureRatio()
    pendingRestoreRef.current = true
    setMode(v)
    setPageState({ index: 0, total: 1 })
    pushSettings({ mode: v })
  }

  /* 翻页模式：分页测量（CSS 多列 + 平移）。pendingRestore 时按 ratio 定位到原文字附近 */
  const measure = useCallback(() => {
    if (mode !== 'page') return
    const body = bodyRef.current
    const cols = colsRef.current
    if (!body || !cols || !bodyWidth) return
    // epub.js 式测量：容器自身 overflow hidden 时 scrollWidth = 多列总宽
    const step = body.clientWidth + PAGE_GAP
    const total = Math.max(1, Math.ceil(cols.scrollWidth / step))
    setPageState((s) => {
      if (pendingRestoreRef.current) {
        pendingRestoreRef.current = false
        const index = total > 1 ? Math.round(ratioRef.current * (total - 1)) : 0
        return { index: Math.max(0, Math.min(total - 1, index)), total }
      }
      return { index: Math.min(s.index, total - 1), total }
    })
  }, [mode, bodyWidth, bodyHeight])

  useEffect(() => {
    if (mode !== 'page') return
    // 双 rAF：等内容布局与字体应用稳定后再测
    let id2
    const id1 = requestAnimationFrame(() => { id2 = requestAnimationFrame(() => measure()) })
    return () => { cancelAnimationFrame(id1); id2 && cancelAnimationFrame(id2) }
  }, [measure, paragraphs, fontSize, lineHeight, theme])

  /* 滚动模式：章节加载 / 重排后按 ratio 恢复 scrollTop */
  useEffect(() => {
    if (mode !== 'scroll' || !paragraphs) return
    let id2
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => {
        const body = bodyRef.current
        if (!body) return
        if (pendingRestoreRef.current) {
          pendingRestoreRef.current = false
          const max = body.scrollHeight - body.clientHeight
          if (max > 2) body.scrollTop = ratioRef.current * max
          else body.scrollTop = 0
          setRatioUi(ratioRef.current)
        }
      })
    })
    return () => { cancelAnimationFrame(id1); id2 && cancelAnimationFrame(id2) }
  }, [mode, paragraphs, fontSize, lineHeight])

  useEffect(() => {
    const body = bodyRef.current
    if (mode !== 'page' || !body) return
    const ro = new ResizeObserver(() => {
      setBodyWidth(body.clientWidth)
      setBodyHeight(body.clientHeight) // 高度变化（如 mini 播放器出现）→ 重新分页
    })
    ro.observe(body)
    setBodyWidth(body.clientWidth)
    return () => ro.disconnect()
  }, [mode])

  const goPage = useCallback((delta) => {
    setPageState((s) => {
      const next = s.index + delta
      if (next < 0) { goChapterRef.current((chapterIndexRef.current ?? 0) - 1); return s }
      if (next >= s.total) return s // 不自动切章：末页停住，用章节按钮手动切换
      const total = s.total
      ratioRef.current = total > 1 ? Math.max(0, Math.min(1, next / (total - 1))) : 0
      schedulePersistRef.current()
      setRatioUi(ratioRef.current)
      return { ...s, index: next }
    })
  }, [])

  // ref 中转，避免循环依赖
  const goChapterRef = useRef(() => {})
  const schedulePersistRef = useRef(() => {})
  schedulePersistRef.current = schedulePersist

  const goChapter = (idx) => {
    if (idx < 0 || idx >= (chapters?.length || 0)) return
    setChapterIndex(idx)
    ratioRef.current = 0 // 新章节从顶部开始
    pendingRestoreRef.current = false
    setPageState({ index: 0, total: 1 })
    setRatioUi(0)
    setShowChapters(false)
    bodyRef.current?.scrollTo?.({ top: 0 })
  }
  goChapterRef.current = goChapter

  /* 滚轮横翻（触摸板左右滑动） */
  useEffect(() => {
    if (mode !== 'page') return
    const body = bodyRef.current
    if (!body) return
    let acc = 0
    let lockUntil = 0
    const onWheel = (e) => {
      if (!e.deltaX) return
      e.preventDefault()
      const now = Date.now()
      if (now < lockUntil) return
      acc += e.deltaX
      if (Math.abs(acc) > 40) {
        goPage(acc > 0 ? 1 : -1)
        acc = 0
        lockUntil = now + 220
      }
    }
    body.addEventListener('wheel', onWheel, { passive: false })
    return () => body.removeEventListener('wheel', onWheel)
  }, [mode, goPage])

  /* 键盘 */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { setSheetOpen(false); setShowChapters(false); return }
      if (mode === 'page') {
        if (e.key === 'ArrowLeft') { e.preventDefault(); goPage(-1) }
        if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); goPage(1) }
      } else {
        const body = bodyRef.current
        if (e.key === 'ArrowDown' && body) { e.preventDefault(); body.scrollTop += body.clientHeight * 0.85 }
        if (e.key === 'ArrowUp' && body) { e.preventDefault(); body.scrollTop -= body.clientHeight * 0.85 }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, goPage])

  /* 滚动模式：跟踪章内比例（节流写库/刷新 UI）；到底不自动切章，章末按钮手动切换 */
  const scrollUiTimer = useRef(null)
  const onBodyScroll = () => {
    const body = bodyRef.current
    if (!body) return
    if (scrollUiTimer.current == null) {
      scrollUiTimer.current = setTimeout(() => {
        scrollUiTimer.current = null
        const b = bodyRef.current
        if (!b) return
        const m = b.scrollHeight - b.clientHeight
        ratioRef.current = m > 2 ? Math.max(0, Math.min(1, b.scrollTop / m)) : 0
        setRatioUi(ratioRef.current)
        schedulePersist()
      }, 250)
    }
  }

  const themeClass = `fh-reader fh-reader-theme-${theme}`
  const isPage = mode === 'page'

  const content = h('div', {
    ref: isPage ? colsRef : null,
    className: isPage ? 'fh-reader-cols' : 'fh-reader-page',
    style: {
      '--fh-reader-fs': `${fontSize}px`,
      '--fh-reader-lh': lineHeight,
      ...(isPage && bodyWidth ? {
        width: `${bodyWidth}px`,
        columnWidth: `${bodyWidth}px`,
        columnGap: `${PAGE_GAP}px`,
        height: '100%',
        transform: `translateX(${-pageState.index * (bodyWidth + PAGE_GAP)}px)`,
      } : null),
    },
  },
    loading ? h(Loading, { text: '正在加载章节…' }) : null,
    error ? h(ErrorBox, { error, onRetry: () => goChapter(chapterIndex) }) : null,
    paragraphs ? paragraphs.map((p, i) => h('p', { key: i, className: 'fh-reader-para' }, p)) : null,
    /* 章末导航：不自动切章，读完点这里手动去下一章 */
    paragraphs && !loading && !error ? h('div', { className: 'fh-reader-chapnav' },
      h(Btn, { size: 'sm', onClick: () => goChapter((chapterIndex ?? 0) - 1), disabled: !chapterIndex }, '上一章'),
      h('span', { className: 'fh-muted', style: { fontSize: 11.5 } }, `本章完 · 第 ${(chapterIndex ?? 0) + 1}/${chapters?.length || '?'} 章`),
      h(Btn, { size: 'sm', kind: 'primary', onClick: () => goChapter((chapterIndex ?? 0) + 1), disabled: chapterIndex == null || chapterIndex >= (chapters?.length || 0) - 1 }, '下一章'),
    ) : null,
  )

  return h('div', { className: `${themeClass}${isPage ? ' is-page' : ''}` },
    /* 顶栏 */
    h('div', { className: 'fh-reader-bar', style: barVisible ? null : { display: 'none' } },
      h('button', { className: 'fh-icon-btn', onClick: () => actions.closeNovel(), title: '返回' }, h(Icon, { name: 'back', size: 16 })),
      h('span', { className: 'fh-reader-title' }, `${session.title} · ${chapters?.[chapterIndex]?.name || ''}`),
      h('div', { className: 'fh-spacer' }),
      h('span', { className: 'fh-muted', style: { fontSize: 11.5 } },
        isPage
          ? `${pageState.index + 1}/${pageState.total} 页`
          : `${(chapterIndex ?? 0) + 1}/${chapters?.length || '?'} · 本章 ${Math.round(ratioUi * 100)}%`),
      h('button', { className: 'fh-icon-btn', title: '目录', onClick: () => { setShowChapters(!showChapters); setSheetOpen(false) } }, h(Icon, { name: 'list', size: 16 })),
    ),

    /* 正文 + 点按分区 */
    h('div', { className: 'fh-reader-body', ref: bodyRef, style: isPage ? { overflow: 'hidden' } : null, onScroll: isPage ? null : onBodyScroll },
      content,
      h('div', { className: 'fh-reader-tapzone left', onClick: () => (isPage ? goPage(-1) : setBarVisible((v) => !v)) }),
      h('div', { className: 'fh-reader-tapzone center', onClick: () => setBarVisible((v) => !v) }),
      h('div', { className: 'fh-reader-tapzone right', onClick: () => (isPage ? goPage(1) : setBarVisible((v) => !v)) }),
    ),

    /* 底部工具条 */
    h('div', { className: 'fh-reader-foot', style: barVisible ? null : { display: 'none' } },
      h(Btn, { size: 'sm', onClick: () => goChapter((chapterIndex ?? 0) - 1), disabled: !chapterIndex }, '上一章'),
      h('div', { className: 'fh-reader-progress', title: `全书 ${Math.round(((chapterIndex ?? 0) + (isPage ? pageState.index / Math.max(1, pageState.total) : ratioUi)) / Math.max(1, chapters?.length || 1) * 100)}%` },
        h('i', { style: {
          width: `${(((chapterIndex ?? 0) + (isPage ? pageState.index / Math.max(1, pageState.total) : ratioUi)) / Math.max(1, chapters?.length || 1)) * 100}%`,
        } })),
      h(Btn, { size: 'sm', onClick: () => goChapter((chapterIndex ?? 0) + 1), disabled: chapterIndex == null || chapterIndex >= (chapters?.length || 0) - 1 }, '下一章'),
      h('button', { className: 'fh-icon-btn', title: '阅读设置', onClick: () => { setSheetOpen(!sheetOpen); setShowChapters(false) } }, h(Icon, { name: 'gear', size: 16 })),
    ),

    /* 设置面板（字体 / 行距 / 主题 / 翻页模式） */
    sheetOpen && barVisible ? h('div', { className: 'fh-reader-sheet' },
      h('div', { className: 'fh-reader-sheet-row' },
        h('span', null, '字号'),
        h('button', { className: 'fh-cell-btn', onClick: () => changeFontSize(fontSize - 1) }, 'A-'),
        h('span', { style: { minWidth: 34, textAlign: 'center', color: 'var(--fh-ink)' } }, fontSize),
        h('button', { className: 'fh-cell-btn', onClick: () => changeFontSize(fontSize + 1) }, 'A+'),
        h('span', { style: { flex: 1 } }),
        h('span', null, '行距'),
        h('button', { className: 'fh-cell-btn', onClick: () => changeLineHeight(lineHeight - 0.1) }, '−'),
        h('span', { style: { minWidth: 34, textAlign: 'center', color: 'var(--fh-ink)' } }, lineHeight.toFixed(1)),
        h('button', { className: 'fh-cell-btn', onClick: () => changeLineHeight(lineHeight + 0.1) }, '+')),
      h('div', { className: 'fh-reader-sheet-row' },
        h('span', null, '主题'),
        Object.entries(READER_THEMES).map(([v, label]) => h('button', {
          key: v, className: `fh-theme-dot${theme === v ? ' is-on' : ''}`,
          style: { background: THEME_SWATCH[v] }, title: label,
          onClick: () => changeTheme(v),
        }, theme === v ? '✓' : '')),
        h('span', { style: { flex: 1 } }),
        h('span', null, '翻页'),
        h('button', { className: `fh-chip-btn${mode === 'scroll' ? ' is-on' : ''}`, onClick: () => changeMode('scroll') }, '上下滚动'),
        h('button', { className: `fh-chip-btn${mode === 'page' ? ' is-on' : ''}`, onClick: () => changeMode('page') }, '左右翻页')),
    ) : null,

    /* 目录面板 */
    showChapters ? h('div', { className: 'fh-reader-chapters' },
      h('div', { className: 'fh-chapter-list' },
        chapters?.map((c, i) => h('button', { key: i, className: `fh-row${i === chapterIndex ? ' is-playing' : ''}`, onClick: () => goChapter(i) },
          h('span', { className: 't' }, c.name))))) : null,
  )
}
