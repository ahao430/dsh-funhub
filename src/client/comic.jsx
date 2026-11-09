// 漫画频道：venera 漫画源搜索 / 书架 / 章节阅读器（滚动 + 单页模式）。
import { useCallback, useEffect, useRef, useState, createElement as h } from 'react'
import { api } from './api.js'
import { actions, getState } from './store.js'
import {Icon, Btn, Input, Select, Empty, Loading, ErrorBox, Modal, ConfirmModal} from './ui.jsx'

export function ComicPage() {
  const [tab, setTab] = useState('shelf')
  const boot = getState().boot
  const sources = (boot?.comicSources || []).filter((s) => s.enabled && !s.error)
  const lastComic = boot?.settings?.lastSource?.comic
  const [sourceId, setSourceId] = useState(lastComic && sources.some((s) => s.id === lastComic && s.enabled !== false) ? lastComic : (sources[0]?.id || ''))
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState([])
  const [error, setError] = useState(null)
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    if (sourceId && !sources.some((s) => s.id === sourceId)) setSourceId(sources[0]?.id || '')
  }, [sources, sourceId])

  const searchSeq = useRef(0)
  const search = useCallback(async (qOverride, sourceOverride) => {
    const q = (qOverride ?? query).trim()
    const sid = sourceOverride ?? sourceId
    if (!sid || !q) return
    const seq = ++searchSeq.current
    setSearching(true)
    setError(null)
    setResults([]) // 先清空：换源/重搜时不残留旧源结果
    try {
      const res = await api.get(`/comic/search?sourceId=${sid}&q=${encodeURIComponent(q)}&page=1`)
      if (seq !== searchSeq.current) return // 过期响应（已被更新的搜索取代）丢弃
      setResults(res.comics || [])
    } catch (err) {
      if (seq === searchSeq.current) setError(err.message)
    } finally {
      if (seq === searchSeq.current) setSearching(false)
    }
  }, [sourceId, query])

  // 首页欢迎区全局搜索直达
  useEffect(() => {
    const q = actions.consumeSearch('comic')
    if (q) { setTab('search'); setQuery(q); void search(q) }
    // eslint-disable-line react-hooks/exhaustive-deps
  }, [])

  return h('div', { className: 'fh-page' },
    h('div', { className: 'fh-page-head' },
      h('div', { className: 'fh-page-title' }, '漫画'),
      h('div', { className: 'fh-spacer' }),
      h('div', { style: { display: 'flex', gap: 8 } },
        h('button', { className: `fh-chip-btn${tab === 'shelf' ? ' is-on' : ''}`, onClick: () => setTab('shelf') }, `书架 ${boot?.comics?.length || 0}`),
        h('button', { className: `fh-chip-btn${tab === 'history' ? ' is-on' : ''}`, onClick: () => setTab('history') }, `历史 ${boot?.comicHistory?.length || 0}`),
        h('button', { className: `fh-chip-btn${tab === 'explore' ? ' is-on' : ''}`, onClick: () => setTab('explore') }, '发现'),
        h('button', { className: `fh-chip-btn${tab === 'search' ? ' is-on' : ''}`, onClick: () => setTab('search') }, '搜索'))),

    tab === 'explore' ? h(ComicExplore, { sources, onOpenDetail: setDetail }) : null,

    tab === 'search' ? h('div', null,
      sources.length ? h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
        h(Select, { value: sourceId, onChange: (v) => {
          setSourceId(v)
          void api.op('settings_save', { settings: { lastSource: { comic: v } } }).catch(() => {})
          // 换源自动重搜：已有搜索词时立即用新源再查
          if (query.trim()) void search(query, v)
        }, options: sources.map((s) => ({ value: s.id, label: s.name })) }),
        h(Input, { value: query, onChange: setQuery, onEnter: search, placeholder: '搜索漫画…', autoFocus: true, style: { flex: 1, minWidth: 200 } }),
        h(Btn, { kind: 'primary', onClick: search, disabled: searching }, searching ? '搜索中…' : '搜索'))
        : h(Empty, {
          icon: 'comic', title: '还没有可用的漫画源',
          hint: 'FunHub 不内置漫画源：请自行寻找 venera（ComicSource）格式的漫画源脚本，到 设置 → 漫画源 以 URL 或本地文件导入',
          action: h(Btn, { kind: 'primary', onClick: () => actions.setView('settings', 'comicsource') }, '去导入漫画源'),
        }),
      error ? h(ErrorBox, { error, onRetry: search }) : null,
      searching && !results.length ? h(Loading, null) : null,
      results.length ? h('div', { className: 'fh-tiles' },
        results.map((c, i) => h('div', { key: `${c.id}:${i}`, className: 'fh-tile', onClick: () => setDetail({ sourceId, comic: c }) },
          h('div', { className: 'fh-tile-cover', style: { display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, position: 'relative' } },
            h('span', { style: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' } }, '📚'),
            c.cover ? h('img', { src: c.cover, loading: 'lazy', alt: '', style: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }, onError: (e) => { e.currentTarget.style.display = 'none' } }) : null),
          h('div', { className: 'fh-tile-title' }, c.title),
          h('div', { className: 'fh-tile-sub' }, c.subtitle || c.tags?.slice(0, 2).join(' ') || '')))) : null,
      detail ? h(ComicDetail, { ...detail, onClose: () => setDetail(null) }) : null,
    ) : null,
    tab === 'shelf' ? h(ComicShelf, { boot }) : null,
    tab === 'history' ? h(ComicHistoryTab, { boot }) : null,
    detail ? h(ComicDetail, { ...detail, onClose: () => setDetail(null) }) : null,
  )
}

