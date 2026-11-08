// 图片广场：瀑布流 / 搜索 / 全屏浏览 / 收藏。
import { useCallback, useEffect, useMemo, useRef, useState, createElement as h } from 'react'
import { createPortal } from 'react-dom'
import { api } from './api.js'
import { actions, getState } from './store.js'
import { Icon, Btn, Input, Select, Empty, Loading, ErrorBox, LazyImage } from './ui.jsx'

const IMAGE_SOURCES = [
  { value: 'bing', label: 'Bing 每日壁纸（免 Key）' },
  { value: 'picsum', label: 'Picsum（免 Key · 随机摄影）' },
  { value: 'wallhaven', label: 'Wallhaven（免 Key · 全年龄壁纸）' },
  { value: 'artic', label: '芝加哥艺术学院（免 Key · 公版艺术）' },
  { value: 'nasa', label: 'NASA 影像（免 Key · 太空）' },
  { value: 'wikimedia', label: 'Wikimedia Commons（免 Key）' },
  { value: 'pixiv', label: 'Pixiv 排行榜（免 Key）' },
  { value: 'boredpanda', label: 'Bored Panda（创意图集）' },
  { value: 'designboom', label: 'Designboom（建筑·产品）' },
  { value: 'mymodernmet', label: 'My Modern Met（艺术·摄影）' },
  { value: 'pexels', label: 'Pexels（需 Key）' },
  { value: 'unsplash', label: 'Unsplash（需 Key）' },
  { value: 'pixabay', label: 'Pixabay（需 Key）' },
]
const KEY_SOURCES = new Set(['pexels', 'unsplash', 'pixabay'])

/* ---------- JS 瀑布流：最短列分配 + 粘性放置 ----------
   CSS columns 会在图片加载/追加时重新平衡列，导致已排好的项跳列乱序；
   这里改为 JS 计算：每个新项落入当前最矮列，位置一旦确定不再变（resize 重排除外）。
   高度估算：优先源返回的 width/height，否则 1.3 兜底，加载完成后回填真实宽高比。 */
function MasonryWall({ items, minCol = 220, gap = 12, render }) {
  const ref = useRef(null)
  const [cols, setCols] = useState(1)
  const ratios = useRef(new Map())    // id -> 真实 h/w（img 加载后回填）
  const placement = useRef(new Map()) // "${cols}:${id}" -> 列号（粘性）

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const calc = () => setCols(Math.max(1, Math.min(5, Math.floor(el.clientWidth / minCol))))
    const ro = new ResizeObserver(calc)
    ro.observe(el)
    calc()
    return () => ro.disconnect()
  }, [minCol])

  const estRatio = (item) => {
    if (item.width && item.height && item.width > 0) return item.height / item.width
    return ratios.current.get(item.id) || 1.3
  }

  const columns = useMemo(() => {
    const arr = Array.from({ length: cols }, () => [])
    const hts = new Array(cols).fill(0)
    // 粘性：已放置的项保持原列，真实/估算高度累加到所在列
    for (const item of items) {
      const col = placement.current.get(cols + ':' + item.id)
      if (col != null && col < cols) hts[col] += estRatio(item) + gap / minCol
    }
    // 新项依次落入当前最矮列
    for (const item of items) {
      const key = cols + ':' + item.id
      let col = placement.current.get(key)
      if (col == null || col >= cols) {
        col = 0
        for (let i = 1; i < cols; i++) if (hts[i] < hts[col]) col = i
        placement.current.set(key, col)
        hts[col] += estRatio(item) + gap / minCol
      }
      arr[col].push(item)
    }
    return arr
  }, [items, cols]) // eslint-disable-line react-hooks/exhaustive-deps

  const recordRatio = (item, el) => {
    if (el?.naturalWidth > 0 && el?.naturalHeight > 0) {
      ratios.current.set(item.id, el.naturalHeight / el.naturalWidth)
    }
  }

  return h('div', { ref, style: { display: 'flex', gap: gap + 'px', alignItems: 'flex-start', width: '100%' } },
    columns.map((col, i) => h('div', { key: i, style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: gap + 'px' } },
      col.map((img) => render(img, (el) => recordRatio(img, el))))))
}

