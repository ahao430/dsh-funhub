// 客户端渲染冒烟：在 Node 里用 react-dom/server 渲染 AppShell 与全部频道页面，
// 用假引导数据驱动「就绪态」，任何渲染异常都会让本测试失败（对应「黑屏」类回归）。
import assert from 'node:assert/strict'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const esbuild = await import('esbuild')
const require_ = createRequire(import.meta.url)

// 1. 内存打包一个测试入口：暴露 store 内部 + 全部页面组件
const result = await esbuild.build({
  stdin: {
    contents: `
      export { actions, getState, subscribe } from ${JSON.stringify(new URL('../src/client/store.js', import.meta.url).pathname)}
      export { AppShell } from ${JSON.stringify(new URL('../src/client/app.jsx', import.meta.url).pathname)}
      export { Home, openNovelFromShelf } from ${JSON.stringify(new URL('../src/client/home.jsx', import.meta.url).pathname)}
      export { NovelPage, NovelReader, BookTile } from ${JSON.stringify(new URL('../src/client/novel.jsx', import.meta.url).pathname)}
      export { ComicPage } from ${JSON.stringify(new URL('../src/client/comic.jsx', import.meta.url).pathname)}
      export { GalleryPage, GalleryLightbox } from ${JSON.stringify(new URL('../src/client/gallery.jsx', import.meta.url).pathname)}
      export { MusicPage } from ${JSON.stringify(new URL('../src/client/music.jsx', import.meta.url).pathname)}
      export { VideoPage } from ${JSON.stringify(new URL('../src/client/video.jsx', import.meta.url).pathname)}
      export { GamesPage, GameStage } from ${JSON.stringify(new URL('../src/client/games.jsx', import.meta.url).pathname)}
      export { RssPage } from ${JSON.stringify(new URL('../src/client/rss.jsx', import.meta.url).pathname)}
      export { FavoritesPage } from ${JSON.stringify(new URL('../src/client/favorites.jsx', import.meta.url).pathname)}
      export { SettingsPage, ClearSourcesModal } from ${JSON.stringify(new URL('../src/client/settings.jsx', import.meta.url).pathname)}
      export { PlayerRoot } from ${JSON.stringify(new URL('../src/client/player-ui.jsx', import.meta.url).pathname)}
      export { parseLrc, player } from ${JSON.stringify(new URL('../src/client/player.js', import.meta.url).pathname)}
    `,
    resolveDir: new URL('.', import.meta.url).pathname,
  },
  loader: { '.jsx': 'jsx' },
  bundle: true,
  format: 'esm',
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  write: false,
  logLevel: 'silent',
})

mkdirSync('node_modules/.render-test', { recursive: true })
writeFileSync('node_modules/.render-test/bundle.mjs', result.outputFiles[0].text)