/* ================= 阅读历史（完整列表 tab） ================= */
function ComicHistoryTab({ boot }) {
  const history = boot?.comicHistory || []
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  if (!history.length) {
    return h(Empty, { icon: 'comic', title: '还没有阅读记录', hint: '打开任意一部漫画后会自动记录在这里（无需加入书架）' })
  }
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
    h('div', { style: { display: 'flex', alignItems: 'center' } },
      h('div', { style: { fontWeight: 600, fontSize: 14 } }, `阅读历史 ${history.length} 部`),
      h('div', { className: 'fh-spacer' }),
      h('button', { className: 'fh-chip-btn', onClick: () => setConfirmClear(true) }, '清空')),
    h('div', { className: 'fh-tiles' },
      history.map((c) => h('div', {
        key: `${c.sourceKey}:${c.comicId}`, className: 'fh-tile',
        onClick: () => actions.openComic({ sourceId: c.sourceKey, comicId: c.comicId, title: c.title, cover: c.cover || '', chapterIndex: null }),
      },
        h('div', { className: 'fh-tile-cover', style: { display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, position: 'relative' } },
          h('span', { style: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' } }, '📚'),
          c.cover ? h('img', { src: c.cover, loading: 'lazy', alt: '', style: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }, onError: (e) => { e.currentTarget.style.display = 'none' } }) : null),
        h('div', { className: 'fh-tile-title' }, c.title),
        h('div', { className: 'fh-tile-sub' }, c.chapterTitle || '继续阅读'),
        h('button', { className: 'fh-btn fh-btn-sm fh-btn-ghost', style: { alignSelf: 'flex-start' }, onClick: (e) => {
          e.stopPropagation()
          setConfirmDel(c)
        } }, '移除')))),
    confirmClear ? h(ConfirmModal, {
      title: '清空阅读历史', message: `确定删除全部 ${history.length} 条漫画阅读记录吗？该操作不可恢复。`,
      hint: '书架与收藏不受影响。', label: '清空',
      onClose: () => setConfirmClear(false),
      onConfirm: async () => { await api.op('data_clear', { scope: 'comicHistory' }); await actions.reload(); actions.toast('已清空阅读历史') },
    }) : null,
    confirmDel ? h(ConfirmModal, {
      title: '删除阅读记录', message: `确定删除《${confirmDel.title}》的阅读记录吗？`,
      hint: '书架不受影响；重新打开会再次记录。', label: '删除',
      onClose: () => setConfirmDel(null),
      onConfirm: async () => { await api.op('comic_history_remove', { sourceKey: confirmDel.sourceKey, comicId: confirmDel.comicId }); await actions.reload(); actions.toast(`已删除《${confirmDel.title}》的记录`) },
    }) : null,
  )
}