export function GalleryPage() {
  const boot = getState().boot
  const cfg = boot?.settings?.imageSources || {}
  const available = IMAGE_SOURCES.filter((s) => KEY_SOURCES.has(s.value)
    ? Boolean(cfg[s.value]?.apiKey) && cfg[s.value]?.enabled !== false
    : cfg[s.value]?.enabled !== false)
  const lastImg = boot?.settings?.lastSource?.image
  const [source, setSource] = useState(lastImg && (available.some((s) => s.value === lastImg) || IMAGE_SOURCES.some((s) => s.value === lastImg)) ? lastImg : (available[0]?.value || 'picsum'))
  const [query, setQuery] = useState('')
  const [images, setImages] = useState([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('feed')

  useEffect(() => {
    if (!available.some((s) => s.value === source)) setSource(available[0]?.value || 'picsum')
  }, [available, source])

  const load = useCallback(async (p = 1, qOverride) => {
    const q = (qOverride ?? query).trim()
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(`/image/feed?source=${source}&q=${encodeURIComponent(q)}&page=${p}`)
      setImages(p === 1 ? res.images : [...images, ...res.images])
      setPage(p)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [source, query, images])

  useEffect(() => { void load(1) }, [source])

  // 首页欢迎区全局搜索直达
  useEffect(() => {
    const q = actions.consumeSearch('gallery')
    if (q) { setTab('feed'); setQuery(q); void load(1, q) }
    // eslint-disable-line react-hooks/exhaustive-deps
  }, [])

  const favImages = (boot?.favorites || []).filter((f) => f.itemType === 'image').map((f) => f.meta)
  const list = tab === 'feed' ? images : favImages

  return h('div', { className: 'fh-page' },
    h('div', { className: 'fh-page-head' },
      h('div', { className: 'fh-page-title' }, '图片广场'),
      h('div', { className: 'fh-spacer' }),
      h('div', { style: { display: 'flex', gap: 8 } },
        h('button', { className: `fh-chip-btn${tab === 'feed' ? ' is-on' : ''}`, onClick: () => setTab('feed') }, '发现'),
        h('button', { className: `fh-chip-btn${tab === 'favorites' ? ' is-on' : ''}`, onClick: () => setTab('favorites') }, `收藏 ${favImages.length}`),
        h(Btn, { size: 'sm', onClick: () => actions.setView('settings', 'imagesource') }, '图片源'))),
    tab === 'feed' ? h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
      h(Select, { value: source, onChange: (v) => { setSource(v); void api.op('settings_save', { settings: { lastSource: { image: v } } }).catch(() => {}) }, options: (available.length ? available : IMAGE_SOURCES).map((s) => ({ value: s.value, label: s.label })) }),
      h(Input, { value: query, onChange: setQuery, onEnter: () => load(1),
        placeholder: source === 'pixiv' ? 'Pixiv 榜单：留空=日榜，可输入 周/月/新人/原创/男性向/女性向' : '搜索图片（如 nature / 人像 / 城市）…',
        style: { flex: 1, minWidth: 200 } }),
      h(Btn, { kind: 'primary', onClick: () => load(1), disabled: loading }, loading ? '加载中…' : '搜索')) : null,
    error ? h(ErrorBox, { error, onRetry: () => load(1) }) : null,
    loading && !list.length ? h(Loading, null) : null,
    !loading && !list.length && !error ? h(Empty, { icon: 'image', title: tab === 'favorites' ? '还没有收藏图片' : '没有找到图片', hint: tab === 'favorites' ? '在发现页收藏喜欢的图片' : '换个关键词试试' }) : null,
    list.length ? h(MasonryWall, {
      items: list,
      render: (img, onLoaded) => {
        const i = list.indexOf(img)
        return h('button', { key: img.id || i, className: 'fh-fall-item', onClick: () => {
          if (tab === 'feed') void api.op('image_seen', { image: img }).catch(() => {})
          actions.openGallery(list, i)
        } },
          h(LazyImage, { src: img.thumb || img.url, alt: img.title || '', onLoaded }),
          h('div', { className: 'fh-fall-cap' }, `${img.title || ''} ${img.author ? `· ${img.author}` : ''}`))
      },
    }) : null,
    tab === 'feed' && images.length ? h('div', { style: { display: 'flex', justifyContent: 'center' } },
      h(Btn, { onClick: () => load(page + 1), disabled: loading }, loading ? '加载中…' : '加载更多')) : null,
  )
}

/* ---------- 全屏看图 ---------- */
export function GalleryLightbox() {
  const view = getState().galleryView
  const [index, setIndex] = useState(view?.index ?? 0)
  const [bigLoading, setBigLoading] = useState(true)
  const boot = getState().boot
  const favIds = new Set((boot?.favorites || []).filter((f) => f.itemType === 'image').map((f) => f.itemId))
  useEffect(() => { setIndex(view?.index ?? 0); setBigLoading(true) }, [view])
  useEffect(() => { setBigLoading(true) }, [index])
  useEffect(() => {
    if (!view) return
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(view.images.length - 1, i + 1))
      if (e.key === 'Escape') actions.closeGallery()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view])
  if (!view) return null
  const img = view.images[index]
  if (!img) return null
  const favKey = img.id
  // portal 到 body：避免面板容器 transform 劫持 fixed 定位
  return createPortal(h('div', { className: 'fh-lightbox' },
    h('div', { className: 'fh-lightbox-main' },
      h('button', { className: 'fh-icon-btn', style: { position: 'absolute', left: 12, color: '#ddd' }, onClick: () => setIndex(Math.max(0, index - 1)), disabled: !index }, h(Icon, { name: 'chevronL', size: 26 })),
      bigLoading ? h('div', { className: 'fh-lightbox-loading' }, h(Loading, null)) : null,
      h('img', { src: img.url, alt: img.title || '', onLoad: () => setBigLoading(false), style: bigLoading ? { opacity: 0 } : null }),
      h('button', { className: 'fh-icon-btn', style: { position: 'absolute', right: 12, color: '#ddd' }, onClick: () => setIndex(Math.min(view.images.length - 1, index + 1)), disabled: index >= view.images.length - 1 }, h(Icon, { name: 'chevronR', size: 26 }))),
    h('div', { className: 'fh-lightbox-bar' },
      h('span', null, `${index + 1} / ${view.images.length}`),
      h('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, img.title || ''),
      img.author ? h('span', { className: 'fh-muted' }, `© ${img.author}`) : null,
      img.source ? h('span', { className: 'fh-chip' }, img.source) : null,
      h('button', { className: `fh-icon-btn${favIds.has(favKey) ? '' : ''}`, style: favIds.has(favKey) ? { color: 'var(--fh-danger)' } : null, title: '收藏', onClick: async () => {
        await api.op('fav_toggle', { itemType: 'image', itemId: img.id, meta: img })
        await actions.reload()
      } }, h(Icon, { name: 'heart', size: 17 })),
      h('button', { className: 'fh-icon-btn', title: '关闭', onClick: () => actions.closeGallery() }, h(Icon, { name: 'close', size: 17 }))),
  ), document.body)
}