// 2. 假引导数据（覆盖各页面读取的全部字段）
const fakeBoot = {
  version: 1,
  settings: {
    theme: 'dark',
    imageSources: { picsum: { enabled: true }, pexels: { enabled: false, apiKey: '' }, unsplash: { enabled: false, apiKey: '' } },
    player: { mode: 'sequence', volume: 0.8, iconPos: null },
    video: {
      emby: [{ id: 'e1', url: 'https://emby.x.io', userId: 'u1', name: 'HomeEmby' }],
    },
    reader: { fontSize: 18, lineHeight: 1.9, theme: 'dark', margin: 0.12, mode: 'scroll', autoNext: true },
  },
  layout: [
    { type: 'novel', size: '2x1', show: true, source: 'recent' },
    { type: 'comic', size: '1x1', show: true, source: 'recent' },
    { type: 'gallery', size: '1x1', show: true, source: 'favorites' },
    { type: 'music', size: '1x1', show: true, source: 'recent' },
    { type: 'games', size: '2x1', show: true, source: 'recent' },
    { type: 'rss', size: '1x1', show: false, source: 'latest' },
  ],
  favorites: [{ id: 'f1', itemType: 'image', itemId: 'img-1', meta: { id: 'img-1', url: 'https://x/i.png', thumb: 'https://x/i.png', title: '测试图', author: 'a', source: 'picsum' }, createdAt: Date.now() }],
  shelf: [{ bookId: '42', sourceId: 'gutenberg', title: '测试书', author: '甲', cover: '', addedAt: Date.now() }],
  readingProgress: { 42: { chapterIndex: 1, offset: 0, ratio: 0.6, updatedAt: Date.now() } },
  novelHistory: [{ bookId: '42', sourceId: 'gutenberg', title: '测试书', author: '甲', cover: '', chapterIndex: 1, chapterTitle: '第2部分', updatedAt: Date.now() }],
  comicHistory: [{ sourceKey: 'cs1', comicId: 'c1', title: '测试漫A', cover: '', chapterId: 'e1', chapterTitle: '第1话', updatedAt: Date.now() }],
  comicFavs: [], comicProgress: {}, comics: [],
  imageHistory: [],
  tracks: [{ id: 't1', title: '测试歌', artist: '乙', cover: '', sourceId: 'wy', musicInfo: { id: '1' } }],
  playlists: [{ id: 'pl1', name: '我的喜欢', trackIds: ['t1'], createdAt: Date.now(), updatedAt: Date.now() }],
  playbackHistory: [{ trackId: 't1', track: { id: 't1', title: '测试歌', artist: '乙' }, at: Date.now() }],
  rss: { feeds: [{ id: 'fd1', title: '测试订阅', url: 'https://x/feed', category: '', lastFetchedAt: 0 }], articles: [{ id: 'a1', feedId: 'fd1', title: '测试文章', link: 'https://x/1', summary: '摘要', content: '<p>正文</p>', publishedAt: Date.now(), read: false }] },
  gameRecords: { g2048: { bestScore: 1024, lastScore: 512, playCount: 3, lastPlayedAt: Date.now() } },
  gameFavs: ['minesweeper'],
  bookSources: [{ id: 'bs1', name: '测试书源', url: 'https://x/book', group: '测试', enabled: true, compatible: null, issues: [], addedAt: Date.now() }], lxSources: [],
  comicSources: [{ id: 'cs1', name: '测试漫画源', key: 'test', version: '1.0', enabled: true, error: null, addedAt: Date.now() }],
  music: { quality: '320k', channel: 'wy' },
}

// 3. 桩掉 fetch（actions.refresh 用）与 localStorage（悬浮图标位置用）
const realFetch = globalThis.fetch
globalThis.fetch = async (url) => {
  const u = String(url)
  if (u.includes('/funhub/api/state')) {
    return { ok: true, json: async () => ({ ok: true, state: fakeBoot }) }
  }
  if (u.includes('/novel/popular')) {
    return { ok: true, json: async () => ({ ok: true, books: [{ bookId: '1', title: '推荐书A', author: '作者A', cover: '', subjects: ['x'] }], next: true }) }
  }
  if (u.includes('/novel/book/') && u.includes('/content')) {
    return { ok: true, json: async () => ({ ok: true, text: '第一章内容段落一。\n\n第一章内容段落二。' }) }
  }
  if (u.includes('/music2/toplist')) {
    return { ok: true, json: async () => ({ ok: true, name: '热歌榜', items: [{ id: 'wy-1', channel: 'wy', name: '推荐歌A', singer: '歌手A', cover: '', musicInfo: { id: '1' } }] }) }
  }
  if (u.includes('/comic/explore-list')) {
    return { ok: true, json: async () => ({ ok: true, pages: [{ index: 0, title: '热门', type: 'multiPartPage' }] }) }
  }
  if (u.includes('/rss/recommend')) {
    return { ok: true, json: async () => ({ ok: true, recommendations: [{ category: '资讯', title: '测试源', url: 'https://x/feed', desc: '测试' }] }) }
  }
  if (u.includes('/comic/explore')) {
    return { ok: true, json: async () => ({ ok: true, sections: [{ title: 'Popular', comics: [{ id: 'c1', title: '测试漫A', cover: '', tags: [] }] }] }) }
  }
  return { ok: false, status: 404, json: async () => ({ ok: false, error: 'stub' }) }
}
globalThis.localStorage = {
  getItem: () => null, setItem: () => {}, removeItem: () => {},
}