/* ================= 发现（默认 tab）：venera 源 explore 页 ================= */
function ComicExplore({ sources, onOpenDetail }) {
  const boot = getState().boot
  const lastComic = boot?.settings?.lastSource?.comic
  const [sourceId, setSourceId] = useState(lastComic && sources.some((s) => s.id === lastComic && s.enabled !== false) ? lastComic : (sources[0]?.id || ''))
  const [pages, setPages] = useState([]) // [{index, title, type}]
  const [pageIndex, setPageIndex] = useState(0)
  const [sections, setSections] = useState([]) // [{title, comics}]
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null) // 待删除的漫画源

  useEffect(() => {
    if (!sourceId) return
    let alive = true
    setPages([])
    setPageIndex(0)
    setSections([])
    setError(null)
    ;(async () => {
      try {
        const res = await api.get(`/comic/explore-list?sourceId=${sourceId}`)
        if (!alive) return
        setPages(res.pages || [])
        setPageIndex(0)
      } catch (err) {
        if (alive) setError(err.message)
      }
    })()
    return () => { alive = false }
  }, [sourceId])

  // 当前源被删除/禁用后自动滑到下一个可用源
  useEffect(() => {
    if (sourceId && !sources.some((s) => s.id === sourceId && s.enabled !== false)) {
      setSourceId(sources[0]?.id || '')
    }
  }, [sources]) // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async (p = 1) => {
    if (!sourceId || !pages[pageIndex]) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(`/comic/explore?sourceId=${sourceId}&index=${pages[pageIndex].index}&page=${p}`)
      const incoming = res.sections || []
      setSections((prev) => {
        if (p === 1) return incoming
        // 追加页：每分区标题标注页码后附加
        return [...prev, ...incoming.map((s) => ({ ...s, title: (s.title || '更多') + ` · P${p}` }))]
      })
      setPage(p)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [sourceId, pages, pageIndex])

  useEffect(() => { void load(1) }, [load])

  const total = sections.reduce((n, s) => n + s.comics.length, 0)

  return h('div', null,
    confirmDel ? h(ConfirmModal, {
      title: '删除漫画源', message: `确定删除漫画源「${confirmDel.name}」吗？`,
      hint: '该源将从设置的漫画源列表中一并移除，不可恢复（可重新导入）。', label: '删除',
      onClose: () => setConfirmDel(null),
      onConfirm: async () => {
        await api.op('comicsource_remove', { id: confirmDel.id })
        await actions.reload()
        actions.toast(`已删除漫画源「${confirmDel.name}」`)
      },
    }) : null,
    h('div', { className: 'fh-explore-split' },
    !sources.length ? h(Empty, {
      icon: 'comic', title: '还没有可用的漫画源',
      hint: 'FunHub 不内置漫画源：请自行寻找 venera（ComicSource）格式的漫画源脚本，到 设置 → 漫画源 以 URL 或本地文件导入',
      action: h(Btn, { kind: 'primary', onClick: () => actions.setView('settings', 'comicsource') }, '去导入漫画源'),
    }) : h('div', { className: 'fh-rss-side' },
      sources.map((s) => h('div', { key: s.id, style: { display: 'flex', alignItems: 'center', gap: 0 } },
        h('button', { className: `fh-side-item${sourceId === s.id ? ' is-on' : ''}`, style: { flex: 1, minWidth: 0 }, onClick: () => { setSourceId(s.id); void api.op('settings_save', { settings: { lastSource: { comic: s.id } } }).catch(() => {}) }, title: s.name },
          h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, s.name)),
        s.error ? h('span', { className: 'fh-chip', style: { color: 'var(--fh-danger)', fontSize: 10, flex: 'none' }, title: s.error }, '异常') : null,
        h('button', { className: 'fh-icon-btn', style: { width: 24, height: 24, flex: 'none' }, title: '删除此漫画源', onClick: () => setConfirmDel(s) }, h(Icon, { name: 'trash', size: 12 })))),
      h('div', { className: 'fh-muted', style: { fontSize: 11, marginTop: 6, paddingLeft: 10 } }, `${sources.length} 个源 · 无内容的直接删`)),
    h('div', { className: 'fh-rss-list' },
      pages.length > 1 ? h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 } },
        pages.map((p) => h('button', { key: p.index, className: `fh-chip-btn${pageIndex === p.index ? ' is-on' : ''}`, onClick: () => setPageIndex(p.index) }, p.title))) : null,
      h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 } },
        h(Btn, { size: 'sm', onClick: () => load(page + 1), disabled: loading || !pages.length }, loading ? '加载中…' : '下一页'),
        h('span', { className: 'fh-muted', style: { fontSize: 11.5 } }, sources.find((s) => s.id === sourceId)?.name || '')),
      error ? h(ErrorBox, { error, onRetry: () => load(1) }) : null,
      loading && !sections.length ? h(Loading, { text: '正在获取发现页…' }) : null,
      !loading && !total && !error && pages.length ? h(Empty, { icon: 'comic', title: '该源未返回内容', hint: '换个分类页试试；一直没内容就在左侧删掉这个源' }) : null,
      sections.filter((s) => s.comics.length).map((s) => h('div', { key: s.title || 'default', style: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 } },
        s.title ? h('div', { style: { fontWeight: 600, fontSize: 13.5, color: 'var(--fh-ink2)' } }, s.title) : null,
        h('div', { className: 'fh-tiles' },
          s.comics.map((c, i) => h('div', { key: `${c.id}:${i}`, className: 'fh-tile', onClick: () => onOpenDetail({ sourceId, comic: c }) },
            h('div', { className: 'fh-tile-cover', style: { display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, position: 'relative' } },
              h('span', { style: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' } }, '📚'),
              c.cover ? h('img', { src: c.cover, loading: 'lazy', alt: '', style: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }, onError: (e) => { e.currentTarget.style.display = 'none' } }) : null),
            h('div', { className: 'fh-tile-title' }, c.title),
            h('div', { className: 'fh-tile-sub' }, c.subtitle || c.tags?.slice(0, 2).join(' ') || '')))))))
    ))
}

