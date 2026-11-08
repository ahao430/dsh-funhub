// FunHub App Shell：侧栏频道导航 + 内容区 + 覆盖层（阅读器/漫画/看图/游戏）。
// 通过 useStore 订阅 store：引导数据 / 视图切换 / 覆盖层状态变化都会触发重渲染。
// 错误边界分级：主内容、每个覆盖层各自隔离，顶层边界作最后防线。
import { Component, createElement as h, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { actions, getState, subscribe } from './store.js'
import { player } from './player.js'
import { Icon, Loading, ErrorBox, useStore, ErrorBoundary } from './ui.jsx'
import { CSS } from './styles.js'
import { Home } from './home.jsx'
import { NovelPage, NovelReader } from './novel.jsx'
import { ComicPage, ComicReader } from './comic.jsx'
import { GalleryPage, GalleryLightbox } from './gallery.jsx'
import { MusicPage } from './music.jsx'
import { VideoPage } from './video.jsx'
import { GamesPage, GameStage } from './games.jsx'
import { RssPage } from './rss.jsx'
import { FavoritesPage } from './favorites.jsx'
import { SettingsPage } from './settings.jsx'
import { AiPage } from './ai.jsx'

const NAV = [
  { id: 'home', label: '首页', icon: 'home' },
  { id: 'novel', label: '小说', icon: 'book' },
  { id: 'comic', label: '漫画', icon: 'comic' },
  { id: 'gallery', label: '图片', icon: 'image' },
  { id: 'music', label: '音乐', icon: 'music' },
  { id: 'video', label: '影视', icon: 'film' },
  { id: 'games', label: '小游戏', icon: 'game' },
  { id: 'rss', label: 'RSS', icon: 'rss' },
  { id: 'favorites', label: '收藏', icon: 'star' },
  { id: 'ai', label: 'AI 助手', icon: 'search' },
  { id: 'settings', label: '设置', icon: 'gear' },
]

/* 顶层最后防线：任何漏网的渲染异常都不会黑屏整个面板。 */
class RenderBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return h('div', { className: 'fh-root', style: { padding: 20, overflow: 'auto' } },
        h(ErrorBox, { error: `FunHub 渲染出错：${this.state.error?.message || this.state.error}`, onRetry: () => this.setState({ error: null }) }))
    }
    return this.props.children
  }
}

export function AppShell() {
  const snap = useStore({ getState, subscribe })

  useEffect(() => {
    void actions.refresh().then((boot) => {
      applyAccent(boot?.settings?.accent)
      applyTheme(boot?.settings?.theme)
      if (boot?.settings?.player || boot?.playerQueue) {
        player.restore(boot?.settings?.player, boot?.playerQueue)
      }
    })
  }, [])

  /* 亮暗主题：类打到 html 上（portal 浮层在 body 外，也能吃到变量覆盖） */
  useEffect(() => {
    applyTheme(snap.boot?.settings?.theme)
  }, [snap.boot?.settings?.theme])

  /* Mini 播放器激活时给 body 打标：面板内底部工具条（阅读器/看图/游戏）让位 */
  useEffect(() => {
    document.body.classList.toggle('fh-has-mini', snap.playerUi === 'mini')
    return () => document.body.classList.remove('fh-has-mini')
  }, [snap.playerUi])

  if (!snap.ready) {
    return h('div', { className: 'fh-root' },
      h('style', null, CSS),
      h('div', { style: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' } },
        h(Loading, { text: '正在打开 FunHub…' })))
  }

  const sidebar = h('nav', { className: 'fh-side', 'aria-label': 'FunHub 导航' },
    h('div', { className: 'fh-side-title' }, 'FUNHUB'),
    NAV.map((item) => h('button', {
      key: item.id,
      className: `fh-side-item${snap.view === item.id && !isOverlay(snap) ? ' is-on' : ''}`,
      onClick: () => actions.setView(item.id),
    }, h(Icon, { name: item.icon, size: 16 }), h('span', { className: 'fh-side-label' }, item.label))))

  const main = h(ErrorBoundary, { label: '页面' },
    h('main', { className: `fh-main${snap.playerUi === 'mini' ? ' has-mini' : ''}` },
      h(CurrentPage, { snap })))

  // 氛围背景（首页欢迎区 + 卡片），可关闭；各槽位 URL 可在 设置 → 外观 自定义/选预设。
  // 预置素材按亮暗主题自动切换（xxx-bg.webp 暗色 / xxx-bg-light.webp 亮色）；用户自定义上传跨主题共用。
  const noAtmo = snap.boot?.settings?.atmosphere === false
  const bgs = snap.boot?.settings?.backgrounds || {}
  const light = snap.boot?.settings?.theme === 'light'
  const bgVars = {}
  for (const slot of ['home', 'music', 'novel', 'rss', 'games']) {
    const v = bgs[slot]
    if (!v) continue
    const isPreset = v.startsWith('/funhub/api/asset/') && /-bg\.webp$/.test(v)
    bgVars[`--fh-bg-${slot}`] = `url("${light && isPreset ? v.replace('-bg.webp', '-bg-light.webp') : v}")`
  }
  return h(RenderBoundary, null,
    h('div', { className: `fh-root${noAtmo ? ' fh-no-atmo' : ''}`, style: bgVars },
      h('style', null, CSS),
      snap.error
        ? h('div', { style: { padding: 16 } }, h(ErrorBox, { error: `连接宿主失败：${snap.error}`, onRetry: () => actions.refresh() }))
        : h('div', { className: 'fh-shell' }, sidebar, main),
      snap.novel ? h(ErrorBoundary, { label: '阅读器', key: `novel:${snap.novel.sourceId}:${snap.novel.bookId}` }, h(NovelReader)) : null,
      snap.comic ? h(ErrorBoundary, { label: '漫画阅读器', key: `comic:${snap.comic.sourceId}:${snap.comic.comicId}` }, h(ComicReader)) : null,
      snap.game ? h(ErrorBoundary, { label: '游戏', key: `game:${snap.game.id}` }, h(GameStage)) : null,
      snap.galleryView ? h(ErrorBoundary, { label: '看图', key: 'gallery' }, h(GalleryLightbox)) : null,
      snap.toast ? createPortal(h('div', { className: 'fh-toast' }, snap.toast.text), document.body) : null,
    ))
}

/** 应用强调色（空串 = 跟随 DSH）。 */
export function applyAccent(color) {
  const root = document.documentElement
  if (color) root.style.setProperty('--fh-accent-override', color)
  else root.style.removeProperty('--fh-accent-override')
}

/** 应用亮暗主题（'light' = 浅色，其余 = 深色）。 */
export function applyTheme(theme) {
  document.documentElement.classList.toggle('fh-light', theme === 'light')
}

function isOverlay(snap) {
  return Boolean(snap.novel || snap.comic || snap.game)
}

function CurrentPage({ snap }) {
  switch (snap.view) {
    case 'novel': return h(NovelPage)
    case 'comic': return h(ComicPage)
    case 'gallery': return h(GalleryPage)
    case 'music': return h(MusicPage)
    case 'video': return h(VideoPage)
    case 'games': return h(GamesPage)
    case 'rss': return h(RssPage)
    case 'favorites': return h(FavoritesPage)
    case 'ai': return h(AiPage)
    case 'settings': return h(SettingsPage)
    default: return h(Home)
  }
}
