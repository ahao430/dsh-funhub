// 书源 / 漫画源 / Emby 清空 op 语义验证：清空计数、只清目标数组、其他数据不动。
import assert from 'node:assert/strict'
import { OPS } from '../src/host/ops.js'

const base = () => ({
  bookSources: [],
  comicSources: [],
  novelHistory: [],
  comicHistory: [],
  comics: [],
  comicFavs: [],
  settings: { video: { emby: [] } },
})

/* 书源：add → clear 计数正确、数组空、书架历史保留 */
{
  const s = base()
  const r1 = OPS.booksource_add(s, { source: { bookSourceName: '源A', bookSourceUrl: 'https://a.example.com' } })
  const r2 = OPS.booksource_add(s, { source: { bookSourceName: '源B', bookSourceUrl: 'https://b.example.com' } })
  assert.equal(r1.added, true)
  assert.equal(r2.added, true)
  OPS.novel_history(s, { bookId: 'b1', title: '书' })
  const cleared = OPS.booksource_clear(s)
  assert.equal(cleared.removed, 2, '返回删除数量')
  assert.equal(s.bookSources.length, 0, '书源已清空')
  assert.equal(s.novelHistory.length, 1, '阅读历史不受影响')
  // 再清一次：幂等，removed=0
  assert.equal(OPS.booksource_clear(s).removed, 0)
}

/* 漫画源：clear 后漫画收藏 / 历史 / 书架不动 */
{
  const s = base()
  OPS.comicsource_add(s, { script: 'x', info: { name: '漫源', key: 'mk' } })
  OPS.comicsource_add(s, { script: 'y', info: { name: '漫源2', key: 'mk2' } })
  OPS.comic_history(s, { sourceKey: 'mk', comicId: 'c1', title: '漫' })
  OPS.comic_shelf_add(s, { comic: { sourceKey: 'mk', comicId: 'c1', title: '漫' } })
  OPS.comic_fav_toggle(s, { comic: { sourceKey: 'mk', comicId: 'c1', title: '漫' } })

  const cleared = OPS.comicsource_clear(s)
  assert.equal(cleared.removed, 2)
  assert.equal(s.comicSources.length, 0, '漫画源已清空')
  assert.equal(s.comicHistory.length, 1, '漫画历史不受影响')
  assert.equal(s.comics.length, 1, '漫画书架不受影响')
  assert.equal(s.comicFavs.length, 1, '漫画收藏不受影响')
  assert.equal(OPS.comicsource_clear(s).removed, 0, '幂等')
}

/* 清空书源不影响漫画源，反之亦然（两个数组互相独立） */
{
  const s = base()
  OPS.booksource_add(s, { source: { bookSourceUrl: 'https://a.example.com' } })
  OPS.comicsource_add(s, { script: 'x', info: { name: 'M' } })
  OPS.booksource_clear(s)
  assert.equal(s.comicSources.length, 1, '清书源不动漫画源')
  OPS.comicsource_clear(s)
  assert.equal(s.bookSources.length, 0)
}

/* 影视源：仅 Emby（TVBox 已移除） */
{
  const s = base()
  OPS.video_emby_add(s, { server: { url: 'https://emby.example.com/', apiKey: 'k', userId: 'u', name: 'E' } })
  OPS.video_emby_add(s, { server: { url: 'https://emby2.example.com', apiKey: 'k2', userId: 'u2', name: 'E2' } })
  assert.equal(s.settings.video.emby.length, 2)
  const cleared = OPS.video_emby_clear(s)
  assert.equal(cleared.removed, 2, '清空计数')
  assert.equal(s.settings.video.emby.length, 0)
  assert.equal(OPS.video_emby_clear(s).removed, 0, '幂等')
}

console.log('源清空 op 语义验证全部通过')