function ComicDetail({ sourceId, comic, onClose }) {
  const [info, setInfo] = useState(comic)
  const [chapters, setChapters] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // 章节排序：默认正序，可切倒序（与阅读器目录共用记忆）
  const [desc, setDesc] = useState(() => { try { return localStorage.getItem('funhub.comic.chOrder') === 'desc' } catch { return false } })
  const flipOrder = () => setDesc((d) => {
    const next = !d
    try { localStorage.setItem('funhub.comic.chOrder', next ? 'desc' : 'asc') } catch { /* ignore */ }
    return next
  })

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [detailRes, chapterRes] = await Promise.all([
          api.get(`/comic/detail?sourceId=${sourceId}&comicId=${encodeURIComponent(comic.id)}`).catch(() => null),
          api.get(`/comic/chapters?sourceId=${sourceId}&comicId=${encodeURIComponent(comic.id)}`),
        ])
        if (!alive) return
        if (detailRes?.comic) setInfo(detailRes.comic)
        setChapters(chapterRes.chapters || [])
      } catch (err) {
        if (alive) setError(err.message)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [sourceId, comic.id])

  const openChapter = (index) => {
    actions.openComic({ sourceId, comicId: comic.id, title: info?.title || comic.title, cover: info?.cover || comic.cover || '', chapters, chapterIndex: index })
    onClose()
  }

  const groups = []
  for (const ch of chapters || []) {
    const last = groups[groups.length - 1]
    if (last && last.name === ch.group) last.items.push(ch)
    else groups.push({ name: ch.group, items: [ch] })
  }
  // 倒序：分组与组内章节都反转，最新一话排在最前
  const shownGroups = desc ? groups.slice().reverse().map((g) => ({ ...g, items: g.items.slice().reverse() })) : groups

  return h(Modal, { title: info?.title || comic.title || '漫画详情', onClose, width: 680 },
    loading ? h(Loading, null) : error ? h(ErrorBox, { error }) : h('div', { style: { display: 'flex', gap: 16 } },
      h('div', { style: { flex: 'none', display: 'flex', flexDirection: 'column', gap: 8 } },
        info?.cover || comic.cover ? h('img', { src: info?.cover || comic.cover, alt: '', style: { width: 128, height: 172, objectFit: 'cover', borderRadius: 10, background: 'var(--fh-panel-2)' }, onError: (e) => { e.currentTarget.style.visibility = 'hidden' } }) : null,
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
          h(Btn, { kind: 'primary', size: 'sm', onClick: () => openChapter(0) }, '开始阅读'),
          h(Btn, { size: 'sm', onClick: async () => {
            await api.op('comic_shelf_add', { comic: { sourceKey: sourceId, comicId: comic.id, title: info?.title || comic.title, subtitle: info?.subtitle || '', cover: info?.cover || comic.cover || '', description: info?.description || '' } })
            actions.toast('已加入漫画书架')
            await actions.reload()
          } }, '加入书架'),
          h(Btn, { size: 'sm', onClick: async () => {
            const r = await api.op('comic_fav_toggle', { comic: { sourceKey: sourceId, comicId: comic.id, title: info?.title || comic.title, cover: info?.cover || comic.cover || '' } })
            actions.toast(r.favorited ? '已收藏' : '已取消收藏')
            await actions.reload()
          } }, '收藏'))),
      h('div', { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 } },
        h('div', { className: 'fh-muted', style: { fontSize: 12 } }, [info?.subtitle, info?.status, chapters ? `${chapters.length} 章` : ''].filter(Boolean).join(' · ')),
        info?.tags?.length ? h('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap' } }, info.tags.slice(0, 6).map((t) => h('span', { key: t, className: 'fh-chip' }, t))) : null,
        h('div', { style: { fontSize: 12.5, color: 'var(--fh-ink2)', lineHeight: 1.7, maxHeight: 110, overflow: 'hidden' } },
          String(info?.description || comic.description || '').replace(/<[^>]*>/g, '').slice(0, 260)),
        h('div', { style: { display: 'flex', alignItems: 'center', marginTop: 4 } },
          h('div', { style: { fontWeight: 600, fontSize: 12.5, flex: 1 } }, `章节 ${chapters ? `${chapters.length} 话` : ''}`),
          h('button', { className: `fh-chip-btn${desc ? ' is-on' : ''}`, onClick: flipOrder, title: '切换章节排序' }, desc ? '倒序' : '正序')),
        h('div', { className: 'fh-chapter-list' },
          shownGroups.map((g) => h('div', { key: g.name, style: { display: 'flex', flexDirection: 'column' } },
            g.name ? h('div', { className: 'fh-comic-group' }, g.name) : null,
            g.items.map((ch) => h('button', { key: ch.id, className: 'fh-row', onClick: () => openChapter((chapters).indexOf(ch)) },
              h('span', { className: 't' }, ch.title)))),
          ),
        )),
    ),
  )
}