const { actions, getState, subscribe, AppShell, Home, NovelPage, NovelReader, BookTile, ComicPage, GalleryPage, GalleryLightbox, MusicPage, GamesPage, GameStage, RssPage, FavoritesPage, SettingsPage, ClearSourcesModal, PlayerRoot, parseLrc, player, VideoPage } = await import('../node_modules/.render-test/bundle.mjs')
const { renderToString } = await import('react-dom/server')
const { createElement: h } = await import('react')

const results = []
const render = (name, el) => {
  try {
    const html = renderToString(el)
    results.push(`✓ ${name}（${html.length}B）`)
    return html
  } catch (err) {
    results.push(`✗ ${name}: ${err.message}`)
    return null
  }
}

/* 首帧（ready=false 加载态） */
render('AppShell 加载态', h(AppShell))

/* 就绪态 + 全部页面 */
await actions.refresh()
assert.equal(getState().ready, true)
assert.ok(getState().boot?.layout?.length === 6)

render('AppShell 就绪态', h(AppShell))
render('Home', h(Home))
render('NovelPage', h(NovelPage))
/* 书源结果瓦片：legado 形状 {name, coverUrl} 也要显示书名（回归：曾显示成空标题只剩作者行） */
{
  const html = render('BookTile（书源 name 形状）', h(BookTile, { book: { bookId: 'u1', name: '斗破苍穹', author: '天蚕土豆', coverUrl: '' } }))
  assert.ok(html.includes('斗破苍穹') && !html.includes('undefined'), '书源瓦片应显示书名')
  const html2 = render('BookTile（公版书 title 形状）', h(BookTile, { book: { bookId: '42', title: '傲慢与偏见', author: 'Austen', cover: '' } }))
  assert.ok(html2.includes('傲慢与偏见'))
}
actions.openNovel({ sourceId: 'gutenberg', bookId: '42', title: '测试书', author: '甲' })
render('阅读器（滚动模式·带ratio进度）', h(NovelReader))
/* 自动切章移除回归：SSR 不跑 effect，内容级断言不可行 → 直接校验源码契约 */
{
  const src = readFileSync(new URL('../src/client/novel.jsx', import.meta.url), 'utf8')
  assert.ok(!src.includes('autoNext'), '不应再有自动切章逻辑（autoNext）')
  assert.ok(src.includes('fh-reader-chapnav'), '应有章末上一章/下一章导航（fh-reader-chapnav）')
}
render('阅读器（翻页模式设置）', (getState().boot.settings.reader.mode = 'page', h(NovelReader)))
actions.closeNovel()
render('ComicPage', h(ComicPage))
render('GalleryPage', h(GalleryPage))
render('GalleryLightbox（空）', h(GalleryLightbox))
render('MusicPage', h(MusicPage))
render('GamesPage', h(GamesPage))
render('VideoPage（Emby 有源态）', h(VideoPage))
render('RssPage', h(RssPage))
render('FavoritesPage', h(FavoritesPage))
render('SettingsPage', h(SettingsPage))
render('PlayerRoot（hidden）', h(PlayerRoot))
// 全屏播放器（左右分栏 + 歌词 + 队列抽屉）：stub Audio，注入队列后渲染
globalThis.Audio = class { constructor() { this.volume = 1 } addEventListener() {} removeEventListener() {} pause() {} play() {} setAttribute() {} removeAttribute() {} load() {} }
player.setQueue([{ id: 'wy-1', channel: 'wy', title: '测试歌', artist: '测试人', cover: '', musicInfo: { id: '1' } }], 0)
await new Promise((r) => setTimeout(r, 50))
actions.setPlayerUi('fullscreen')
render('全屏播放器（左右分栏+宽歌词）', h(PlayerRoot))
actions.setPlayerUi('mini')

