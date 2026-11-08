// 统一收藏：跨频道收藏入口（plan §2.1）。
import { createElement as h } from 'react'
import { api } from './api.js'
import { actions, getState } from './store.js'
import { player } from './player.js'
import { Icon, Btn, Empty, fmtAgo } from './ui.jsx'

const TYPE_LABELS = { image: '图片', article: '文章', track: '歌曲', playlist: '歌单' }

export function FavoritesPage() {
  const boot = getState().boot
  const favorites = boot?.favorites || []
  const comicFavs = boot?.comicFavs || []

  const openArticle = (fav) => {
    const article = (boot?.rss?.articles || []).find((a) => a.id === fav.itemId)
    if (article) {
      actions.setView('rss')
      setTimeout(() => window.__FH_OPEN_ARTICLE__?.(article), 60)
    } else {
      actions.toast('文章已不在本地缓存，请刷新订阅')
    }
  }

  return h('div', { className: 'fh-page' },
    h('div', { className: 'fh-page-head' },
      h('div', { className: 'fh-page-title' }, '收藏'),
      h('div', { className: 'fh-spacer' }),
      h('span', { className: 'fh-page-sub' }, `共 ${favorites.length + comicFavs.length} 条`)),
    !favorites.length && !comicFavs.length ? h(Empty, {
      icon: 'star', title: '还没有收藏',
      hint: '在各频道点击 ♥ 收藏图片、文章、歌曲、漫画和小游戏',
    }) : h('div', { className: 'fh-rowlist' },
      comicFavs.map((c) => h('div', { key: c.id, className: 'fh-row', onClick: () => actions.openComic({ sourceId: c.sourceKey, comicId: c.comicId, title: c.title, chapterIndex: null }) },
        h('img', { src: c.cover, alt: '', style: { width: 30, height: 40, borderRadius: 4, objectFit: 'cover', flex: 'none', background: 'var(--fh-panel-2)' }, onError: (e) => { e.currentTarget.style.visibility = 'hidden' } }),
        h('span', { className: 't' }, c.title),
        h('span', { className: 's' }, '漫画'),
        h('button', { className: 'fh-icon-btn', onClick: async (e) => { e.stopPropagation(); await api.op('comic_fav_toggle', { comic: c }); await actions.reload() } }, h(Icon, { name: 'trash', size: 13 })))),
      favorites.map((f) => h('div', { key: f.id, className: 'fh-row', onClick: () => openFavorite(f) },
        h('span', { className: 'fh-mini-art', style: { width: 30, height: 30, fontSize: 14, borderRadius: 6 } }, iconFor(f.itemType)),
        h('span', { className: 't' }, f.meta?.title || f.meta?.name || f.itemId),
        h('span', { className: 's' }, `${TYPE_LABELS[f.itemType] || f.itemType} · ${fmtAgo(f.createdAt)}`),
        h('button', { className: 'fh-icon-btn', onClick: async (e) => { e.stopPropagation(); await api.op('fav_toggle', { itemType: f.itemType, itemId: f.itemId, meta: f.meta }); await actions.reload() } }, h(Icon, { name: 'trash', size: 13 })))),
    ),
  )
}

function iconFor(type) {
  return { image: '🖼', article: '📄', track: '🎵', game: '🎮', book: '📖', comic: '📚' }[type] || '⭐'
}

function openFavorite(f) {
  switch (f.itemType) {
    case 'image':
      actions.setView('gallery')
      actions.openGallery([f.meta], 0)
      break
    case 'article':
      openArticleFn(f)
      break
    case 'playlist':
      actions.setView('music')
      break
    case 'track':
      player.setQueue([f.meta], 0)
      actions.setPlayerUi('mini')
      break
    default:
      actions.toast('该收藏请到对应频道查看')
  }
}

function openArticleFn(fav) {
  const boot = getState().boot
  const article = (boot?.rss?.articles || []).find((a) => a.id === fav.itemId)
  if (article) {
    actions.setView('rss')
    setTimeout(() => window.__FH_OPEN_ARTICLE__?.(article), 60)
  } else {
    actions.toast('文章已不在本地缓存，请刷新订阅')
  }
}