function ComicShelf({ boot }) {
  const comics = boot?.comics || []
  const favs = boot?.comicFavs || []
  const progress = boot?.comicProgress || {}
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null) // {c, isFav}
  const all = [...comics, ...favs.filter((f) => !comics.some((c) => c.comicId === f.comicId))]
  if (!all.length) {
    return h(Empty, { icon: 'comic', title: '书架是空的', hint: '搜索漫画后加入书架' })
  }
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
    h('div', { style: { display: 'flex', alignItems: 'center' } },
      h('div', { style: { fontWeight: 600, fontSize: 14 } }, `书架 ${all.length} 部`),
      h('div', { className: 'fh-spacer' }),
      h('button', { className: 'fh-chip-btn', onClick: () => setConfirmClear(true) }, '清空')),
    h('div', { className: 'fh-tiles' },
      all.map((c) => {
        const isFav = !comics.some((x) => x.comicId === c.comicId)
        return h('div', {
          key: `${c.sourceKey}:${c.comicId}`, className: 'fh-tile',
          onClick: () => actions.openComic({ sourceId: c.sourceKey, comicId: c.comicId, title: c.title, cover: c.cover || '', chapterIndex: null }),
        },
          h('div', { className: 'fh-tile-cover', style: { display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, position: 'relative' } },
            h('span', { style: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' } }, '📚'),
            c.cover ? h('img', { src: c.cover, loading: 'lazy', alt: '', style: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }, onError: (e) => { e.currentTarget.style.display = 'none' } }) : null),
          h('div', { className: 'fh-tile-title' }, c.title),
          h('div', { className: 'fh-tile-sub' }, progress[`${c.comicId}@${c.sourceKey}`]?.chapterTitle || '未开始'),
          h('button', { className: 'fh-btn fh-btn-sm fh-btn-ghost', style: { alignSelf: 'flex-start' }, onClick: (e) => {
            e.stopPropagation()
            setConfirmDel({ c, isFav })
          } }, '移除'))
      })),
    confirmClear ? h(ConfirmModal, {
      title: '清空书架', message: `确定移除书架上的全部 ${all.length} 部漫画吗？该操作不可恢复。`,
      hint: '将同时清空阅读进度与漫画收藏；阅读历史不受影响。', label: '清空书架',
      onClose: () => setConfirmClear(false),
      onConfirm: async () => { await api.op('data_clear', { scope: 'comicShelf' }); await actions.reload(); actions.toast('已清空书架') },
    }) : null,
    confirmDel ? h(ConfirmModal, {
      title: '移出书架', message: `确定把《${confirmDel.c.title}》移出书架吗？`,
      hint: '阅读进度一并清除；阅读历史保留。', label: '移除',
      onClose: () => setConfirmDel(null),
      onConfirm: async () => {
        if (confirmDel.isFav) await api.op('comic_fav_toggle', { comic: confirmDel.c })
        else await api.op('comic_shelf_remove', { sourceKey: confirmDel.c.sourceKey, comicId: confirmDel.c.comicId })
        await actions.reload(); actions.toast(`已移除《${confirmDel.c.title}》`)
      },
    }) : null,
  )
}