/* 视图切换 + 覆盖层开合重渲染 */
render('AppShell 设置视图', (actions.setView('settings'), h(AppShell)))
render('AppShell AI 助手页', (actions.setView('ai'), h(AppShell)))
for (const sec of ['booksource', 'lxsource', 'comicsource', 'imagesource', 'video', 'network', 'layout', 'data', 'about', 'appearance']) {
  actions.setView('settings', sec)
  render(`设置分区: ${sec}`, h(SettingsPage))
}
render('快捷入口直达（store 分区状态）', (actions.setView('settings', 'comicsource'), h(AppShell)))
/* 清空按钮：书源 / 漫画源 / 影视源分区有源时应渲染「清空全部」与「检测清理失效源」入口（确认弹窗走 portal，无法 SSR） */
{
  actions.setView('settings', 'booksource')
  const html = render('书源分区（含清空/检测按钮）', h(SettingsPage))
  assert.ok(html.includes('清空全部'), '书源分区应含「清空全部」按钮')
  assert.ok(html.includes('检测清理失效源'), '书源分区应含「检测清理失效源」按钮')
  actions.setView('settings', 'comicsource')
  const html2 = render('漫画源分区（含清空/检测按钮）', h(SettingsPage))
  assert.ok(html2.includes('清空全部'), '漫画源分区应含「清空全部」按钮')
  assert.ok(html2.includes('检测清理失效源'), '漫画源分区应含「检测清理失效源」按钮')
  actions.setView('settings', 'video')
  const html3 = render('影视源分区（含清空/检测按钮）', h(SettingsPage))
  assert.ok(html3.includes('清空全部'), '影视源分区应含「清空全部」按钮')
  assert.ok(html3.includes('检测连通性'), '影视源分区应含「检测连通性」按钮')
  assert.ok(!html3.includes('TVBox'), '影视源分区不应再有 TVBox 字样')
}
render('游戏 overlay: 2048', (actions.openGame('g2048'), h(AppShell)))
render('游戏 overlay: 扫雷', (actions.openGame('minesweeper'), h(AppShell)))
render('游戏 overlay: 数独', (actions.openGame('sudoku'), h(AppShell)))
render('游戏 overlay: 俄罗斯方块', (actions.openGame('tetris'), h(AppShell)))
render('游戏 overlay: 翻翻乐', (actions.openGame('memory'), h(AppShell)))
render('游戏 overlay: 贪吃蛇', (actions.openGame('snake'), h(AppShell)))
render('游戏 overlay: 五子棋', (actions.openGame('gomoku'), h(AppShell)))
render('游戏 overlay: 推箱子', (actions.openGame('sokoban'), h(AppShell)))
render('AppShell 收藏视图', (actions.openGame(null), actions.setView('favorites'), h(AppShell)))
actions.setView('home')

/* LRC 解析 */
{
  const lines = parseLrc('[00:01.5]第一行\n[00:11.20][01:10]重复时间标签\n[ar:歌手]（元数据行忽略）')
  assert.equal(lines.length, 3)
  assert.equal(lines[0].time, 1.5)
  assert.equal(lines[1].text, '重复时间标签')
  console.log('✓ parseLrc（3 行，多时间标签展开）')
}

globalThis.fetch = realFetch

console.log(results.join('\n'))
const failed = results.filter((r) => r.startsWith('✗')).length
console.log(failed ? `\n${failed} 项失败` : '\n全部渲染通过')
process.exit(failed ? 1 : 0)