/* ================= 漫画阅读器 ================= */

export function ComicReader() {
  const session = getState().comic
  if (!session) return null
  return h(ComicReaderInner, { key: `${session.sourceId}:${session.comicId}`, session })
}

function ComicReaderInner({ session }) {
  const [chapters, setChapters] = useState(session.chapters || null)
  const [chapterIndex, setChapterIndex] = useState(session.chapterIndex ?? null)
  const [images, setImages] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState('scroll') // scroll | single
  const [pageIndex, setPageIndex] = useState(0)
  const [showChapters, setShowChapters] = useState(false)
  // 目录排序：默认正序，可切倒序（与详情页章节列表共用记忆）
  const [chDesc, setChDesc] = useState(() => { try { return localStorage.getItem('funhub.comic.chOrder') === 'desc' } catch { return false } })
  const flipChOrder = () => setChDesc((d) => {
    const next = !d
    try { localStorage.setItem('funhub.comic.chOrder', next ? 'desc' : 'asc') } catch { /* ignore */ }
    return next
  })
  // 关闭阅读器时轻量刷新 boot：漫画页「最近在看」与首页历史即时更新
  useEffect(() => () => { void actions.reload() }, [])
  const bodyRef = useRef(null)
  const boot = getState().boot
  const saved = boot?.comicProgress?.[`${session.comicId}@${session.sourceId}`]

  useEffect(() => {
    if (chapters) return
    let alive = true
    ;(async () => {
      try {
        const res = await api.get(`/comic/chapters?sourceId=${session.sourceId}&comicId=${encodeURIComponent(session.comicId)}`)
        if (!alive) return
        setChapters(res.chapters || [])
        if (!res.chapters?.length) {
          setError('此源没有返回章节：源接口可能变更，或该源网络不可达（被墙源需要在 设置 → 网络 · 代理 启用可用代理）')
          return
        }
        const savedIdx = saved ? res.chapters.findIndex((c) => c.id === saved.chapterId) : -1
        setChapterIndex(session.chapterIndex ?? (savedIdx >= 0 ? savedIdx : Math.max(0, res.chapters.length - 1)))
      } catch (err) {
        if (alive) setError(err.message)
      }
    })()
    return () => { alive = false }
  }, [session])

  useEffect(() => {
    if (chapterIndex == null || !chapters?.[chapterIndex]) return
    const chapter = chapters[chapterIndex]
    let alive = true
    setLoading(true)
    setError(null)
    setImages(null)
    setPageIndex(0)
    ;(async () => {
      try {
        const res = await api.get(`/comic/ep?sourceId=${session.sourceId}&comicId=${encodeURIComponent(session.comicId)}&epId=${encodeURIComponent(chapter.id)}`)
        if (!alive) return
        setImages(res.images || [])
        if (!res.images?.length) {
          setError('本章没有返回图片：源接口可能变更，或图片域名不可达（被墙源需要在 设置 → 网络 · 代理 启用可用代理）')
          return
        }
        bodyRef.current?.scrollTo({ top: 0 })
      } catch (err) {
        if (alive) setError(err.message)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    void api.op('comic_progress', { sourceKey: session.sourceId, comicId: session.comicId, chapterId: chapter.id, chapterTitle: chapter.title }).catch(() => {})
    void api.op('comic_history', { sourceKey: session.sourceId, comicId: session.comicId, title: session.title, cover: session.cover || '', chapterId: chapter.id, chapterTitle: chapter.title }).catch(() => {})
    return () => { alive = false }
  }, [chapterIndex, chapters, session.sourceId, session.comicId])

  const goChapter = (idx) => {
    if (idx < 0 || idx >= (chapters?.length || 0)) return
    setChapterIndex(idx)
    setShowChapters(false)
  }

  const goPage = useCallback((delta) => {
    setPageIndex((p) => {
      const nextP = p + delta
      if (nextP < 0) { goChapter((chapterIndex ?? 0) - 1); return 0 }
      if (images && nextP >= images.length) { goChapter((chapterIndex ?? 0) + 1); return 0 }
      return Math.max(0, Math.min(nextP, (images?.length || 1) - 1))
    })
  }, [images, chapterIndex, chapters?.length])

  useEffect(() => {
    if (mode !== 'single') return
    const onKey = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); goPage(-1) }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); goPage(1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, goPage])

  return h('div', { className: 'fh-comic-reader' },
    h('div', { className: 'fh-comic-bar' },
      h('button', { className: 'fh-icon-btn', onClick: () => actions.closeComic(), title: '返回' }, h(Icon, { name: 'back', size: 16 })),
      h('span', { className: 'fh-reader-title' }, `${session.title} · ${chapters?.[chapterIndex]?.title || ''}`),
      h('div', { className: 'fh-spacer' }),
      mode === 'single' ? h('span', { className: 'fh-muted', style: { fontSize: 11.5 } }, `${pageIndex + 1} / ${images?.length || '?'}`) : null,
      h('button', { className: `fh-chip-btn${mode === 'scroll' ? ' is-on' : ''}`, onClick: () => setMode('scroll') }, '滚动'),
      h('button', { className: `fh-chip-btn${mode === 'single' ? ' is-on' : ''}`, onClick: () => setMode('single') }, '单页'),
      h('button', { className: 'fh-icon-btn', title: '目录', onClick: () => setShowChapters(!showChapters) }, h(Icon, { name: 'list', size: 16 })),
    ),
    loading ? h('div', { className: 'fh-loading', style: { justifyContent: 'center', flex: 1 } }, h(Loading, { text: '加载章节图片…' })) : null,
    error ? h('div', { style: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 } }, h(ErrorBox, { error, onRetry: () => goChapter(chapterIndex) })) : null,
    images && mode === 'scroll' ? h('div', { className: 'fh-comic-body', ref: bodyRef },
      images.map((img, i) => h('img', { key: i, className: 'fh-comic-page', src: img.url, loading: 'lazy', alt: `第 ${i + 1} 页'` })),
      h('div', { style: { display: 'flex', gap: 10, padding: '20px 0 40px' } },
        h(Btn, { onClick: () => goChapter((chapterIndex ?? 0) - 1), disabled: !chapterIndex }, '上一章'),
        h(Btn, { kind: 'primary', onClick: () => goChapter((chapterIndex ?? 0) + 1), disabled: chapterIndex == null || chapterIndex >= (chapters?.length || 0) - 1 }, '下一章')),
    ) : null,
    images && mode === 'single' ? h('div', { className: 'fh-comic-body fh-comic-single' },
      h('div', { className: 'fh-comic-nav left', onClick: () => goPage(-1) }, h(Icon, { name: 'chevronL', size: 30 })),
      images[pageIndex] ? h('img', { src: images[pageIndex].url, alt: '' }) : null,
      h('div', { className: 'fh-comic-nav right', onClick: () => goPage(1) }, h(Icon, { name: 'chevronR', size: 30 })),
    ) : null,
    showChapters ? h('div', { style: { position: 'absolute', top: 44, right: 14, width: 340, maxHeight: '70%', zIndex: 20, background: 'var(--fh-panel)', border: '1px solid var(--fh-line)', borderRadius: 12, boxShadow: '0 16px 40px rgba(0,0,0,.35)', overflow: 'hidden', display: 'flex', flexDirection: 'column' } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--fh-line)', flex: 'none' } },
        h('span', { style: { fontWeight: 600, fontSize: 12.5, flex: 1 } }, `目录 ${chapters?.length || 0} 话`),
        h('button', { className: `fh-chip-btn${chDesc ? ' is-on' : ''}`, onClick: flipChOrder, title: '切换章节排序' }, chDesc ? '倒序' : '正序')),
      h('div', { className: 'fh-chapter-list' },
        (chapters ? (chDesc ? chapters.map((_, i) => chapters.length - 1 - i) : chapters.map((_, i) => i)) : []).map((i) =>
          h('button', { key: chapters[i].id, className: `fh-row${i === chapterIndex ? ' is-playing' : ''}`, onClick: () => goChapter(i) },
            h('span', { className: 't' }, chapters[i].title))))) : null,
  )
}
